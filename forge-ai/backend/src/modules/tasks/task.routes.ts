import { Router } from 'express'
import archiver from 'archiver'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import simpleGit from 'simple-git'
import { requireAuth } from '../../middleware/auth.middleware'
import { resolveTeamOwner, getEffectiveUserId } from '../../middleware/teamContext.middleware'
import { Task } from './task.model'
import { Repository } from '../repository/repository.model'
import { User } from '../users/user.model'
import { enqueueJob } from '../../lib/workers'
import { isPublicHttpUrl, resolveSiteUrl } from '../../lib/siteImport'
import { auditSite } from '../../lib/siteAudit'
import { writeEnhancementReport } from '../../lib/enhancementReport'
import { checkQuota } from '../../middleware/usage.middleware'
import {
  detectAutoPlatform, detectGitHubRemote, getEnvToken, PLATFORMS_NEEDING_TOKEN,
  addRenderDomain, listRenderDomains, verifyRenderDomain, removeRenderDomain, dnsRecordFor,
} from '../../lib/deployers'
import { resolveAttachments } from '../../lib/imageAttachments'
import { createProvider } from '../ai/ai.factory'
import { VALID_PALETTE_IDS } from '../../lib/designPacks'


const router = Router()
router.use(requireAuth)
router.use(resolveTeamOwner)

// Fix single file
router.post('/fix-file', async (req, res) => {
  const user = req.user as any
  const { repositoryId, filePath } = req.body

  const repo = await Repository.findOne({ _id: repositoryId, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })

  const task = await Task.create({
    userId: getEffectiveUserId(req),
    repositoryId,
    type: 'fix_file',
    metadata: { filePath },
  })

  await enqueueJob('fix-file', {
    taskId: task._id.toString(),
    repositoryId,
    userId: getEffectiveUserId(req).toString(),
    localPath: repo.localPath,
    filePath,
    aiProvider: user.aiProvider,
    type: 'fix_file',
  })

  res.status(201).json({ task })
})


// List tasks
router.get('/', async (req, res) => {
  const { repositoryId, limit = 50 } = req.query
  const filter: any = { userId: getEffectiveUserId(req) }
  if (repositoryId) filter.repositoryId = repositoryId
  const tasks = await Task.find(filter)
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .populate('repositoryId', 'fullName name')
  res.json({ tasks })
})

// Get single task (returns full changes array)
router.get('/:id', async (req, res) => {
  const user = req.user as any
  const task = await Task.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!task) return res.status(404).json({ message: 'Not found' })
  res.json({ task })
})

// Enhance a user's raw prompt into a detailed technical specification
router.post('/enhance-prompt', async (req, res) => {
  const { prompt, stack, name } = req.body
  if (!prompt?.trim()) return res.status(400).json({ message: 'prompt is required' })

  try {
    const enhancerName = process.env.ENHANCER_AI_PROVIDER
    const providerName = process.env.BUILDER_AI_PROVIDER ?? 'gemini'
    const ai = createProvider(enhancerName ?? providerName)

    const isMern = stack === 'mern'
    const systemPrompt = `You are a senior product manager and technical architect. Expand a brief website description into a detailed, specific build specification. Keep the same intent but add concrete detail: exact pages and their sections, key features, data that needs to be stored${isMern ? ', API endpoints, Mongoose models' : ''}, user flows, and any edge cases worth handling. Write in plain prose paragraphs — no bullet lists, no markdown headers. Aim for 150–220 words. Sound like a real PRD, not a template.`

    const userMsg = `Enhance this website prompt into a detailed spec:\n\n"${prompt.trim()}"${name ? `\n\nSite name: ${name}` : ''}\n\nStack: ${isMern ? 'Full-stack MERN (MongoDB, Express, React, Node)' : 'Static HTML/CSS/JS website'}`

    const result = await ai.chat([{ role: 'user', content: userMsg }], systemPrompt)
    res.json({ enhanced: result.content.trim() })
  } catch (err: any) {
    console.error('[enhance-prompt]', err.message)
    res.status(500).json({ message: 'Enhancement failed — try again' })
  }
})

// Get the build report (PRD, design brief, plan) for a build-site task
router.get('/:id/build-report', async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!task) return res.status(404).json({ message: 'Not found' })
  const report = (task.metadata as any)?.buildReport
  if (!report) return res.status(404).json({ message: 'No build report for this task' })
  res.json(report)
})


// ═══ REBUILD PROPOSAL ════════════════════════════════════════
router.post('/rebuild-proposal', checkQuota('reviews'), async (req, res) => {
  const user = req.user as any
  const { repositoryId } = req.body
  const repo = await Repository.findOne({ _id: repositoryId, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })
  if (!repo.localPath) return res.status(400).json({ message: 'Repository not cloned yet' })

  const task = await Task.create({
    userId: getEffectiveUserId(req),
    repositoryId,
    type: 'rebuild_proposal',
    metadata: {},
  })

  await enqueueJob('rebuild-proposal', {
    taskId: task._id.toString(),
    repositoryId,
    userId: getEffectiveUserId(req).toString(),
    localPath: repo.localPath,
    repoName: repo.fullName,
    aiProvider: user.aiProvider,
    type: 'rebuild_proposal',
  })

  res.status(201).json({ task })
})

// ═══ BLITZ DEPLOY ═══════════════════════════════════════════
// Analyzes any repository and generates everything needed to deploy
// in seconds: Dockerfile, docker-compose, CI/CD workflow, platform
// configs (Vercel/Railway/Render), .env.example, and a DEPLOY.md guide.
//
// ── 1. ADD to task.routes.ts (before export default) ──
// Blitz Deploy — quota-gated: free 3/mo, pro 100/mo, team unlimited
router.post('/blitz-deploy', checkQuota('deploys'), async (req, res) => {
  const user = req.user as any
  const { repositoryId, platform, token } = req.body

  // checkQuota already counted this deploy; give it back if we bail out early
  const refundDeploy = () => User.updateOne({ _id: user._id }, { $inc: { 'usage.deploys': -1 } })

  const repo = await Repository.findOne({ _id: repositoryId, userId: getEffectiveUserId(req) })
  if (!repo) { await refundDeploy(); return res.status(404).json({ message: 'Repository not found' }) }
  if (repo.status !== 'ready' || !repo.localPath) { await refundDeploy(); return res.status(400).json({ message: 'Repository is not ready' }) }

  // Dashboards (source: 'data') are ALREADY hosted from the backend's own
  // /dashboards/{userId}/{name} static route — Render/Vercel would need a
  // GitHub URL that doesn't exist. Point the user at the live URL instead of
  // failing with a cryptic "unfetchable repo" error.
  if (repo.source === 'data') {
    await refundDeploy()
    const publicUrl = `/dashboards/${user._id.toString()}/${repo.name}/index.html`
    return res.status(400).json({
      code: 'DASHBOARD_ALREADY_HOSTED',
      message: `Dashboards don't need a Blitz Deploy — they're served directly from Forge AI at ${publicUrl}. Share that URL, or set a refresh schedule from the dashboard's page.`,
      hostedUrl: publicUrl,
    })
  }

  // Resolve 'auto' to a concrete platform so we know which token is needed
  let resolvedPlatform = platform && platform !== 'auto' ? platform : detectAutoPlatform(repo.localPath)

  // Render and Railway build from a real GitHub repo — verify we have one.
  // This covers both local-folder repos and ForgeAI-built sites that were never
  // pushed to GitHub (build-site sets source='github' but may skip the GitHub
  // push when credentials are missing, leaving fullName as a bare name with no
  // owner prefix and no 'origin' remote in the local git folder).
  let repoFullName = repo.fullName
  let repoBranch = repo.defaultBranch ?? 'main'
  let needsGitHubPush = false

  if (['render', 'railway'].includes(resolvedPlatform)) {
    // A real GitHub fullName always has the form "owner/repo". Anything else
    // (a local-folder synthetic name, a bare site name) means no real remote.
    const hasRealFullName = /^[^/]+\/[^/]+$/.test(repoFullName)
    if (!hasRealFullName || repo.source === 'local') {
      // Try to detect the real remote from the local git config
      const remote = repo.localPath ? await detectGitHubRemote(repo.localPath) : null
      if (remote) {
        repoFullName = remote.fullName
        if (remote.branch && !remote.branch.startsWith('forgeai/')) repoBranch = remote.branch
      } else {
        // No usable GitHub remote.
        if (platform && platform !== 'auto') {
          // Explicit render/railway choice: push to GitHub automatically if the
          // user has a GitHub token connected; otherwise tell them what's missing.
          const effectiveUserId = getEffectiveUserId(req)
          const ghUser = await User.findById(effectiveUserId).select('+githubAccessToken')
          if (ghUser?.githubAccessToken) {
            needsGitHubPush = true   // task processor will push before deploying
          } else {
            await refundDeploy()
            return res.status(400).json({
              code: 'GITHUB_NOT_CONNECTED',
              message: `${resolvedPlatform === 'render' ? 'Render' : 'Railway'} builds from a GitHub repository and this project isn't on GitHub yet. Connect your GitHub account in Settings so Blitz Deploy can push it automatically, or switch to Vercel — it uploads files directly without GitHub.`,
            })
          }
        } else {
          // 'auto' with no remote → Vercel direct-upload (no GitHub needed)
          resolvedPlatform = 'vercel'
        }
      }
    }
  } else if (repo.source === 'local' && repo.localPath) {
    // Non-GitHub platforms with a local folder: still try to update branch from git
    const remote = await detectGitHubRemote(repo.localPath)
    if (remote) {
      repoFullName = remote.fullName
      if (remote.branch && !remote.branch.startsWith('forgeai/')) repoBranch = remote.branch
    }
  }

  // Token resolution by plan:
  //   free/pro — clients deploy with their OWN platform token (prompted once, then saved)
  //   team    — fully managed: ForgeAI's server-wide token, zero setup
  let deployToken: string | undefined
  let deployName = repo.name
  if (PLATFORMS_NEEDING_TOKEN.has(resolvedPlatform)) {
    const fullUser = await User.findById(user._id).select(
      '+deployTokens.vercel +deployTokens.railway +deployTokens.render',
    )
    deployToken = token || fullUser?.deployTokens?.[resolvedPlatform as 'vercel' | 'railway' | 'render']
    if (!deployToken && fullUser?.plan === 'team') {
      deployToken = getEnvToken(resolvedPlatform)
      // Shared account: suffix project names per user to avoid collisions
      if (deployToken) deployName = `${repo.name}-${user._id.toString().slice(-5)}`
    }
    if (!deployToken) {
      await refundDeploy()
      return res.status(400).json({
        code: 'TOKEN_REQUIRED',
        platform: resolvedPlatform,
        message: `Connect your ${resolvedPlatform} account: paste an API token to deploy`,
      })
    }
    if (token && fullUser) {
      fullUser.set(`deployTokens.${resolvedPlatform}`, token)
      await fullUser.save()
    }
  }

  const task = await Task.create({
    userId: getEffectiveUserId(req),
    repositoryId,
    type: 'blitz_deploy',
    status: 'pending',
    metadata: { platform: resolvedPlatform },
  })

  await enqueueJob('blitz-deploy', {
    taskId: task._id.toString(),
    repositoryId,
    userId: getEffectiveUserId(req).toString(),
    localPath: repo.localPath,
    platform: resolvedPlatform,
    deployToken,
    repoFullName,
    repoName: deployName,
    branch: repoBranch,
    isLocal: repo.source === 'local',
    needsGitHubPush,
    aiProvider: user.aiProvider,
    type: 'blitz_deploy',
  })

  res.status(201).json({ task })
})


// ═══ AI WEBSITE BUILDER ════════════════════════════════════
// Lovable-style: describe a website → AI generates it → new GitHub repo →
// deployable with Blitz Deploy like any other repository.
router.post('/build-site', checkQuota('fixes'), async (req, res) => {
  const user = req.user as any
  let { prompt, name, stack, mongoUri, style, paletteId, importUrl, mode, analyticsProvider, analyticsId, addons } = req.body
  prompt += ' Generate a complete website with all necessary files Ensure the code is well-structured and ready for deployment and the ui and styling should be outstanding.The website should have atleast four pages and the home page should atleast ahve five sections.'

  if (!prompt?.trim()) return res.status(400).json({ message: 'Describe the website you want to build' })

  // 'static' = plain HTML/CSS/JS; 'mern' = MongoDB + Express + React + Node.
  // Auto-upgrade to MERN when the prompt clearly describes an APP with backend
  // features (auth, user profiles, database records, messaging, dashboards,
  // e-commerce, etc.) — a "dating site" or "task manager" shipped as static
  // HTML has no login/no data/no interactivity, which is not what the user
  // asked for. The user's explicit `stack` choice still wins if they set one.
  const backendSignals = /\b(login|log in|sign ?up|sign ?in|register|auth|account|user profile|profile page|dashboard|admin panel|messaging|chat|message board|comment|post(s|ing)?|feed|match(ing|es)?|swipe|dating|social network|marketplace|listing|booking|reservation|order|cart|checkout|payment|subscription|todo|task manager|kanban|crud|database|save data|store data|submit form|user data|members? area|forum)\b/i
  const explicitStack = stack === 'mern' || stack === 'static' ? stack : null
  const autoDetectedNeedsBackend = !explicitStack && backendSignals.test(String(prompt ?? ''))
  const siteStack: 'static' | 'mern' = explicitStack ?? (autoDetectedNeedsBackend ? 'mern' : 'static')

  // Optional theme vibe that steers the design director (on top of the
  // automatic industry-matching). Anything else → 'auto' (no extra steering).
  const siteStyle = ['minimal', 'bold', 'elegant'].includes(String(style)) ? String(style) : 'auto'
  // Optional user-chosen color palette — overrides the AI-generated palette.
  const sitePaletteId = VALID_PALETTE_IDS.includes(String(paletteId ?? '')) ? String(paletteId) : undefined

  // Optional: rebuild an existing brand site from its real content. Only public
  // http(s) URLs are accepted (isPublicHttpUrl blocks private/loopback hosts).
  const rawImport = String(importUrl ?? '').trim()
  const normalizedImport = rawImport && !/^https?:\/\//i.test(rawImport) ? `https://${rawImport}` : rawImport
  if (normalizedImport && !isPublicHttpUrl(normalizedImport)) {
    return res.status(400).json({ message: 'That website address is not valid or not publicly reachable.' })
  }

  // ── Existing-site rebuild ──
  // Only one option: Claude-controlled rebuild. Keeps the client's HTML/content
  // exactly, throws away their stylesheet(s), and Claude writes a completely
  // new design. The promise: it will always look better than the original.
  // The audit still runs so the report can show the score we started from,
  // but there is no longer an enhance/rebuild fork.
  const siteMode = 'rebuild' as const
  let siteAudit: any
  if (normalizedImport) {
    siteAudit = await auditSite(normalizedImport)
    if (!siteAudit) {
      return res.status(422).json({
        message: 'Could not read that website — it may block automated access or render entirely with JavaScript. Build a new site from a description instead.',
      })
    }
    if (siteAudit.verdict === 'perfect' && !req.body?.force) {
      return res.status(409).json({
        code: 'SITE_ALREADY_GOOD',
        audit: siteAudit,
        message: `This site scores ${siteAudit.score}/10 — ${siteAudit.headline}. Rebuilding it risks making it worse. Confirm to proceed anyway.`,
      })
    }
  }

  // Optional MongoDB connection string for MERN builds — the app works
  // without one (API routes just stay disabled until it's configured)
  const dbUri = siteStack === 'mern' ? String(mongoUri ?? '').trim() : ''
  if (dbUri && !/^mongodb(\+srv)?:\/\/\S+$/.test(dbUri)) {
    return res.status(400).json({ message: 'That does not look like a MongoDB connection string (mongodb:// or mongodb+srv://). Leave it empty to add one later.' })
  }

  const siteName = String(name ?? '')
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
    || `forgeai-site-${Date.now().toString(36)}`

  const validAddons = ['whatsapp', 'leads', 'seo', 'booking', 'reviews', 'chatbot']
  const siteAddons = Array.isArray(addons) ? addons.filter((a: string) => validAddons.includes(a)) : []

  const repo = await Repository.create({
    userId: getEffectiveUserId(req),
    githubId: -Date.now(), // synthetic until the real GitHub repo is created
    name: siteName,
    fullName: siteName,
    description: `AI-built: ${prompt.slice(0, 140)}`,
    language: siteStack === 'mern' ? 'JavaScript' : 'HTML',
    private: false,
    defaultBranch: 'main',
    cloneUrl: 'pending',
    source: 'github', // ForgeAI-managed folder — cleaned up on delete
    status: 'cloning',
    addons: siteAddons,
  })

  const task = await Task.create({
    userId: getEffectiveUserId(req),
    repositoryId: repo._id,
    type: 'build_site',
    status: 'pending',
    metadata: {
      prompt, siteName, stack: siteStack, style: siteStyle,
      importUrl: normalizedImport || undefined, mode: siteMode,
      autoUpgradedToMern: autoDetectedNeedsBackend || undefined,
    },
    // Surface WHY the stack was chosen so the UI can show "we detected auth/messaging in your prompt so we're building a MERN app instead of a static site"
    logs: autoDetectedNeedsBackend
      ? [{ level: 'info', message: `🧠 Your prompt describes app features (login, profile, messaging, etc.) that need a backend — building as MERN (React + Express + MongoDB) instead of a static site. To force a static site anyway, add \`stack: "static"\` to your request.`, timestamp: new Date() }]
      : [],
  })

  await enqueueJob('build-site', {
    taskId: task._id.toString(),
    repositoryId: repo._id.toString(),
    userId: getEffectiveUserId(req).toString(),
    prompt: prompt.trim(),
    siteName,
    stack: siteStack,
    style: siteStyle,
    paletteId: sitePaletteId,
    importUrl: normalizedImport || undefined,
    mode: siteMode,
    audit: siteAudit, // already computed — the pipeline reuses it instead of re-crawling
    mongoUri: dbUri || undefined, // job data only — never in task.metadata (shown in the UI)
    analyticsProvider: analyticsProvider || undefined,
    analyticsId: analyticsId || undefined,
    aiProvider: user.aiProvider,
    type: 'build_site',
  })

  res.status(201).json({ task, repository: repo })
})

// ═══ FORGE AGENT ═══════════════════════════════════════════
// Claude Code-style autonomous session: the AI gets filesystem + terminal
// tools and iterates on the workspace until the instruction is done.
router.post('/agent', checkQuota('fixes'), async (req, res) => {
  const user = req.user as any
  const { repositoryId, instruction, images } = req.body

  if (!instruction?.trim() && !images?.length) return res.status(400).json({ message: 'instruction is required' })

  const repo = await Repository.findOne({ _id: repositoryId, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })
  if (repo.status !== 'ready' || !repo.localPath) {
    return res.status(400).json({ message: 'Workspace is not ready' })
  }

  // OCR-first attachments: text becomes part of the instruction; text-free
  // images (design mockups, screenshots) go to the vision model directly
  const { ocrText, dataUrls } = resolveAttachments(images, user._id.toString())
  const fullInstruction = `${(instruction ?? '').trim()}${ocrText}`.trim()

  const task = await Task.create({
    userId: getEffectiveUserId(req),
    repositoryId,
    type: 'agent',
    status: 'pending',
    metadata: { instruction: fullInstruction, imageCount: images?.length ?? 0 },
  })

  await enqueueJob('agent', {
    taskId: task._id.toString(),
    repositoryId,
    userId: getEffectiveUserId(req).toString(),
    localPath: repo.localPath,
    instruction: fullInstruction,
    imageDataUrls: dataUrls,
    aiProvider: user.aiProvider,
    type: 'agent',
  })

  res.status(201).json({ task })
})

// ═══ REVERT ═══════════════════════════════════════════════
// Undo everything a task changed: each file gets its pre-task content back,
// and files the task created are deleted. One-click safety net for bad
// agent sessions.
router.post('/:id/revert', async (req, res) => {
  const user = req.user as any
  const task = await Task.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!task) return res.status(404).json({ message: 'Not found' })
  if (!task.changes?.length) return res.status(400).json({ message: 'This task has no file changes to revert' })
  if (task.status === 'running' || task.status === 'pending') {
    return res.status(400).json({ message: 'Stop the task before reverting' })
  }

  const repo = await Repository.findById(task.repositoryId)
  if (!repo?.localPath || !fs.existsSync(repo.localPath)) {
    return res.status(400).json({ message: 'Workspace folder no longer exists' })
  }

  const rootAbs = path.resolve(repo.localPath)
  let reverted = 0
  const skipped: string[] = []

  for (const change of task.changes as any[]) {
    const abs = path.resolve(rootAbs, change.path)
    if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) { skipped.push(change.path); continue }
    try {
      if (change.truncated) {
        // Stored "before" was cut to fit the DB — restoring it would corrupt the file
        skipped.push(`${change.path} (original too large to restore)`)
        continue
      }
      if (!change.before) {
        // File was created by this task → remove it
        if (fs.existsSync(abs)) fs.rmSync(abs, { force: true })
      } else {
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.writeFileSync(abs, change.before, 'utf-8')
      }
      reverted++
    } catch (err: any) {
      skipped.push(`${change.path} (${err.message})`)
    }
  }

  task.logs.push({
    level: 'info',
    message: `↩️ Reverted ${reverted} file(s)${skipped.length ? ` — skipped: ${skipped.join(', ')}` : ''}`,
    timestamp: new Date(),
  } as any)
  await task.save()
  res.json({ reverted, skipped })
})

// Stop a running agent session
router.post('/:id/stop', async (req, res) => {
  const user = req.user as any
  const task = await Task.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!task) return res.status(404).json({ message: 'Not found' })
  if (task.status !== 'running' && task.status !== 'pending') {
    return res.status(400).json({ message: 'Task is not running' })
  }
  const { cancelAgentTask } = await import('../agent/agent.runner')
  cancelAgentTask(task._id.toString())
  res.json({ message: 'Stop requested' })
})

// Fix Workspace
router.post('/fix-workspace', async (req, res) => {
  const user = req.user as any
  const { repositoryId } = req.body

  const repo = await Repository.findOne({ _id: repositoryId, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })
  if (repo.status !== 'ready') return res.status(400).json({ message: 'Repository is not ready' })

  const task = await Task.create({
    userId: getEffectiveUserId(req),
    repositoryId,
    type: 'fix_workspace',
    status: 'pending',
  })

  const job = await enqueueJob('fix-workspace', {
    taskId: task._id.toString(),
    repositoryId,
    userId: getEffectiveUserId(req).toString(),
    localPath: repo.localPath,
    aiProvider: user.aiProvider,
    type: 'fix_workspace',
  })

  task.jobId = job.id
  await task.save()

  res.status(201).json({ task })
})



// Test fix with injected errors (no Python service needed)
router.post('/test-fix', async (req, res) => {
  const user = req.user as any
  const { repositoryId, errors } = req.body

  const repo = await Repository.findOne({ _id: repositoryId, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })

  const task = await Task.create({
    userId: getEffectiveUserId(req),
    repositoryId,
    type: 'fix_workspace',
    status: 'pending',
  })

  await enqueueJob('fix-workspace', {
    taskId: task._id.toString(),
    repositoryId,
    userId: getEffectiveUserId(req).toString(),
    localPath: repo.localPath,
    aiProvider: user.aiProvider,
    type: 'fix_workspace',
    injectedErrors: errors ?? [],
  })

  res.status(201).json({ task })
})

// Create PR — pushes local branch then opens PR
router.post('/:id/create-pr', async (req, res) => {
  const user = req.user as any
  const task = await Task.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!task || task.status !== 'completed') {
    return res.status(400).json({ message: 'Task not complete' })
  }

  const repo = await Repository.findById(task.repositoryId)
  const fullUser = await User.findById(user._id).select('+githubAccessToken')
  if (!repo || !fullUser?.githubAccessToken) {
    return res.status(400).json({ message: 'Missing repository or GitHub token' })
  }
  if (!repo.localPath) {
    return res.status(400).json({ message: 'Repository not cloned locally' })
  }

  const taskShort = task._id.toString().slice(-6)
  const branchName = `forgeai/fix-${taskShort}`
  const ghHeaders = {
    Authorization: `token ${fullUser.githubAccessToken}`,
    Accept: 'application/vnd.github+json',
  }
  const prBody = [
    '## ForgeAI Automated Fix',
    '',
    task.summary ?? 'Automated fixes applied by ForgeAI.',
    '',
    '### Files Changed',
    ...(task.changes?.map((c: any) => `- \`${c.path}\` (+${c.additions}/-${c.deletions})`) ?? []),
    '',
    '---',
    '*Generated by ForgeAI*',
  ].join('\n')

  try {
    // ── Path A: local disk exists — use git directly ──────────────────────
    if (repo.localPath && fs.existsSync(repo.localPath)) {
      const git = simpleGit(repo.localPath)
      const authRemote = `https://${fullUser.githubAccessToken}@github.com/${repo.fullName}.git`

      const branches = await git.branchLocal()
      if (!branches.all.includes(branchName)) {
        await git.checkoutLocalBranch(branchName)
        await git.add('.')
        const status = await git.status()
        if (status.staged.length > 0) {
          await git.commit(`ForgeAI: Auto-fix ${task.changes?.length ?? 0} file(s)`)
        }
      } else {
        await git.checkout(branchName)
      }

      if (fs.existsSync(path.join(repo.localPath!, '.git', 'shallow'))) {
        try { await git.fetch([authRemote, '--unshallow']) } catch { /* already full */ }
      }
      await git.push(authRemote, branchName, ['--force'])
    } else {
      // ── Path B: ephemeral disk was wiped — use GitHub API ─────────────
      // 1. Get default branch SHA
      const base = repo.defaultBranch ?? 'main'
      const { data: refData } = await axios.get(
        `https://api.github.com/repos/${repo.fullName}/git/refs/heads/${base}`,
        { headers: ghHeaders },
      )
      const baseSha: string = refData.object.sha

      // 2. Create blobs for every changed file
      const blobs = await Promise.all(
        (task.changes ?? [])
          .filter((c: any) => !c.truncated && c.after != null)
          .map(async (c: any) => {
            const { data: blob } = await axios.post(
              `https://api.github.com/repos/${repo.fullName}/git/blobs`,
              { content: Buffer.from(c.after).toString('base64'), encoding: 'base64' },
              { headers: ghHeaders },
            )
            return { path: c.path, mode: '100644', type: 'blob', sha: blob.sha }
          }),
      )

      if (!blobs.length) {
        return res.status(400).json({ message: 'No non-truncated file changes to push' })
      }

      // 3. Create tree on top of base
      const { data: baseCommit } = await axios.get(
        `https://api.github.com/repos/${repo.fullName}/git/commits/${baseSha}`,
        { headers: ghHeaders },
      )
      const { data: tree } = await axios.post(
        `https://api.github.com/repos/${repo.fullName}/git/trees`,
        { base_tree: baseCommit.tree.sha, tree: blobs },
        { headers: ghHeaders },
      )

      // 4. Create commit
      const { data: commit } = await axios.post(
        `https://api.github.com/repos/${repo.fullName}/git/commits`,
        {
          message: `ForgeAI: Auto-fix ${task.changes?.length ?? 0} file(s)`,
          tree: tree.sha,
          parents: [baseSha],
        },
        { headers: ghHeaders },
      )

      // 5. Create or force-update the branch ref
      try {
        await axios.post(
          `https://api.github.com/repos/${repo.fullName}/git/refs`,
          { ref: `refs/heads/${branchName}`, sha: commit.sha },
          { headers: ghHeaders },
        )
      } catch {
        await axios.patch(
          `https://api.github.com/repos/${repo.fullName}/git/refs/heads/${branchName}`,
          { sha: commit.sha, force: true },
          { headers: ghHeaders },
        )
      }
    }

    // ── Create the PR (same for both paths) ───────────────────────────────
    const { data } = await axios.post(
      `https://api.github.com/repos/${repo.fullName}/pulls`,
      {
        title: `ForgeAI: Auto-fix (${taskShort})`,
        body: prBody,
        head: branchName,
        base: repo.defaultBranch ?? 'main',
      },
      { headers: ghHeaders },
    )

    res.json({ url: data.html_url, pr: data.number })
  } catch (err: any) {
    console.error('[pr]', err.response?.data ?? err.message)
    const msg =
      err.response?.data?.errors?.[0]?.message ??
      err.response?.data?.message ??
      err.message ??
      'PR creation failed'
    res.status(500).json({ message: msg })
  }
})

// Download changes as zip
router.get('/:id/download', async (req, res) => {
  const user = req.user as any
  const task = await Task.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!task || !task.changes.length) return res.status(404).json({ message: 'No changes' })

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename=forge-changes-${task._id.toString().slice(-6)}.zip`)

  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.pipe(res)
  for (const change of task.changes) {
    archive.append(change.after, { name: change.path })
  }
  await archive.finalize()
})

// ─── AI Code Review ───────────────────────────────────────
router.post('/review', checkQuota('reviews'), async (req, res) => {
  const user = req.user as any
  const { repositoryId } = req.body

  const repo = await Repository.findOne({ _id: repositoryId, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })

  const task = await Task.create({
    userId: getEffectiveUserId(req), repositoryId, type: 'review', status: 'pending',
  })

  await enqueueJob('review', {
    taskId: task._id.toString(), repositoryId,
    userId: getEffectiveUserId(req).toString(), localPath: repo.localPath,
    aiProvider: user.aiProvider, type: 'review',
  })

  res.status(201).json({ task })
})

// ─── Generate Tests ───────────────────────────────────────
router.post('/generate-tests', checkQuota('fixes'), async (req, res) => {
  const user = req.user as any
  const { repositoryId, filePath } = req.body

  const repo = await Repository.findOne({ _id: repositoryId, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })

  const task = await Task.create({
    userId: getEffectiveUserId(req), repositoryId, type: 'generate_tests',
    status: 'pending', metadata: { filePath },
  })

  await enqueueJob('generate-tests', {
    taskId: task._id.toString(), repositoryId,
    userId: getEffectiveUserId(req).toString(), localPath: repo.localPath,
    filePath, aiProvider: user.aiProvider, type: 'generate_tests',
  })

  res.status(201).json({ task })
})

// ─── Security Scan ────────────────────────────────────────
router.post('/security-scan', checkQuota('reviews'), async (req, res) => {
  const user = req.user as any
  const { repositoryId } = req.body

  const repo = await Repository.findOne({ _id: repositoryId, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })

  const task = await Task.create({
    userId: getEffectiveUserId(req), repositoryId, type: 'security_scan', status: 'pending',
  })

  await enqueueJob('security-scan', {
    taskId: task._id.toString(), repositoryId,
    userId: getEffectiveUserId(req).toString(), localPath: repo.localPath,
    aiProvider: user.aiProvider, type: 'security_scan',
  })

  res.status(201).json({ task })
})

// ═══ PATCH SITE (Edit-After-Generate) ═══════════════════════
// Send a chat instruction to refine a built site without full regeneration.
// The agent patches only the relevant files then re-deploys if the site is live.
router.post('/patch-site', checkQuota('fixes'), async (req, res) => {
  const user = req.user as any
  const { repositoryId, instruction } = req.body

  if (!instruction?.trim()) return res.status(400).json({ message: 'instruction is required' })

  const repo = await Repository.findOne({ _id: repositoryId, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })
  if (!repo.localPath) return res.status(400).json({ message: 'Site not built yet' })

  const task = await Task.create({
    userId: getEffectiveUserId(req),
    repositoryId,
    type: 'agent',
    status: 'pending',
    metadata: { instruction: instruction.trim(), patchMode: true },
  })

  await enqueueJob('agent', {
    taskId: task._id.toString(),
    repositoryId,
    userId: getEffectiveUserId(req).toString(),
    localPath: repo.localPath,
    instruction: `You are editing a website that was already built. Make only the changes the user asks for — do NOT rewrite the whole site.\n\nUser request: ${instruction.trim()}`,
    aiProvider: user.aiProvider,
    type: 'agent',
  })

  res.status(201).json({ task })
})

// ─── Website audit ─────────────────────────────────────────
// Score an existing site out of 10 and recommend leave-it / enhance / rebuild,
// so a client conversation starts from evidence rather than opinion.
router.post('/audit', async (req, res) => {
  const raw = String(req.body?.url ?? '').trim()
  const url = raw && !/^https?:\/\//i.test(raw) ? `https://${raw}` : raw
  if (!url || !isPublicHttpUrl(url)) {
    return res.status(400).json({ message: 'Enter a valid public website address, e.g. brandname.com' })
  }
  try {
    const audit = await auditSite(url)
    if (!audit) {
      // Say WHY — "couldn't read it" alone gives the user nothing to act on.
      const probe = await resolveSiteUrl(url)
      const message = probe.html
        ? 'That page loaded but had almost no readable content — it is likely rendered entirely with JavaScript, which cannot be scored automatically.'
        : `Could not reach that site: ${probe.reason ?? 'the request failed'}.`
      return res.status(422).json({ message, reason: probe.reason })
    }
    res.json({ audit })
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? 'Audit failed' })
  }
})

/** Downloadable PDF for a client: what their old site scored and what changed. */
router.get('/report/:repositoryId', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.repositoryId, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })

  const task = await Task.findOne({
    repositoryId: repo._id, userId: getEffectiveUserId(req), type: 'build_site',
    'metadata.enhancements': { $exists: true, $ne: [] },
  }).sort({ createdAt: -1 })
  if (!task) {
    return res.status(404).json({ message: 'No enhancement report for this site — reports are generated when a site is built in Enhance mode.' })
  }

  const md = (task.metadata ?? {}) as any
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${repo.name}-enhancement-report.pdf"`)
  writeEnhancementReport(res, {
    siteName: md.audit?.siteName ?? repo.name,
    sourceUrl: md.importUrl,
    liveUrl: (repo as any).deployState?.render?.url,
    audit: md.audit,
    enhancements: md.enhancements ?? [],
    generatedAt: (task as any).createdAt,
  })
})

// ─── Custom domains ────────────────────────────────────────
// Point a client's own domain (brand.com) at their deployed site. Render issues
// the TLS certificate automatically once DNS resolves, so the only manual step
// is the DNS record — which we return for the client to add at their registrar.

/** Shared setup: the repo, its Render service id + host, and a usable token. */
async function renderDomainContext(req: any, res: any) {
  const user = req.user as any
  const { repositoryId, token } = req.body ?? {}
  const id = repositoryId ?? req.params.repositoryId
  const repo = await Repository.findOne({ _id: id, userId: getEffectiveUserId(req) })
  if (!repo) { res.status(404).json({ message: 'Repository not found' }); return null }

  const state = (repo as any).deployState?.render
  if (!state?.serviceId) {
    res.status(400).json({ message: 'Deploy this site to Render first — then you can connect a custom domain.' })
    return null
  }

  const fullUser = await User.findById(user._id).select('+deployTokens.render')
  let deployToken: string | undefined = token || fullUser?.deployTokens?.render
  if (!deployToken && fullUser?.plan === 'team') deployToken = getEnvToken('render')
  if (!deployToken) {
    res.status(400).json({ code: 'TOKEN_REQUIRED', platform: 'render', message: 'Connect your Render account to manage domains' })
    return null
  }
  if (token && fullUser) { fullUser.set('deployTokens.render', token); await fullUser.save() }

  // "https://name-abcd.onrender.com" → "name-abcd.onrender.com" (CNAME target)
  const serviceHost = String(state.url ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return { repo, serviceId: state.serviceId as string, serviceHost, deployToken }
}

/** Attach a domain and return the DNS record the client must create. */
router.post('/domain', async (req, res) => {
  const ctx = await renderDomainContext(req, res)
  if (!ctx) return

  const domain = String(req.body?.domain ?? '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    return res.status(400).json({ message: 'Enter a valid domain, e.g. brandname.com or www.brandname.com' })
  }

  try {
    const record = await addRenderDomain(ctx.serviceId, ctx.deployToken, domain, ctx.serviceHost)
    const domains = [...(((ctx.repo as any).deployState?.render?.domains) ?? [])
      .filter((d: any) => d?.name !== record.name), record]
    ctx.repo.set('deployState.render.domains', domains)
    await ctx.repo.save()
    res.status(201).json({
      domain: record,
      instructions: record.dns.type === 'A'
        ? `At your domain registrar, add an A record: host "@" → ${record.dns.value}. (For "www" as well, add a CNAME: host "www" → ${ctx.serviceHost}.)`
        : `At your domain registrar, add a CNAME record: host "${record.dns.host}" → ${record.dns.value}`,
      note: 'DNS can take a few minutes to a few hours to propagate. HTTPS is issued automatically once it resolves.',
    })
  } catch (err: any) {
    res.status(400).json({ message: err.message ?? 'Could not add that domain' })
  }
})

/** Current domains + verification status for a site. */
router.get('/domain/:repositoryId', async (req, res) => {
  const ctx = await renderDomainContext(req, res)
  if (!ctx) return
  try {
    const domains = await listRenderDomains(ctx.serviceId, ctx.deployToken)
    res.json({
      serviceHost: ctx.serviceHost,
      domains: domains.map((d) => ({ ...d, dns: dnsRecordFor(d.name, ctx.serviceHost) })),
    })
  } catch (err: any) {
    res.status(400).json({ message: err.response?.data?.message ?? err.message ?? 'Could not read domains' })
  }
})

/** Re-check DNS after the client adds the record. */
router.post('/domain/verify', async (req, res) => {
  const ctx = await renderDomainContext(req, res)
  if (!ctx) return
  const domainId = String(req.body?.domainId ?? '')
  if (!domainId) return res.status(400).json({ message: 'domainId is required' })
  const verified = await verifyRenderDomain(ctx.serviceId, ctx.deployToken, domainId)
  res.json({
    verified,
    message: verified
      ? 'Domain verified — the site is live on it (HTTPS included).'
      : 'Not verified yet. Check the DNS record at your registrar; propagation can take a few hours.',
  })
})

router.delete('/domain', async (req, res) => {
  const ctx = await renderDomainContext(req, res)
  if (!ctx) return
  const domainId = String(req.body?.domainId ?? '')
  if (!domainId) return res.status(400).json({ message: 'domainId is required' })
  try {
    await removeRenderDomain(ctx.serviceId, ctx.deployToken, domainId)
    res.json({ removed: true })
  } catch (err: any) {
    res.status(400).json({ message: err.response?.data?.message ?? err.message ?? 'Could not remove that domain' })
  }
})

export default router