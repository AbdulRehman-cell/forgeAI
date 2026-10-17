import axios from 'axios'
import fs from 'fs'
import path from 'path'
import simpleGit from 'simple-git'
import { Task, IFileChange } from './task.model'
import { Repository } from '../repository/repository.model'
import { createProvider, resolveProvider, type ProviderName } from '../ai/ai.factory'
import { emitTaskUpdate } from '../websocket'
import { User } from '../users/user.model'
import type { Job } from '../../lib/workers'
import { deploy, gitEnv, waitForRenderDeploy, fetchRenderLogs, getLatestRenderDeployId } from '../../lib/deployers'
import { runAgentTask } from '../agent/agent.runner'
import {
  importBrandSite, brandProfileBlock, downloadBrandImages, downloadBrandImagesWithSource,
  capturePages, sanitizeImportedHtml, selectorsIn, downloadImageMap, imageUrlsIn,
  downloadStylesheets, downloadScripts, hasOwnMobileNav, sanitizeEnhancementCss,
} from '../../lib/siteImport'
import { auditSite, type SiteAudit } from '../../lib/siteAudit'
import { stripCodeFence } from '../agent/agent.tools'
import type { AIProvider, AIMessage, AIResponse } from '../ai/providers/base'
import { selectPack, getPackCss, getPackPromptNote, PALETTE_PRESETS } from '../../lib/designPacks'
import { getReactPackFiles, getReactPackCss, getReactPackPromptNote } from '../../lib/reactPack'

const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:5001'
const REPOS_DIR = process.env.REPOS_DIR ?? path.join(process.cwd(), 'repos')
const MAX_ITERATIONS = 5

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Continuation-aware chat ───────────────────────────────
// Big file outputs truncate mid-file on free-tier caps. Instead of retrying
// from scratch (wasteful — and the retry truncates at the same point), detect
// the cut and ask the model to CONTINUE from exactly where it stopped,
// stitching the parts into one complete reply. Nothing is ever regenerated.
// (The Gemini provider also auto-continues internally against its own output
// cap — this handles the GPT/GitHub Models path.)

const CONTINUE_PROMPT =
  'Your previous reply was cut off mid-output. Continue EXACTLY from the character where it stopped. Do not repeat anything already sent, do not restart the file, no preamble, no code fences — output the raw continuation only, then finish the reply normally (closing </file> tags included).'

/** An opened <file …> tag with no matching </file> means the reply was cut. */
function looksTruncated(text: string): boolean {
  const lastOpen = text.lastIndexOf('<file ')
  return lastOpen !== -1 && text.indexOf('</file>', lastOpen) === -1
}

/** Models sometimes restart the fence/tag despite instructions — strip it. */
function stripContinuationPreamble(text: string): string {
  return text
    .replace(/^\s*```[a-zA-Z]*\r?\n/, '')
    .replace(/^\s*<file path="[^"]*">\r?\n?/, '')
}

async function chatWithContinuation(
  provider: AIProvider,
  messages: AIMessage[],
  systemPrompt?: string,
): Promise<AIResponse> {
  const res = await provider.chat(messages, systemPrompt)
  let content = res.content
  for (let round = 0; looksTruncated(content) && round < 4; round++) {
    await sleep(1500)
    const cont = await provider.chat(
      [...messages, { role: 'assistant', content }, { role: 'user', content: CONTINUE_PROMPT }],
      systemPrompt,
    )
    if (!cont.content?.trim()) break
    content += stripContinuationPreamble(cont.content)
  }
  return { ...res, content }
}

/** Best-effort provider error message across shapes (Google nests under
 *  `error`, OpenAI/GitHub put it at the top level). */
function providerErrorMessage(err: any): string {
  return (
    err?.response?.data?.error?.message ?? // Google/Gemini
    err?.response?.data?.message ?? // OpenAI / GitHub Models
    err?.message ??
    'unknown error'
  )
}

/**
 * chatWithContinuation that NEVER throws: a provider error (rate limit,
 * 400, network) becomes `null` instead of an exception. This is what keeps
 * one failed file from killing the whole website build — callers retry, then
 * either skip a non-critical file or fail with a friendly message.
 */
async function safeChat(
  provider: AIProvider,
  instruction: string,
  systemPrompt: string,
): Promise<AIResponse | null> {
  try {
    return await chatWithContinuation(provider, [{ role: 'user', content: instruction }], systemPrompt)
  } catch (err: any) {
    console.warn('[builder] AI call failed —', providerErrorMessage(err))
    return null
  }
}

export async function processTask(job: Job) {
  const { type } = job.data

  // Tasks that need a local workspace: re-clone from GitHub when Render's
  // ephemeral filesystem wiped the repo directory between restarts/deploys.
  const NEEDS_LOCAL_PATH = new Set([
    'fix_workspace', 'fix_file', 'review', 'generate_tests',
    'security_scan', 'blitz_deploy', 'agent', 'rebuild_proposal',
  ])
  if (NEEDS_LOCAL_PATH.has(type) && job.data.localPath && job.data.repositoryId) {
    await ensureLocalPath(job)
  }

  switch (type) {
    case 'clone_repo':    return cloneRepository(job)
    case 'fix_workspace': return fixWorkspace(job)
    case 'fix_file':      return fixFile(job)
    case 'review':         return reviewCode(job)
    case 'generate_tests': return generateTests(job)
    case 'security_scan':  return securityScan(job)
    case 'blitz_deploy': return blitzDeploy(job)
    case 'agent':         return runAgentTask(job)
    case 'build_site':    return buildSite(job)
    case 'rebuild_proposal': return rebuildProposal(job)
    default: throw new Error(`Unknown task type: ${type}`)
  }
}

/**
 * If localPath no longer exists on disk (Render wipes the ephemeral
 * filesystem on every restart/redeploy), re-clone the repo from GitHub
 * so that all subsequent task tools find the files they expect.
 */
async function ensureLocalPath(job: Job) {
  const { localPath, repositoryId, userId } = job.data
  if (fs.existsSync(localPath)) return  // directory is present — nothing to do

  const repo = await Repository.findById(repositoryId)
  if (!repo) return

  // Only GitHub-sourced repos can be re-cloned automatically.
  // Local folders can't be recovered — the user must re-import them.
  if (repo.source === 'local' || !repo.cloneUrl) {
    throw new Error(
      'The local workspace was lost (server restart / redeploy). ' +
      'Please re-import this repository from the Repositories page to restore it.',
    )
  }

  console.info(`[processor] localPath missing — re-cloning ${repo.fullName}`)
  const fullUser = await User.findById(userId).select('+githubAccessToken')
  const authUrl = fullUser?.githubAccessToken
    ? repo.cloneUrl.replace('https://', `https://${fullUser.githubAccessToken}@`)
    : repo.cloneUrl

  fs.mkdirSync(localPath, { recursive: true })
  const git = simpleGit().env(gitEnv())
  try {
    await git.clone(authUrl, localPath, ['--depth', '1'])
    repo.status = 'ready'
    await repo.save()
    console.info(`[processor] Re-cloned ${repo.fullName} to ${localPath}`)
  } catch (err: any) {
    fs.rmSync(localPath, { recursive: true, force: true })
    throw new Error(
      `Could not re-clone ${repo.fullName}: ${String(err.message).replace(/\/\/[^@/\s]+@/g, '//***@')}. ` +
      'Check that your GitHub token is still valid in Settings.',
    )
  }
}

// ─── Clone ─────────────────────────────────────────────────
async function cloneRepository(job: Job) {
  const { repositoryId, cloneUrl, userId } = job.data
  const repo = await Repository.findById(repositoryId)
  if (!repo) throw new Error('Repository not found')

  try {
    const repoPath = path.join(REPOS_DIR, userId, repo.name)

    // Clean existing dir to avoid "already exists" error
    if (fs.existsSync(repoPath)) {
      fs.rmSync(repoPath, { recursive: true, force: true })
    }
    fs.mkdirSync(repoPath, { recursive: true })

    const fullUser = await User.findById(userId).select('+githubAccessToken')
    // Public repos clone fine without a token — never inject "undefined@"
    const authUrl = fullUser?.githubAccessToken
      ? cloneUrl.replace('https://', `https://${fullUser.githubAccessToken}@`)
      : cloneUrl

    // gitEnv: fail fast instead of hanging on a credential prompt
    const git = simpleGit().env(gitEnv())
    await git.clone(authUrl, repoPath, ['--depth', '1'])

    repo.localPath = repoPath
    repo.status = 'indexing'
    await repo.save()

    try {
      await axios.post(`${PYTHON_SERVICE}/repo/index`, { path: repoPath, repositoryId })
    } catch {
      console.warn('[processor] Python service unavailable, skipping index')
    }

    repo.status = 'ready'
    repo.indexed = true
    await repo.save()
  } catch (err: any) {
    repo.status = 'error'
    // Never persist the access token if git echoed the URL back in its error
    repo.errorMessage = String(err.message ?? 'Clone failed').replace(/\/\/[^@/\s]+@/g, '//***@')
    await repo.save()
    throw err
  }
}

// ─── Fix Workspace ─────────────────────────────────────────
async function fixWorkspace(job: Job) {
  const { taskId, localPath, aiProvider, injectedErrors } = job.data
  const task = await Task.findById(taskId)
  if (!task) throw new Error('Task not found')

  await updateTask(task, { status: 'running', progress: 5 }, 'Starting Fix Workspace…')

  const provider = createProvider(resolveProvider(aiProvider))
  const systemPrompt = await buildSystemPrompt(task.userId.toString())
  const allChanges: IFileChange[] = []
  let iteration = 0

  while (iteration < MAX_ITERATIONS) {
    iteration++
    await updateTask(task, { progress: 5 + iteration * 15 }, `Iteration ${iteration}: running build & lint…`)

    // Use injected errors (test mode) or call Python analyzer
    let errors: string[] = injectedErrors ?? []
    if (!errors.length) {
      try {
        const { data } = await axios.post(`${PYTHON_SERVICE}/analyze`, { path: localPath })
        errors = data.errors ?? []
      } catch {
        await updateTask(task, {}, 'Python service unavailable, skipping static analysis', 'warn')
      }
    } else {
      await updateTask(task, {}, `Using ${errors.length} injected error(s) for testing`)
    }

    if (errors.length === 0) {
      await updateTask(task, { progress: 90 }, 'No errors found — workspace is clean!')
      break
    }

    await updateTask(task, {}, `Found ${errors.length} error(s). Asking AI to fix…`)

    // Build context
    let context = ''
    try {
      const { data } = await axios.post(`${PYTHON_SERVICE}/repo/context`, {
        path: localPath,
        query: errors.join('\n'),
      })
      context = data.context ?? ''
    } catch {}

    // Ask AI
    const prompt = buildFixPrompt(errors, context)
    const response = await chatWithContinuation(provider, [{ role: 'user', content: prompt }], systemPrompt)

    // Parse and apply changes
    const parsed = parseAIChanges(response.content)
    if (!parsed.length) {
      await updateTask(task, {}, 'AI could not determine fixes, stopping.', 'warn')
      break
    }

    for (const change of parsed) {
      const absPath = path.join(localPath, change.path)
      if (!absPath.startsWith(localPath)) continue // path traversal guard

      const before = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : ''
      fs.mkdirSync(path.dirname(absPath), { recursive: true })
      fs.writeFileSync(absPath, change.content, 'utf-8')

      const { additions, deletions } = diffStats(before, change.content)
      allChanges.push({ path: change.path, before, after: change.content, additions, deletions })
      await updateTask(task, {}, `Updated: ${change.path} (+${additions}/-${deletions})`)
    }
  }

  // Commit to branch
  if (allChanges.length) {
    try {
      const branchName = `forgeai/fix-${taskId.slice(-6)}`
      const git = simpleGit(localPath)
      await git.checkoutLocalBranch(branchName)
      await git.add('.')
      await git.commit(`ForgeAI: Auto-fix ${allChanges.length} file(s)`)
      await updateTask(task, {}, `Committed to branch: ${branchName}`)
    } catch (err: any) {
      await updateTask(task, {}, `Git commit skipped: ${err.message}`, 'warn')
    }
  }

  const summary = allChanges.length
    ? `Fixed ${allChanges.length} file(s) across ${iteration} iteration(s): ${allChanges.map((c) => c.path).join(', ')}`
    : 'No changes were needed.'

  const needsApproval = allChanges.length > 0 && await requiresApproval(task.userId.toString())

  task.changes = allChanges
  task.status = needsApproval ? 'awaiting_approval' : 'completed'
  task.approvalStatus = needsApproval ? 'pending' : undefined
  task.progress = 100
  task.summary = needsApproval ? `${summary} — awaiting team owner approval` : summary
  await task.save()
  emitTaskUpdate(taskId, task.toObject())
}

// ─── Fix File ──────────────────────────────────────────────
async function fixFile(job: Job) {
  const { taskId, localPath, filePath, aiProvider } = job.data
  const task = await Task.findById(taskId)
  if (!task) throw new Error('Task not found')

  await updateTask(task, { status: 'running', progress: 10 }, `Fixing file: ${filePath}`)

  const absPath = path.join(localPath, filePath)
  if (!fs.existsSync(absPath)) throw new Error('File not found')

  const before = fs.readFileSync(absPath, 'utf-8')
  const provider = createProvider(resolveProvider(aiProvider))
  const systemPrompt = await buildSystemPrompt(task.userId.toString())

  const prompt = `Fix all bugs, lint errors, and code quality issues in this file.
Return ONLY the complete fixed file content, no explanations.

File: ${filePath}
\`\`\`
${before}
\`\`\``

  const response = await provider.chat([{ role: 'user', content: prompt }], systemPrompt)
  const after = extractCodeBlock(response.content) ?? response.content

  fs.writeFileSync(absPath, after, 'utf-8')
  const { additions, deletions } = diffStats(before, after)

  const needsApproval = await requiresApproval(task.userId.toString())
  const summary = `Fixed ${filePath} (+${additions}/-${deletions})`

  task.changes = [{ path: filePath, before, after, additions, deletions }]
  task.status = needsApproval ? 'awaiting_approval' : 'completed'
  task.approvalStatus = needsApproval ? 'pending' : undefined
  task.progress = 100
  task.summary = needsApproval ? `${summary} — awaiting team owner approval` : summary
  await task.save()
  emitTaskUpdate(taskId, task.toObject())
}

// ─── Helpers ───────────────────────────────────────────────
async function updateTask(
  task: any,
  updates: Record<string, any>,
  message?: string,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  Object.assign(task, updates)
  if (message) task.logs.push({ level, message, timestamp: new Date() })
  await task.save()
  emitTaskUpdate(task._id.toString(), task.toObject())
}

function buildFixPrompt(errors: string[], context: string): string {
  return `Fix the following errors in the codebase.

ERRORS:
${errors.slice(0, 20).join('\n')}

${context ? `REPOSITORY CONTEXT:\n${context}` : ''}

Return your fixes in this exact format for each file you change:

<file path="relative/path/to/file.ts">
// complete file content here
</file>

Only include files you actually changed.`
}

const FIX_SYSTEM_PROMPT = `You are ForgeAI, an autonomous software engineer.
Your job is to fix code errors by modifying files.
Always return complete file content — never partial diffs.
Be precise. Do not add unnecessary comments or changes.`

/** Fetch team owner's coding standards for a given user, or null if none set. */
async function getTeamStandards(userId: string): Promise<string | null> {
  const user = await User.findById(userId).select('teamOwnerId teamCodingStandards')
  if (!user) return null
  if (user.teamCodingStandards) return user.teamCodingStandards as string
  if (user.teamOwnerId) {
    const owner = await User.findById(user.teamOwnerId).select('teamCodingStandards')
    return (owner?.teamCodingStandards as string) ?? null
  }
  return null
}

/** Build the system prompt, appending coding standards when the team owner has set them. */
async function buildSystemPrompt(userId: string): Promise<string> {
  const standards = await getTeamStandards(userId)
  if (!standards) return FIX_SYSTEM_PROMPT
  return `${FIX_SYSTEM_PROMPT}\n\n## Team Coding Standards (apply to every file you touch)\n${standards}`
}

/** Return true if the task owner (or their team owner) requires approval before completing AI tasks. */
async function requiresApproval(userId: string): Promise<boolean> {
  const user = await User.findById(userId).select('teamOwnerId teamRequireApproval')
  if (!user) return false
  if (user.teamOwnerId) {
    const owner = await User.findById(user.teamOwnerId).select('teamRequireApproval')
    return !!(owner?.teamRequireApproval)
  }
  return !!(user.teamRequireApproval)
}

interface ParsedChange { path: string; content: string }

function parseAIChanges(response: string): ParsedChange[] {
  const changes: ParsedChange[] = []
  const regex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g
  let match
  while ((match = regex.exec(response)) !== null) {
    // Unwrap markdown fences the model wrapped the file body in — written
    // verbatim they break builds (e.g. a Dockerfile starting with ```Dockerfile)
    changes.push({ path: match[1].trim(), content: stripCodeFence(match[2].trim()) })
  }
  return changes
}

function extractCodeBlock(text: string): string | null {
  const match = text.match(/```(?:\w+)?\n([\s\S]+?)\n```/)
  return match ? match[1] : null
}

function diffStats(before: string, after: string): { additions: number; deletions: number } {
  const a = before.split('\n')
  const b = after.split('\n')
  return {
    additions: b.filter((l) => !a.includes(l)).length,
    deletions: a.filter((l) => !b.includes(l)).length,
  }
}

// ─── AI Code Review ───────────────────────────────────────
async function reviewCode(job: Job) {
  const { taskId, localPath, aiProvider } = job.data
  const task = await Task.findById(taskId)
  if (!task) throw new Error('Task not found')

  await updateTask(task, { status: 'running', progress: 10 }, 'Collecting source files for review…')

  const files = collectSourceFiles(localPath, 12)
  await updateTask(task, { progress: 30 }, `Reviewing ${files.length} key files…`)

  const provider = createProvider(resolveProvider(aiProvider))
  const fileBlocks = files
    .map((f) => `## ${f.rel}\n\`\`\`\n${f.content.slice(0, 5000)}\n\`\`\``)
    .join('\n\n')

  const response = await provider.chat(
    [{
      role: 'user',
      content: `Perform a senior-engineer code review of this repository. For each issue give: severity (critical/major/minor), file, line hint, problem, and suggested fix. Group by severity, worst first. End with a short overall assessment and a quality score out of 10.\n\n${fileBlocks}`,
    }],
    'You are ForgeAI, a rigorous senior software engineer performing code review. Be specific and actionable.',
  )

  task.status = 'completed'
  task.progress = 100
  task.summary = response.content
  await task.save()
  emitTaskUpdate(taskId, task.toObject())
}

// ─── Generate Tests ───────────────────────────────────────
async function generateTests(job: Job) {
  const { taskId, localPath, filePath, aiProvider } = job.data
  const task = await Task.findById(taskId)
  if (!task) throw new Error('Task not found')

  await updateTask(task, { status: 'running', progress: 15 }, `Generating tests for ${filePath ?? 'key files'}…`)

  const provider = createProvider(resolveProvider(aiProvider))
  const targets = filePath
    ? [{ rel: filePath, content: fs.readFileSync(path.join(localPath, filePath), 'utf-8') }]
    : collectSourceFiles(localPath, 3)

  const allChanges: IFileChange[] = []

  for (const target of targets) {
    const response = await chatWithContinuation(
      provider,
      [{
        role: 'user',
        content: `Write a complete, runnable test file for this code. Use the idiomatic test framework for the language (jest/vitest for JS/TS, pytest for Python). Return in this exact format:\n\n<file path="the/test/file/path">\n// test content\n</file>\n\nSource file ${target.rel}:\n\`\`\`\n${target.content.slice(0, 8000)}\n\`\`\``,
      }],
      'You are ForgeAI. Write thorough, runnable tests. Cover happy paths, edge cases, and error handling.',
    )

    const parsed = parseAIChanges(response.content)
    for (const change of parsed) {
      const absPath = path.join(localPath, change.path)
      if (!absPath.startsWith(localPath)) continue
      const before = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : ''
      fs.mkdirSync(path.dirname(absPath), { recursive: true })
      fs.writeFileSync(absPath, change.content, 'utf-8')
      const { additions, deletions } = diffStats(before, change.content)
      allChanges.push({ path: change.path, before, after: change.content, additions, deletions })
      await updateTask(task, {}, `Created: ${change.path}`)
    }
  }

  task.changes = allChanges
  task.status = 'completed'
  task.progress = 100
  task.summary = `Generated ${allChanges.length} test file(s): ${allChanges.map((c) => c.path).join(', ')}`
  await task.save()
  emitTaskUpdate(taskId, task.toObject())
}

// ─── Security Scan ────────────────────────────────────────
async function securityScan(job: Job) {
  const { taskId, localPath, aiProvider } = job.data
  const task = await Task.findById(taskId)
  if (!task) throw new Error('Task not found')

  await updateTask(task, { status: 'running', progress: 10 }, 'Scanning for security issues…')

  const files = collectSourceFiles(localPath, 15)
  const provider = createProvider(resolveProvider(aiProvider))

  const fileBlocks = files
    .map((f) => `## ${f.rel}\n\`\`\`\n${f.content.slice(0, 4000)}\n\`\`\``)
    .join('\n\n')

  await updateTask(task, { progress: 40 }, `Analyzing ${files.length} files for vulnerabilities…`)

  const response = await provider.chat(
    [{
      role: 'user',
      content: `Perform a security audit of this codebase. Look for: injection vulnerabilities (SQL/NoSQL/command), XSS, hardcoded secrets or API keys, path traversal, missing auth checks, insecure dependencies patterns, CSRF issues, and unsafe deserialization. For each finding give: severity (critical/high/medium/low), file, description, and remediation. If secrets are found, list the file and line. End with a security score out of 10.\n\n${fileBlocks}`,
    }],
    'You are ForgeAI security auditor. Be thorough and specific. False negatives are worse than false positives.',
  )

  task.status = 'completed'
  task.progress = 100
  task.summary = response.content
  await task.save()
  emitTaskUpdate(taskId, task.toObject())
}

// ─── Rebuild Proposal ─────────────────────────────────────
const REBUILD_SYSTEM_PROMPT = `You are ForgeAI's Principal Software Architect. Analyze the provided codebase and produce a professional rebuild proposal in Markdown. This is a client-deliverable document — be specific, concrete, and action-oriented. Do not pad with generic advice.`

async function rebuildProposal(job: Job) {
  const { taskId, localPath, repoName, aiProvider } = job.data
  const task = await Task.findById(taskId)
  if (!task) throw new Error('Task not found')

  await updateTask(task, { status: 'running', progress: 5 }, '🔍 Scanning codebase architecture…')

  const files = collectSourceFiles(localPath, 25)
  const provider = createProvider(resolveProvider(aiProvider))

  // Collect key config files for stack fingerprinting
  const configFiles = ['package.json', 'requirements.txt', 'go.mod', 'Cargo.toml',
    'tsconfig.json', 'vite.config.ts', 'next.config.js', 'nuxt.config.ts',
    'angular.json', 'manage.py', 'Gemfile', 'composer.json', 'docker-compose.yml', '.env.example']

  const configBlocks: string[] = []
  for (const cf of configFiles) {
    const p = path.join(localPath, cf)
    if (fs.existsSync(p)) {
      try {
        configBlocks.push(`### ${cf}\n\`\`\`\n${fs.readFileSync(p, 'utf-8').slice(0, 2000)}\n\`\`\``)
      } catch {}
    }
  }

  await updateTask(task, { progress: 25 }, `Analyzing ${files.length} source files + ${configBlocks.length} config files…`)

  const sourceBlocks = files
    .map((f) => `## ${f.rel}\n\`\`\`\n${f.content.slice(0, 4000)}\n\`\`\``)
    .join('\n\n')

  await updateTask(task, { progress: 40 }, 'Generating architectural analysis…')

  const prompt = `Analyze this codebase (${repoName ?? 'repository'}) and produce a complete rebuild proposal.

## Config Files
${configBlocks.join('\n\n') || '(none found)'}

## Source Files
${sourceBlocks}

---

Produce the rebuild proposal in this exact structure:

# Rebuild Proposal: ${repoName ?? 'Repository'}

## Executive Summary
2-3 sentences: what this codebase does, current state (honest assessment), and urgency of rebuild.

## Current Stack Assessment
| Layer | Current | Issues | Recommendation |
|-------|---------|--------|----------------|
(cover: Frontend, Backend, Database, Auth, Styling, Testing, Build/CI, Deployment)

## Architecture Analysis

### Coupling Hotspots
List the top 5 most tightly-coupled files/modules with explanation of why this is a problem.

### Technical Debt
Rank files/areas by debt severity: [Critical / High / Medium]. 1-2 lines each.

### Security Concerns
Specific patterns observed (not generic advice).

## Complexity Heatmap
Top 8 files sorted by complexity/risk, with a 1-line reason each.

## Recommended Stack
| Layer | Recommended | Why |
|-------|------------|-----|
(match the project type — don't recommend React for a Python CLI)

## Phased Rebuild Plan

### Phase 1 — Foundation (Weeks 1–2)
- [ ] Task with ~X hours estimate
...

### Phase 2 — Core Features (Weeks 3–6)
- [ ] Task with ~X hours estimate
...

### Phase 3 — Polish & Launch (Weeks 7–10)
- [ ] Task with ~X hours estimate
...

## Starter Code
Show 1-2 concise code stubs in the recommended stack demonstrating the new architecture pattern. Keep each under 50 lines.

## Effort Summary
- **Estimated Hours:** X–Y
- **Complexity:** Low / Medium / High / Very High
- **Risk:** Low / Medium / High
- **Key Risk:** (one specific thing that could derail the rebuild)
`

  const response = await chatWithContinuation(provider, [{ role: 'user', content: prompt }], REBUILD_SYSTEM_PROMPT)

  await updateTask(task, { progress: 90 }, 'Finalizing proposal…')

  task.status = 'completed'
  task.progress = 100
  task.summary = response.content
  await task.save()
  emitTaskUpdate(taskId, task.toObject())
}

// ─── Shared helper ────────────────────────────────────────
const REVIEW_IGNORE = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.next', 'venv'])
const REVIEW_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'])

function collectSourceFiles(root: string, limit: number): { rel: string; content: string }[] {
  const results: { rel: string; content: string; size: number }[] = []
  function walk(dir: string, depth = 0) {
    if (depth > 5 || results.length > 200) return
    let items: fs.Dirent[]
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const item of items) {
      if (item.name.startsWith('.') || REVIEW_IGNORE.has(item.name)) continue
      const full = path.join(dir, item.name)
      if (item.isDirectory()) { walk(full, depth + 1); continue }
      if (!REVIEW_EXT.has(path.extname(item.name).toLowerCase())) continue
      try {
        const stat = fs.statSync(full)
        if (stat.size > 100_000) continue
        results.push({ rel: path.relative(root, full), content: fs.readFileSync(full, 'utf-8'), size: stat.size })
      } catch {}
    }
  }
  walk(root)
  // Prefer bigger files (usually more important logic), cap at limit
  return results.sort((a, b) => b.size - a.size).slice(0, limit)
}


// ─── GitHub push helper (used by blitzDeploy) ────────────────────────────────
// Creates a GitHub repo for the project and pushes the local code to it.
// Returns the "owner/repo" fullName on success.
async function pushRepoToGitHub(
  localPath: string,
  userId: string,
  repositoryId: string,
  repoName: string,
  branch: string,
  log: (msg: string, level?: 'info' | 'warn' | 'error') => Promise<void>,
): Promise<string> {
  const fullUser = await User.findById(userId).select('+githubAccessToken')
  if (!fullUser?.githubAccessToken) {
    throw new Error(
      'GitHub account not connected — go to Settings → GitHub, connect your account, then re-run Blitz Deploy.',
    )
  }

  const headers = { Authorization: `token ${fullUser.githubAccessToken}`, Accept: 'application/vnd.github+json' }

  // Create the GitHub repo (retry up to 10 times on name collision)
  let ghRepo: any
  const baseName = repoName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'forgeai-app'
  for (let attempt = 0; attempt < 10 && !ghRepo; attempt++) {
    const suffix = attempt === 0 ? '' : attempt < 9 ? `-${Math.random().toString(36).slice(2, 7)}` : `-${Date.now().toString(36)}`
    const name = `${baseName}${suffix}`
    try {
      const { data } = await axios.post(
        'https://api.github.com/user/repos',
        { name, description: 'Deployed with ForgeAI Blitz Deploy', private: false, auto_init: false },
        { headers },
      )
      ghRepo = data
    } catch (err: any) {
      const status = err.response?.status
      if (status === 401 || status === 403) {
        throw new Error('GitHub token was rejected — reconnect GitHub in Settings, then re-run Blitz Deploy.')
      }
      if (status !== 422) throw new Error(err.response?.data?.message ?? err.message)
      await log(`GitHub repo name "${name}" is taken — trying another…`, 'warn')
    }
  }
  if (!ghRepo?.full_name?.includes('/')) {
    throw new Error('Could not create a GitHub repository (all name attempts failed). Try a different project name.')
  }
  await log(`Created GitHub repo: ${ghRepo.full_name}`)

  // Ensure the local directory is a git repo with at least one commit
  const git = simpleGit(localPath).env(gitEnv())
  const isRepo = await git.checkIsRepo().catch(() => false)
  if (!isRepo) await git.init()
  await git.addConfig('user.name', 'ForgeAI')
  await git.addConfig('user.email', 'bot@forgeai.dev')

  let hasHead = true
  try { await git.revparse(['HEAD']) } catch { hasHead = false }

  if (!hasHead) {
    await git.add('.')
    await git.commit('ForgeAI: initial commit')
  } else {
    const status = await git.status()
    if (status.files.length > 0) {
      await git.add('.')
      await git.commit('ForgeAI: prepare for deployment')
    }
  }

  // Push — use token-authenticated URL but store the public URL as origin
  const authRemote = `https://${fullUser.githubAccessToken}@github.com/${ghRepo.full_name}.git`
  try {
    await git.push([authRemote, `HEAD:refs/heads/${branch}`, '--force'])
  } catch (pushErr: any) {
    // Scrub credentials from the error message before surfacing it
    throw new Error(pushErr.message.replace(/https?:\/\/[^@]+@/g, 'https://'))
  }
  await git.removeRemote('origin').catch(() => {})
  await git.addRemote('origin', `https://github.com/${ghRepo.full_name}.git`).catch(() => {})

  // Update the repository document so future operations use the real fullName
  await Repository.findByIdAndUpdate(repositoryId, {
    githubId: ghRepo.id,
    fullName: ghRepo.full_name,
    name: ghRepo.name,
    cloneUrl: ghRepo.clone_url,
    source: 'github',
  })

  await log(`✅ Code is on GitHub: https://github.com/${ghRepo.full_name}`)
  return ghRepo.full_name
}

async function blitzDeploy(job: Job) {
  const { taskId, localPath, platform, aiProvider, deployToken, repoName, branch, isLocal, needsGitHubPush, repositoryId } = job.data
  let { repoFullName } = job.data
  const task = await Task.findById(taskId)
  if (!task) throw new Error('Task not found')

  // ── Auto-push to GitHub if this repo isn't on GitHub yet ──────────────────
  // Render and Railway build from GitHub; if the project was generated locally
  // (e.g. by build-site without a GitHub token, or opened as a local folder)
  // we push it now before generating deployment configs.
  if (needsGitHubPush) {
    await updateTask(task, { status: 'running', progress: 5 }, '🐙 Pushing project to GitHub…')
    try {
      repoFullName = await pushRepoToGitHub(
        localPath,
        job.data.userId,
        repositoryId,
        repoName ?? 'forgeai-app',
        branch ?? 'main',
        (msg, level) => updateTask(task, {}, msg, level),
      )
      await updateTask(task, { progress: 8 }, `Repository is on GitHub — generating deployment configs…`)
    } catch (ghErr: any) {
      task.status = 'failed'
      task.summary = `## ⚠️ GitHub push failed\n\n${ghErr.message}`
      await task.save()
      emitTaskUpdate(taskId, task.toObject())
      return
    }
  }

  await updateTask(task, { status: 'running', progress: 10 }, '⚡ Blitz Deploy: analyzing project structure…')

  // ── Gather project fingerprint ──
  const fingerprint: string[] = []
  const keyFiles = ['package.json', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'tsconfig.json', 'vite.config.ts', 'next.config.js', 'nuxt.config.ts', 'angular.json', 'manage.py', 'app.py', 'main.py', 'Gemfile', 'composer.json']
  for (const f of keyFiles) {
    const p = path.join(localPath, f)
    if (fs.existsSync(p)) {
      fingerprint.push(`### ${f}\n\`\`\`\n${fs.readFileSync(p, 'utf-8').slice(0, 3000)}\n\`\`\``)
    }
  }

  // Directory overview (top 2 levels)
  const dirs: string[] = []
  try {
    for (const item of fs.readdirSync(localPath, { withFileTypes: true })) {
      if (item.name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(item.name)) continue
      dirs.push(item.isDirectory() ? `${item.name}/` : item.name)
    }
  } catch {}

  await updateTask(task, { progress: 30 }, `Detected ${fingerprint.length} config file(s). Generating deployment kit…`)

  const provider = createProvider(resolveProvider(aiProvider))
  const targetPlatform = platform

  // Plain HTML/CSS/JS project — models love to hallucinate npm build steps
  // for these, which then fail in Docker (no package.json to install)
  const isStaticSite =
    !fs.existsSync(path.join(localPath, 'package.json')) &&
    fs.existsSync(path.join(localPath, 'index.html'))

  // Vercel + plain static: skip the entire AI deployment-kit generation and
  // the Docker/nginx guards. Vercel serves static files natively — Dockerfile,
  // nginx.conf and docker-compose.yml are dead weight there, and paying the
  // AI to produce them is pure waste. All we need is a tiny vercel.json for
  // clean URLs and correct 404 handling.
  const isVercel = platform === 'vercel'
  if (isVercel && isStaticSite) {
    await updateTask(task, { progress: 40 }, '🎯 Vercel target — skipping Docker/nginx generation, writing vercel.json only')
    // Vercel serves 404.html automatically from the root if present — no
    // config field is needed for it. `errorPage` is NOT in Vercel's schema
    // and setting it causes "invalid config" build failures.
    const vercelJson = JSON.stringify({
      cleanUrls: true,
      trailingSlash: false,
    }, null, 2) + '\n'
    const vercelPath = path.join(localPath, 'vercel.json')
    const before = fs.existsSync(vercelPath) ? fs.readFileSync(vercelPath, 'utf-8') : ''
    fs.writeFileSync(vercelPath, vercelJson, 'utf-8')
    const allChanges: IFileChange[] = [
      { path: 'vercel.json', before, after: vercelJson, ...diffStats(before, vercelJson) },
    ]
    await updateTask(task, {}, '⚡ Wrote vercel.json')

    let summary = `⚡ Blitz Deploy → Vercel (static site, no Docker overhead).`
    if (deployToken) {
      await updateTask(task, { progress: 70 }, '🚀 Deploying to Vercel…')
      try {
        const repoDoc = await Repository.findById(task.repositoryId).select('+builderEnv')
        const result = await deploy(
          platform,
          {
            localPath, token: deployToken, repoFullName,
            name: repoName ?? repoFullName?.split('/').pop() ?? 'forgeai-app',
            branch: branch ?? 'main',
            remoteHasDockerfile: false,
            existing: repoDoc?.deployState?.[platform],
          },
          (message, level = 'info') => updateTask(task, {}, message, level),
        )
        if (repoDoc && result.state) {
          repoDoc.set(`deployState.${platform}`, result.state)
          repoDoc.markModified('deployState')
          await repoDoc.save()
        }
        task.metadata = { ...task.metadata, deploymentUrl: result.url, dashboardUrl: result.dashboardUrl }
        task.markModified('metadata')
        await updateTask(task, { progress: 95 }, `🌐 Live on Vercel: ${result.url}`)
        summary = `## 🌐 Your site is live on Vercel\n\n**[${result.url}](${result.url})**${result.dashboardUrl ? `\n\n[Vercel dashboard](${result.dashboardUrl})` : ''}\n\n---\n\n${summary}`
      } catch (err: any) {
        await updateTask(task, {}, `Vercel deploy failed: ${err.message}`, 'error')
        summary = `## ⚠️ Vercel deploy failed\n\n${err.message}\n\n---\n\n${summary}`
      }
    }

    task.changes = allChanges
    task.status = 'completed'
    task.progress = 100
    task.summary = summary
    await task.save()
    emitTaskUpdate(taskId, task.toObject())
    return
  }

  const response = await chatWithContinuation(
    provider,
    [{
      role: 'user',
      content: `Make this repository deployment-ready for ${targetPlatform}.

PROJECT STRUCTURE:
${dirs.join('\n')}

CONFIG FILES:
${fingerprint.join('\n\n')}
${isStaticSite ? '\nIMPORTANT: this project has NO package.json — it is a plain static HTML/CSS/JS site. There is NOTHING to build. The Dockerfile must ONLY copy the files into a web server image (nginx) — absolutely no npm, node, yarn, or build commands anywhere.\n' : ''}

Generate ALL files needed for production deployment. Requirements:
1. Multi-stage Dockerfile (small final image) if Docker fits the stack
2. docker-compose.yml with any needed services (db, redis) if applicable
3. Platform config file (vercel.json / railway.toml / render.yaml) when relevant
4. .github/workflows/deploy.yml — CI that builds, tests, and deploys
5. .env.example listing every env var the app needs with comments
6. .dockerignore
7. DEPLOY.md — step-by-step deploy guide a beginner can follow in under 5 minutes, including the exact commands

Return EVERY file in this exact format:
<file path="relative/path">
content
</file>

After the files, add a summary starting with "## Deployment Summary" that explains: detected stack, chosen platform, and the 3 commands to deploy right now.`,
    }],
    'You are ForgeAI Blitz Deploy — an expert DevOps engineer. Generate production-grade, secure deployment configs. Never use :latest tags, always pin versions. Include health checks.',
  )

  await updateTask(task, { progress: 70 }, 'Writing deployment files…')

  // ── Apply generated files ──
  const parsed = parseAIChanges(response.content)
  const allChanges: IFileChange[] = []

  for (const change of parsed) {
    const absPath = path.join(localPath, change.path)
    if (!absPath.startsWith(localPath)) continue
    const before = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : ''
    fs.mkdirSync(path.dirname(absPath), { recursive: true })
    fs.writeFileSync(absPath, change.content, 'utf-8')
    const { additions, deletions } = diffStats(before, change.content)
    allChanges.push({ path: change.path, before, after: change.content, additions, deletions })
    await updateTask(task, {}, `⚡ Created: ${change.path}`)
  }

  // ── Static-site guard ──
  // Model-written Docker/nginx configs for plain static sites are unreliable:
  // npm builds for projects with no package.json, nginx-Plus-only directives
  // ("health_check"), broken COPY paths… Ship the known-good setup instead.
  if (isStaticSite) {
    const dockerfilePath = path.join(localPath, 'Dockerfile')
    const generatedDockerfile = allChanges.find((c) => c.path === 'Dockerfile')
    const npmDockerfile =
      fs.existsSync(dockerfilePath) &&
      /\b(npm|node|yarn|pnpm)\b/i.test(fs.readFileSync(dockerfilePath, 'utf-8'))
    if (generatedDockerfile || npmDockerfile) {
      const staticDockerfile = [
        '# Plain static site — no build step, served by nginx',
        'FROM nginx:1.27-alpine',
        'COPY . /usr/share/nginx/html',
        'EXPOSE 80',
        'CMD ["nginx", "-g", "daemon off;"]',
        '',
      ].join('\n')
      fs.writeFileSync(dockerfilePath, staticDockerfile, 'utf-8')
      if (generatedDockerfile) generatedDockerfile.after = staticDockerfile
      else allChanges.push({ path: 'Dockerfile', before: '', after: staticDockerfile, ...diffStats('', staticDockerfile) })
      await updateTask(task, {}, '🛡️ Replaced the generated Dockerfile with a known-good static nginx one', 'warn')
    }
    // The stock nginx image serves static sites correctly on its own —
    // model-written configs are where invalid directives sneak in
    for (let i = allChanges.length - 1; i >= 0; i--) {
      const rel = allChanges[i].path.replace(/\\/g, '/')
      if (/(^|\/)(nginx[^/]*\.conf|default\.conf)$/i.test(rel)) {
        try { fs.rmSync(path.join(localPath, allChanges[i].path), { force: true }) } catch {}
        await updateTask(task, {}, `🛡️ Removed generated ${allChanges[i].path} — the stock nginx config serves static sites correctly`, 'warn')
        allChanges.splice(i, 1)
      }
    }
  }

  // ── ForgeAI static-site guard ──
  // Multi-page static sites are served by nginx, which needs an exact filename:
  // "/about" 404s even though about.html exists. Ship a known-good nginx config
  // with try_files so clean URLs work, plus correct MIME types and caching.
  const isForgeStatic =
    fs.existsSync(path.join(localPath, 'index.html')) &&
    !fs.existsSync(path.join(localPath, 'server', 'index.js')) &&
    !fs.existsSync(path.join(localPath, 'package.json'))
  if (isForgeStatic) {
    const nginxConf = [
      'server {',
      '  listen 80;',
      '  root /usr/share/nginx/html;',
      '  index index.html;',
      '',
      '  # Explicit MIME map, declared inside the server block so it can NEVER',
      '  # fall back to text/plain regardless of what the base image ships. Modern',
      '  # browsers refuse to execute a .js file served as text/plain ("Refused to',
      '  # execute script … MIME type text/plain") which cascades into',
      '  # "$ is not defined / Swiper is not defined / layui is not defined" for',
      '  # every downloaded library. Belt-and-suspenders: include the standard',
      '  # types file too so image/font extensions we did not list still resolve.',
      '  include /etc/nginx/mime.types;',
      '  types {',
      '    application/javascript js mjs;',
      '    text/css               css;',
      '    text/html              html htm;',
      '    application/json       json;',
      '    image/svg+xml          svg svgz;',
      '    image/webp             webp;',
      '    image/avif             avif;',
      '    image/x-icon           ico;',
      '    font/woff2             woff2;',
      '    font/woff              woff;',
      '    application/wasm       wasm;',
      '  }',
      '  default_type application/octet-stream;',
      '',
      '  # "/about" should serve about.html — without this nginx 404s clean URLs',
      '  location / {',
      '    try_files $uri $uri.html $uri/ =404;',
      '  }',
      '  error_page 404 /404.html;',
      '  # HTML always revalidates so a redeploy is picked up immediately;',
      '  # fingerprinted assets can cache hard.',
      '  # HTML, CSS and JS are regenerated under the SAME filenames on every',
      '  # rebuild, so they must revalidate — caching them hard means a visitor',
      '  # keeps a stale stylesheet for days and the redeploy looks like it failed.',
      '  location ~* \\.(html|css|js)$ { add_header Cache-Control "no-cache"; }',
      '  # Content-addressed media can cache hard.',
      '  location ~* \\.(jpg|jpeg|png|webp|gif|svg|avif|ico|woff2?)$ { expires 7d; add_header Cache-Control "public"; }',
      '  gzip on;',
      '  gzip_types text/css application/javascript image/svg+xml application/json;',
      '}',
      '',
    ].join('\n')
    const staticDockerfile = [
      '# ForgeAI static site — served by nginx with clean-URL support',
      'FROM nginx:1.27-alpine',
      'COPY . /usr/share/nginx/html',
      'COPY nginx.conf /etc/nginx/conf.d/default.conf',
      'EXPOSE 80',
      'CMD ["nginx", "-g", "daemon off;"]',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(localPath, 'nginx.conf'), nginxConf, 'utf-8')
    fs.writeFileSync(path.join(localPath, 'Dockerfile'), staticDockerfile, 'utf-8')
    for (const [p, content] of [['nginx.conf', nginxConf], ['Dockerfile', staticDockerfile]] as [string, string][]) {
      const entry = allChanges.find((c) => c.path === p)
      if (entry) entry.after = content
      else allChanges.push({ path: p, before: '', after: content, ...diffStats('', content) })
    }
    await updateTask(task, {}, '🛡️ Ensured the known-good static Dockerfile + nginx config (clean URLs like /about, correct MIME types, gzip)', 'warn')
  }

  // ── ForgeAI MERN guard ──
  // Builder-created MERN repos have a FIXED layout (root package.json,
  // server/index.js, client/ built by Vite into client/dist, no lockfiles).
  // Model-written Dockerfiles routinely COPY lockfiles that don't exist,
  // point at client/build, or add curl healthchecks node images can't run —
  // all fatal at build time. Ship the known-good Dockerfile instead.
  const isForgeMern =
    fs.existsSync(path.join(localPath, 'server', 'index.js')) &&
    fs.existsSync(path.join(localPath, 'client', 'package.json'))
  if (isForgeMern) {
    const mernDockerfile = [
      '# ForgeAI MERN app — build the Vite client, run the Express server',
      'FROM node:20-alpine AS client-build',
      'WORKDIR /app',
      'COPY client/package.json ./client/',
      'RUN npm install --prefix client',
      'COPY client ./client',
      'RUN npm run build --prefix client',
      '',
      'FROM node:20-alpine',
      'WORKDIR /app',
      'ENV NODE_ENV=production',
      'COPY package.json ./',
      'RUN npm install --omit=dev',
      'COPY server ./server',
      'COPY --from=client-build /app/client/dist ./client/dist',
      'EXPOSE 4000',
      'CMD ["node", "server/index.js"]',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(localPath, 'Dockerfile'), mernDockerfile, 'utf-8')
    const entry = allChanges.find((c) => c.path === 'Dockerfile')
    if (entry) entry.after = mernDockerfile
    else allChanges.push({ path: 'Dockerfile', before: '', after: mernDockerfile, ...diffStats('', mernDockerfile) })
    await updateTask(task, {}, '🛡️ Ensured the known-good MERN Dockerfile (builds client/dist and serves it via Express — deterministic Docker deploy)', 'warn')

    // Vercel-adapter pattern guard: some Blitz Deploy runs generate a
    // server/app.js that is API-only (no static serving) plus a thin
    // server/index.js that requires it. In a Docker/Render deploy that
    // means every non-/api/ request hits the app's 404 handler and returns
    // {"error":"Not found"} — the React client never renders even though
    // client/dist is in the image. Patch app.js to serve client/dist with
    // an SPA fallback before its 404 catch-all.
    const appJsPath = path.join(localPath, 'server', 'app.js')
    if (fs.existsSync(appJsPath)) {
      const src = fs.readFileSync(appJsPath, 'utf-8')
      const hasStatic = /express\.static\s*\(/.test(src)
      const hasSpaFallback = /sendFile\s*\([^)]*index\.html/i.test(src)
      const hasRouteMounts = /require\s*\(\s*['"`]\.\/routes\//.test(src)
      if (!hasStatic || !hasSpaFallback || !hasRouteMounts) {
        // Auto-mount every server/routes/*.routes.js the model generated but
        // left un-wired (the "// Mount your routes here" placeholder pattern).
        const routeMountBlock = hasRouteMounts ? '' : [
          '',
          "// ForgeAI: auto-mount every routes file — model left placeholder comments",
          "// where the mounts should be, so /api/users, /api/messages etc. 404'd.",
          "const __faRoutesFs = require('fs');",
          "const __faRoutesPath = require('path');",
          "const __faRoutesDir = __faRoutesPath.join(__dirname, 'routes');",
          "if (__faRoutesFs.existsSync(__faRoutesDir)) {",
          "  for (const __faF of __faRoutesFs.readdirSync(__faRoutesDir)) {",
          "    const __faM = __faF.match(/^(.+)\\.routes\\.js$/);",
          "    if (!__faM) continue;",
          "    const __faModel = __faM[1].toLowerCase();",
          "    const __faMount = '/api/' + (__faModel.endsWith('s') ? __faModel : __faModel + 's');",
          "    try { app.use(__faMount, require('./routes/' + __faF)); }",
          "    catch (__faErr) { console.error('Failed to mount ' + __faF, __faErr.message); }",
          "  }",
          "}",
          '',
        ].join('\n')

        const staticBlock = (hasStatic && hasSpaFallback) ? '' : [
          '',
          "// ForgeAI: serve the built React client (Docker deploy). Injected",
          "// because this app.js lacked static serving — every non-API request",
          "// was hitting the 404 handler instead of the SPA.",
          "const __faPath = require('path');",
          "const __faFs = require('fs');",
          "const __faDist = __faPath.join(__dirname, '..', 'client', 'dist');",
          "if (__faFs.existsSync(__faDist)) {",
          "  app.use(express.static(__faDist));",
          "  app.get(/^\\/(?!api\\/).*/, function (req, res) {",
          "    res.sendFile(__faPath.join(__faDist, 'index.html'));",
          "  });",
          "}",
          '',
        ].join('\n')
        // Inject route mounts THEN static-serving THEN the existing 404 handler.
        // Route mounts must go BEFORE static so API routes are matched first.
        const injectBlock = routeMountBlock + staticBlock
        let patched: string
        const catchAllMatch = src.match(/app\.use\s*\(\s*\(\s*req\s*,\s*res\s*\)\s*=>\s*\{[\s\S]*?res\.status\s*\(\s*404\s*\)[\s\S]*?\}\s*\)\s*;?/)
        if (catchAllMatch && catchAllMatch.index !== undefined) {
          patched = src.slice(0, catchAllMatch.index) + injectBlock + '\n' + src.slice(catchAllMatch.index)
        } else {
          patched = src.replace(/(module\.exports\s*=\s*app;?)/, `${injectBlock}\n$1`)
        }
        fs.writeFileSync(appJsPath, patched, 'utf-8')
        const appEntry = allChanges.find((c) => c.path === 'server/app.js')
        if (appEntry) appEntry.after = patched
        else allChanges.push({ path: 'server/app.js', before: src, after: patched, ...diffStats(src, patched) })
        const patched_bits: string[] = []
        if (!hasRouteMounts) patched_bits.push('auto-mounted routes/*.routes.js')
        if (!hasStatic || !hasSpaFallback) patched_bits.push('added static serving + SPA fallback')
        await updateTask(task, {}, `🛡️ Patched server/app.js: ${patched_bits.join(', ')} (would have shipped a dead API + naked client)`, 'warn')
      }
    }
  }

  // Extract the summary section for the task summary
  const summaryMatch = response.content.match(/## Deployment Summary[\s\S]*$/)
  let summary = summaryMatch
    ? summaryMatch[0].replace(/<file[\s\S]*?<\/file>/g, '').trim()
    : `⚡ Blitz Deploy complete — generated ${allChanges.length} deployment file(s): ${allChanges.map((c) => c.path).join(', ')}`

  // ── Push generated configs to a branch (Render/Railway build from GitHub) ──
  // Docker is configs-only (self-host), Vercel uploads files directly — neither
  // needs a GitHub push. Only Render and Railway require the code on GitHub.
  const platformNeedsGitHub = platform === 'render' || platform === 'railway'
  let pushed = false
  let restoreBranch: string | undefined

  // Fetch the GitHub token once so we can push with auth directly — we never
  // rely on `origin` being configured in the local repo because it may not be
  // (e.g. a build-site repo that was created without a GitHub push).
  let blitzGhToken: string | undefined
  if (platformNeedsGitHub) {
    const ghUser = await User.findById(job.data.userId).select('+githubAccessToken')
    blitzGhToken = ghUser?.githubAccessToken ?? undefined
  }

  /** Build an authenticated push URL. Falls back to `origin` only as a last resort. */
  const blitzPushUrl = (fullName: string): string => {
    if (blitzGhToken && /^[^/]+\/[^/]+$/.test(fullName)) {
      return `https://${blitzGhToken}@github.com/${fullName}.git`
    }
    return 'origin'
  }

  if (allChanges.length && platformNeedsGitHub) {
    if (!blitzGhToken) {
      await updateTask(task, {}, 'Cannot push deployment configs — GitHub account not connected. Go to Settings → GitHub to connect your account.', 'warn')
    } else {
      const git = simpleGit(localPath)
      const pushUrl = blitzPushUrl(repoFullName)
      try {
        // Local folders are the user's own working copy — remember their branch
        // so we can put them back on it after pushing the configs
        if (isLocal) {
          try { restoreBranch = (await git.branchLocal()).current || undefined } catch {}
        }
        await git.addConfig('user.name', 'ForgeAI')
        await git.addConfig('user.email', 'bot@forgeai.dev')
        // Repos are cloned with --depth 1 (shallow). A shallow clone cannot
        // push branches back to GitHub because the parent commit referenced
        // by the new commit is not in the local pack. Unshallow first so
        // GitHub's index-pack can verify the full object graph.
        if (fs.existsSync(path.join(localPath, '.git', 'shallow'))) {
          await updateTask(task, {}, 'Fetching full git history (shallow clone)…')
          try { await simpleGit(localPath).env(gitEnv()).fetch([pushUrl, '--unshallow']) } catch { /* already full-depth */ }
        }
        await git.checkout(['-B', 'forgeai/blitz-deploy'])
        // Local: stage ONLY the generated files — never sweep up the user's
        // uncommitted work. Cloned repos are ForgeAI-managed, so add all.
        if (isLocal) await git.add(allChanges.map((c) => c.path))
        else await git.add('.')
        await git.commit(`ForgeAI Blitz Deploy: ${platform} configs`)
        await git.push([pushUrl, 'forgeai/blitz-deploy', '--force'])
        pushed = true
        await updateTask(task, {}, 'Pushed deployment configs to branch: forgeai/blitz-deploy')
        // Ensure a clean public origin is set for subsequent operations
        await git.removeRemote('origin').catch(() => {})
        await git.addRemote('origin', `https://github.com/${repoFullName}.git`).catch(() => {})
      } catch (err: any) {
        const errMsg = (err.message as string).replace(/https?:\/\/[^@]+@/g, 'https://')
        // GitHub rejects pushes touching .github/workflows/ unless the OAuth
        // token has the 'workflow' scope — retry without the CI files
        if (/workflow/i.test(errMsg)) {
          try {
            const ciFiles = allChanges.filter((c) => c.path.replace(/\\/g, '/').startsWith('.github/workflows/'))
            for (const ci of ciFiles) fs.rmSync(path.join(localPath, ci.path), { force: true })
            await git.add(['-A'])
            await git.commit('ForgeAI Blitz Deploy: configs (CI workflow omitted)')
            await git.push([pushUrl, 'forgeai/blitz-deploy', '--force'])
            pushed = true
            await updateTask(task, {}, 'GitHub token lacks the "workflow" scope, so the CI workflow was not pushed. Log out and sign in with GitHub again to grant it.', 'warn')
          } catch (err2: any) {
            await updateTask(task, {}, `Could not push configs to GitHub: ${(err2.message as string).replace(/https?:\/\/[^@]+@/g, 'https://')}`, 'warn')
          }
        } else {
          await updateTask(task, {}, `Could not push configs to GitHub: ${errMsg}`, 'warn')
        }
      }
    }
  }

  // ── Deploy for real and get the live URL ──
  if (deployToken && platform !== 'docker') {
    await updateTask(task, { progress: 80 }, `🚀 Deploying to ${platform}…`)

    const dockerfileGenerated = allChanges.some((c) => c.path === 'Dockerfile' && !c.before)
    const repoDoc = await Repository.findById(task.repositoryId).select('+builderEnv')
    const envVars = Object.entries(repoDoc?.builderEnv ?? {})
      .filter(([, v]) => typeof v === 'string' && v)
      .map(([key, value]) => ({ key, value: value as string }))

    const deployName = repoName ?? repoFullName?.split('/').pop() ?? 'forgeai-app'
    const deployBranch = platform === 'render' && pushed ? 'forgeai/blitz-deploy' : (branch ?? 'main')

    // ── AI-powered auto-fix retry loop (Render only) ──────────────────────────
    // 1. Trigger deploy, wait for build status via Render API
    // 2. If build fails: fetch logs → AI diagnoses and rewrites broken files
    // 3. Commit + push the fix → re-trigger deploy
    // 4. Repeat up to MAX_AUTOFIX_ATTEMPTS times
    const MAX_AUTOFIX_ATTEMPTS = 4
    let deploySuccess = false
    let deployUrl = ''
    let deployDashboard = ''
    let lastError = ''

    for (let attempt = 0; attempt <= MAX_AUTOFIX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await updateTask(task, { progress: 82 + attempt },
          `🤖 Auto-fix ${attempt}/${MAX_AUTOFIX_ATTEMPTS}: fetching Render build logs…`)

        // Fetch logs from the failed build
        const serviceId: string | undefined = repoDoc?.deployState?.[platform]?.serviceId
        const deployId: string | undefined = repoDoc?.deployState?.[platform]?.deployId
        const buildLogs = serviceId && deployId
          ? await fetchRenderLogs(serviceId, deployId, deployToken)
          : '(deploy ID not available — cannot fetch Render logs)'

        await updateTask(task, {}, `Build logs (last 8k):\n${buildLogs.slice(0, 500)}…`)
        await updateTask(task, {}, `🤖 Asking AI to diagnose and fix the build failure…`)

        // Read current Dockerfile and key config files for context
        const configSnippets: string[] = []
        for (const f of ['Dockerfile', 'docker-compose.yml', 'render.yaml', 'package.json', '.dockerignore']) {
          const p = path.join(localPath, f)
          if (fs.existsSync(p)) {
            configSnippets.push(`### ${f}\n\`\`\`\n${fs.readFileSync(p, 'utf-8').slice(0, 2000)}\n\`\`\``)
          }
        }

        const fixResponse = await chatWithContinuation(
          provider,
          [{
            role: 'user',
            content: `A ${platform} deployment failed. Diagnose the build logs and rewrite ONLY the files that are causing the failure.

BUILD LOGS (from Render):
\`\`\`
${buildLogs}
\`\`\`

CURRENT DEPLOYMENT FILES:
${configSnippets.join('\n\n')}

Rules:
- Return ONLY files that need to change. Do NOT regenerate everything.
- Fix the exact error shown in the logs — don't guess at unrelated problems.
- If the Dockerfile is the issue, rewrite it completely so it works.
- If a package is missing, add it. If a path is wrong, fix it.
- Return files in the standard format:

<file path="relative/path">
file content here
</file>

After the files, write one sentence starting with "FIX:" explaining what you changed.`,
          }],
          `You are ForgeAI Deploy Doctor. You fix broken Docker / cloud deployment configs by reading the actual build logs. Be surgical — only rewrite files that are directly causing the failure. Always output complete, working file content.`,
        )

        const fixedFiles = parseAIChanges(fixResponse.content)
        if (fixedFiles.length === 0) {
          await updateTask(task, {}, '⚠️ AI could not identify fixable files from the logs — retrying deploy as-is', 'warn')
        } else {
          for (const change of fixedFiles) {
            const absPath = path.join(localPath, change.path)
            if (!absPath.startsWith(localPath)) continue
            fs.mkdirSync(path.dirname(absPath), { recursive: true })
            const before = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : ''
            fs.writeFileSync(absPath, change.content, 'utf-8')
            const existing = allChanges.find(c => c.path === change.path)
            if (existing) existing.after = change.content
            else allChanges.push({ path: change.path, before, after: change.content, ...diffStats(before, change.content) })
            await updateTask(task, {}, `🔧 Fixed: ${change.path}`)
          }

          // Commit and push the fix
          const git = simpleGit(localPath)
          try {
            await git.addConfig('user.name', 'ForgeAI')
            await git.addConfig('user.email', 'bot@forgeai.dev')
            if (attempt === 1 && fs.existsSync(path.join(localPath, '.git', 'shallow'))) {
              try { await simpleGit(localPath).env(gitEnv()).fetch([blitzPushUrl(repoFullName), '--unshallow']) } catch { /* already full */ }
            }
            await git.add(fixedFiles.map(f => f.path))
            await git.commit(`ForgeAI Auto-fix attempt ${attempt}: ${fixedFiles.map(f => f.path).join(', ')}`)
            await git.push([blitzPushUrl(repoFullName), 'forgeai/blitz-deploy', '--force'])
            await updateTask(task, {}, `Pushed auto-fix to forgeai/blitz-deploy`)
          } catch (gitErr: any) {
            await updateTask(task, {}, `Could not push fix: ${(gitErr.message as string).replace(/https?:\/\/[^@]+@/g, 'https://')}`, 'warn')
            // If there is no remote, further auto-fix attempts are pointless
            if (/no remote|does not appear to be a git/i.test(gitErr.message)) {
              lastError = gitErr.message
              break
            }
          }
        }
      }

      // Trigger the deploy
      try {
        const remoteHasDockerfile = fs.existsSync(path.join(localPath, 'Dockerfile')) && (pushed || !dockerfileGenerated)
        const result = await deploy(
          platform,
          {
            localPath,
            token: deployToken,
            repoFullName,
            name: deployName,
            branch: deployBranch,
            remoteHasDockerfile,
            existing: attempt === 0 ? repoDoc?.deployState?.[platform] : repoDoc?.deployState?.[platform],
            envVars: envVars.length ? envVars : undefined,
          },
          (message, level = 'info') => updateTask(task, {}, message, level),
        )

        if (repoDoc && result.state) {
          repoDoc.set(`deployState.${platform}`, result.state)
          repoDoc.markModified('deployState')
          await repoDoc.save()
        }
        task.metadata = { ...task.metadata, deploymentUrl: result.url, dashboardUrl: result.dashboardUrl }
        task.markModified('metadata')
        deployUrl = result.url
        deployDashboard = result.dashboardUrl ?? ''

        // ── For Render: poll the actual build status ──────────────────────
        if (platform === 'render') {
          const serviceId: string | undefined = result.state?.serviceId
          // Fall back to fetching the latest deploy ID if the API didn't return one
          const deployId: string | undefined =
            result.state?.deployId ??
            (serviceId ? await getLatestRenderDeployId(serviceId, deployToken) : undefined)

          if (serviceId && deployId) {
            // Persist the deploy ID so the auto-fix loop can fetch logs on the next iteration
            if (repoDoc) {
              repoDoc.set(`deployState.${platform}.deployId`, deployId)
              repoDoc.markModified('deployState')
              await repoDoc.save()
            }
            await updateTask(task, { progress: 88 + attempt },
              `⏳ Watching Render build (attempt ${attempt + 1}/${MAX_AUTOFIX_ATTEMPTS + 1})…`)

            const buildResult = await waitForRenderDeploy(serviceId, deployId, deployToken,
              (msg, level) => updateTask(task, {}, msg, level))

            if (buildResult.success) {
              deploySuccess = true
              await updateTask(task, { progress: 95 },
                `✅ Render build succeeded${attempt > 0 ? ` on auto-fix attempt ${attempt}` : ''}!`)
              break
            } else {
              lastError = `Render build status: ${buildResult.status}`
              await updateTask(task, {}, `❌ Build failed (${buildResult.status})${attempt < MAX_AUTOFIX_ATTEMPTS ? ' — AI will fix and retry…' : ''}`, 'warn')
            }
          } else {
            // No deploy ID — can't poll, fall through to URL ping
            deploySuccess = true
            break
          }
        } else {
          // Non-Render: poll by URL (existing behaviour)
          await updateTask(task, { progress: 90 }, '⏳ Waiting for the first build to finish…')
          const liveBy = Date.now() + 6 * 60_000
          let live = false
          while (Date.now() < liveBy && !live) {
            await sleep(15_000)
            try {
              const probe = await axios.get(result.url, { timeout: 20_000, maxRedirects: 5, validateStatus: () => true })
              const type = String(probe.headers['content-type'] ?? '')
              const noServer = String(probe.headers['x-render-routing'] ?? '').includes('no-server')
              live = probe.status >= 200 && probe.status < 400 && type.includes('text/html') && !noServer
            } catch { /* still building */ }
          }
          deploySuccess = true
          await updateTask(task, { progress: 95 }, live
            ? `🌐 Live: ${result.url}`
            : `🌐 Deployed: ${result.url} — build still finishing, give it a moment.`)
          break
        }
      } catch (err: any) {
        lastError = err.message
        await updateTask(task, {}, `Deploy API error: ${err.message}`, 'error')

        // Non-retryable errors: quota limits, auth failures, missing remote.
        // Auto-fix cannot help with these — break immediately.
        const nonRetryable = /limited to \d+ services|quota|unauthorized|403|401|no remote|does not appear to be a git/i.test(err.message)
        if (nonRetryable || attempt >= MAX_AUTOFIX_ATTEMPTS) break
      }
    }

    if (deploySuccess && deployUrl) {
      const fixNote = (() => {
        const fixed = allChanges.filter(c => c.path !== 'Dockerfile' || !c.before).length
        return fixed > 0 ? '' : ''
      })()
      await updateTask(task, { progress: 95 }, `🌐 Deployed and serving! ${deployUrl}`)
      summary = `## 🌐 Your site is live\n\n**[${deployUrl}](${deployUrl})**${deployDashboard ? `\n\n[Platform dashboard](${deployDashboard})` : ''}\n\n---\n\n${summary}`
    } else {
      await updateTask(task, {}, `Deployment failed: ${lastError}`, 'error')

      // Compose a tailored failure message based on what went wrong
      let failureAdvice = 'The generated files are in the repo — you can inspect them and fix manually, or re-run Blitz Deploy.'
      if (/limited to \d+ services/i.test(lastError)) {
        failureAdvice = '**You have reached Render\'s service limit.** Go to [dashboard.render.com](https://dashboard.render.com), delete an unused service, then re-run Blitz Deploy.'
      } else if (/no remote|does not appear to be a git/i.test(lastError)) {
        failureAdvice = '**No GitHub remote is configured for this repo.** Run:\n```\ngit remote add origin https://github.com/<you>/<repo>.git\ngit push -u origin main\n```\nthen re-run Blitz Deploy.'
      } else if (/unauthorized|403|401/i.test(lastError)) {
        failureAdvice = '**Authentication failed.** Check that your Render token (in Settings → Deploy Tokens) is valid and has not expired, then re-run.'
      }

      summary = `## ⚠️ Deployment failed\n\n**Error:** ${lastError}\n\n${failureAdvice}\n\n---\n\n${summary}`
    }
  }

  // Put the user back on the branch they were working on (local folders only)
  if (restoreBranch && restoreBranch !== 'forgeai/blitz-deploy') {
    try {
      await simpleGit(localPath).checkout(restoreBranch)
      await updateTask(task, {}, `Switched back to your branch: ${restoreBranch}`)
    } catch (err: any) {
      await updateTask(task, {}, `Could not switch back to branch "${restoreBranch}": ${err.message}`, 'warn')
    }
  }

  task.changes = allChanges
  task.status = 'completed'
  task.progress = 100
  task.summary = summary
  await task.save()
  emitTaskUpdate(taskId, task.toObject())
}


// ═══ AI WEBSITE BUILDER (Lovable-style) ═══════════════════
// Prompt → complete static website → new GitHub repo → ready to deploy
// with the existing Blitz Deploy flow.

const BUILDER_SYSTEM_PROMPT = `You are ForgeAI Builder, an elite web designer and frontend engineer. You build COMPLETE, polished, production-ready static websites. You are asked for ONE file at a time — output limits are small, so each reply contains exactly the requested file.

QUALITY BAR — the site must look like a designer built it (think Linear, Stripe, Vercel, Lovable), never "AI-generated filler":
- Follow the DESIGN BRIEF you are given EXACTLY — its palette, fonts, type scale, spacing, and motifs. Never fall back to a generic default (never violet #8b5cf6 on slate #0f172a unless the brief says so).
- A REAL type scale: big, confident headings using clamp() (hero h1 ~clamp(2.5rem, 6vw, 4.5rem), tight line-height ~1.05), a clear step down to body. Gradient text on ONE accent word of the hero headline when it fits the brand.
- DEPTH, not flat: layered box-shadows, subtle gradients or a soft radial "mesh" backdrop on the hero, 1px translucent borders on cards, rounded corners. Nothing should look like an unstyled block.
- RHYTHM: generous section padding (clamp(64px,10vw,120px) vertical), consistent spacing scale, aligned grids, a max-width content column.
- Micro-interactions: smooth transitions (~180ms ease), hover/focus states on every interactive element (lift, glow, or color shift), tasteful scroll-reveal — never gratuitous.
- Typography: link the brief's Google Font pairing in each page's <head> (a display font for headings + a clean body font). Load the weights you use.
- Favicon: every page's <head> MUST include an inline emoji favicon, e.g. <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚀</text></svg>"> (pick an emoji matching the site's theme).
- CONTRAST IS NON-NEGOTIABLE: never light text on light backgrounds or dark on dark.
- MEDIA — the site must be MEDIA-RICH, everything loaded from the web with URLs that ALWAYS resolve. If the DESIGN BRIEF includes a PHOTO LIBRARY, use THOSE exact URLs for real photos (they are topical + always load); otherwise use high-quality photos via https://picsum.photos/seed/{seed}/{w}/{h} where {seed} is a short UNIQUE word+number per image (e.g. hero1, gallery2, feature3) so each image is distinct and STABLE across reloads (sizes hero ≥ 1600 wide, gallery/cards ≥ 600 wide); avatars via https://i.pravatar.cc/300?img={n}. The HOME hero MUST have a full-bleed background image (a positioned <img> covering the section, or CSS background-image) WITH a dark gradient overlay so the headline stays perfectly legible. Put PLENTY of images across every page. Include at least one VIDEO — a relevant YouTube embed (<iframe src="https://www.youtube.com/embed/VIDEO_ID" allowfullscreen> in a responsive 16:9 wrapper), or a muted autoplay <video autoplay muted loop playsinline>. Present images CLEANLY: object-fit: cover, tidy rounded corners — NEVER rotate/tilt/skew/overlap. Explicit width & height + descriptive alt on every <img>. Never reference local files that don't exist.
- DYNAMIC & ANIMATED: make the site feel alive — smooth entrance/scroll-reveal animations, hover/focus micro-interactions, and a loading animation on page load. Rich and lively, never gratuitous.
- Every section earns its place: a real hero with headline + subhead + primary CTA, a sticky translucent (backdrop-blur) nav, meaningful content sections, and a rich footer. Working links between all pages.
- Semantic HTML5; interactivity lives in script.js, styles live in styles.css — do NOT inline <style> or <script> blocks in HTML pages beyond tiny critical snippets.

⚠️ DESIGN SYSTEM RULES — BREAKS THAT MAKE SITES LOOK AMATEUR:
- NEVER use border-style: dashed or border-style: dotted ANYWHERE — not on nav links, not on cards, not on buttons, not on any element. Dashed borders make sites look vibe-coded instantly. All borders must be solid or none.
- NEVER add any border to nav anchor tags (<a> inside nav/header) — the design pack already styles them with no border. Adding dashed/dotted/solid borders to nav links is the #1 dead giveaway of AI-generated sites.
- NEVER write border-style: dashed anywhere in styles.css. Search your output before returning it.
- Sections should alternate visually — use the pack's .section class and set background: var(--surface) on every other section for visual rhythm. Never leave a long stretch of identical white.
- The .cta-section class creates a beautiful gradient call-to-action block — use it instead of a plain white CTA.
- Nav must have BOTH a semi-opaque background (≥80% opacity) AND backdrop-filter: blur() — a blurred nav with no background lets content smear through and looks broken.
- GALLERY IMAGES: Use a subtle gradient overlay (linear-gradient from rgba(0,0,0,0.5) at bottom to transparent) that only appears ON HOVER. NEVER write a flat dark overlay that covers the whole image at full opacity — it makes photos look black and kills the gallery. Structure: <div class="gallery-item"><img src="..." alt="..."/><div class="gallery-overlay"><span>caption</span></div></div>
- GALLERY GRID: When a gallery has an uneven number of items (e.g. 5 items in 3 columns), the last item should NOT be lonely — use grid-column: span 2 on the last odd item, or use an even number of items.
- TEXT CONTRAST: If a section has a light background (var(--bg), var(--surface), or any white/cream color), text MUST use var(--text) or var(--text-muted) — NEVER white (#fff) or rgba(255,255,255,*). White text on a cream background is invisible. Only use white text inside .hero, .cta-section, .dark, or elements with a dark background.

Return ONLY the requested file, in exactly this format (complete content, no placeholders, no "..."):
<file path="relative/path">
content
</file>`

/** Models sometimes wrap CSS in HTML tags or leave chatter lines — PostCSS
 *  fails the whole build on a single stray `</style>`. Scrub them. */
// Element-level baseline prepended to generated app stylesheets. Guarantees
// that even a className the AI never wrote a rule for still renders decently
// (styled inputs/selects/buttons, spaced nav, constrained images). The var()
// fallbacks are replaced by the generated :root theme, which the theme
// request is required to define.
// ═══ ForgeAI Design System ════════════════════════════════
// A complete, themable component baseline prepended to every generated
// stylesheet. Sites no longer depend on the AI writing a good stylesheet from
// scratch — the AI only sets the brand tokens (:root, from the design brief)
// and writes markup using this class vocabulary. Because these classes are
// already styled here, the per-page CSS step treats them as covered and stops
// regenerating them — which is exactly the variance that produced ugly sites.
// The BUILDER/MERN system prompts document this vocabulary to the model.
// Load-time dynamic effects: a page fade-in plus a spinner preloader overlay.
// `.page-loader` (static pages) auto-hides via CSS after ~1s so it needs no JS;
// `.app-loading` (MERN, rendered inside #root) is removed when React mounts.
// CSS-only safety net for reveal-on-scroll patterns. Even if JS fails to
// load (rare but possible on slow phones), no element can stay invisible
// forever — after 3s an animation force-fades in anything that still hasn't
// received its visibility class. Runs alongside the JS observer, harmless
// when both fire (the JS class already made it visible, animation ends
// where it started).
const REVEAL_SAFETY_CSS = `/* Reveal safety net — nothing stays invisible past 3s regardless of which
   class-name convention Gemini invented on this particular build. */
/* Only assert opacity + visibility. Locking transform via animation-forwards
   kills every subsequent hover translation on the same element (:hover { transform: translateY(-6px) } stops firing because the animation's held !important wins). */
@keyframes fa-reveal-safety { to { opacity: 1 !important; visibility: visible !important; } }
.scroll-reveal:not(.is-visible),
.reveal:not(.active):not(.is-visible),
.fade-in:not(.visible):not(.in),
.slide-in:not(.visible):not(.in),
.fade-up:not(.is-visible),
.fade-down:not(.is-visible),
.zoom-in:not(.is-visible),
.animate:not(.animated),
.will-animate:not(.animated),
.animate-on-scroll:not(.animated):not(.in-view),
.animate-on-load:not(.in-view):not(.visible),
[data-aos]:not(.aos-animate),
[data-reveal]:not(.in-view):not(.is-visible),
[data-scroll]:not(.is-inview):not(.in-view),
[data-animate]:not(.is-visible):not(.animated) {
  animation: fa-reveal-safety .8s ease 3s forwards !important;
}
`

const LOADING_CSS = `/* Page load: fade-in + spinner preloader */
@keyframes fa-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes fa-spin { to { transform: rotate(360deg); } }
@keyframes fa-loader-out { to { opacity: 0; visibility: hidden; } }
body { animation: fa-fade-in .5s ease both; }
.page-loader, .app-loading { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: var(--bg); }
.page-loader { animation: fa-loader-out .5s ease 1s forwards; }
.loader-ring, .spinner { width: 48px; height: 48px; border-radius: 50%; border: 4px solid var(--border); border-top-color: var(--primary); animation: fa-spin .8s linear infinite; }
/* Kill any model-invented preloader after 2s — it expects JS handlers we
   didn't write, so left alone it spins forever. Fires even if script.js
   fails to load, so the page is never permanently stuck. */
@keyframes fa-preloader-kill { 0%, 90% { opacity: 1; visibility: visible; } 100% { opacity: 0; visibility: hidden; } }
#preloader, .preloader, #pre-loader, .pre-loader,
#loading-overlay, .loading-overlay, #loading-screen, .loading-screen,
.site-preloader, .page-preloader {
  animation: fa-preloader-kill 2s ease forwards !important;
  pointer-events: none !important;
}
/* body.loading-state and friends: the JS scrub removes these; belt-and-suspenders
   is to make sure they never hide the body content even while set. */
body.loading-state, body.loading, body.is-loading, body.preload,
html.loading-state, html.loading, html.is-loading, html.preload {
  overflow: auto !important;
  visibility: visible !important;
  opacity: 1 !important;
}
`

// Appended LAST to BOTH stylesheets (after all generated CSS) so it always wins.
// Fixes the most common generated-CSS bug: a .gradient-text with a gradient
// background but NO `background-clip: text` renders as a solid gradient RECTANGLE
// instead of gradient-colored text. The first rule guarantees a fallback gradient;
// the !important rule forces the clip + transparent fill no matter what the model
// wrote (even via a more-specific selector).
// Deterministic mobile hamburger nav — CSS + a tiny enhancer script that injects
// the toggle button into any generated <header> nav (and, via MutationObserver,
// survives React re-renders). Applied to BOTH builders so nav is ALWAYS a
// hamburger on phones, regardless of what markup the model produced.
// Older templates often have NO <nav> element at all — the menu is a plain <ul>
// of <li> inside a div.header. Selector-based injection misses those completely
// and the page ships with a 400px-tall wall of links on a phone. The enhancer
// therefore FINDS the real menu (the container holding the most links) and tags
// it `.fa-mobile-menu`, so the CSS below can target it whatever it is called.
const MOBILE_MENU_CSS = `/* ── Mobile menu (works with any markup) ── */
@media (max-width: 820px) {
  .fa-has-menu { position: relative !important; }
  .fa-mobile-menu {
    display: none !important; position: absolute !important; top: 100%; left: 0; right: 0;
    background: var(--bg, #fff) !important; border-top: 1px solid rgba(0,0,0,.12);
    box-shadow: 0 16px 30px -20px rgba(0,0,0,.5); max-height: 70vh; overflow-y: auto;
    padding: .5rem .9rem !important; margin: 0 !important; z-index: 999; list-style: none !important;
  }
  .fa-mobile-menu.fa-open { display: block !important; }
  .fa-mobile-menu li { display: block !important; width: 100% !important; float: none !important; height: auto !important; }
  .fa-mobile-menu a {
    display: block !important; width: auto !important; height: auto !important;
    line-height: 1.4 !important; padding: .6rem 0 !important; font-size: 1rem !important;
  }
  .fa-burger {
    display: inline-flex !important; flex-direction: column; gap: 5px; align-items: center; justify-content: center;
    width: 44px; height: 44px; padding: 0; border: 0; background: transparent; cursor: pointer;
    position: absolute !important; right: 12px; top: 10px; z-index: 1000;
  }
  .fa-burger span { display: block; width: 24px; height: 2px; background: var(--text, #222); border-radius: 2px; }
}
`

const MOBILE_MENU_JS = `(function(){
  function setup(){
    var hdr = document.querySelector('header, .header, .site-header, .navbar, .top, .main-header');
    if (!hdr || hdr.querySelector('.fa-burger')) return;
    var menu = hdr.querySelector('nav ul, nav, .nav-links');
    if (!menu) {
      var best = null, bestN = 0;
      hdr.querySelectorAll('ul').forEach(function(ul){
        var n = ul.querySelectorAll('a').length; if (n > bestN) { bestN = n; best = ul; }
      });
      if (bestN >= 3) menu = best;
    }
    if (!menu) return;
    menu.classList.add('fa-mobile-menu');
    hdr.classList.add('fa-has-menu');
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'fa-burger'; btn.setAttribute('aria-label', 'Menu');
    btn.innerHTML = '<span></span><span></span><span></span>';
    btn.addEventListener('click', function(){ menu.classList.toggle('fa-open'); });
    menu.addEventListener('click', function(e){
      if (e.target && e.target.closest && e.target.closest('a')) menu.classList.remove('fa-open');
    });
    hdr.appendChild(btn);
  }
  if (document.readyState !== 'loading') setup(); else document.addEventListener('DOMContentLoaded', setup);
  try { new MutationObserver(setup).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
})();`

const HAMBURGER_CSS = `/* ── Mobile hamburger nav (deterministic) ── */
.nav-toggle { display: none; align-items: center; justify-content: center; flex-direction: column; gap: 5px; width: 44px; height: 44px; padding: 0; background: transparent; border: 0; cursor: pointer; color: inherit; z-index: 60; }
.nav-toggle span { display: block; width: 24px; height: 2px; background: var(--text, #1a1a1a); border-radius: 2px; }
@media (max-width: 780px) {
  header, .site-header, .navbar, .main-header { position: relative; }
  .nav-toggle { display: inline-flex !important; }
  /* !important is required: the model often puts inline style="display:flex" on
     the <nav>, and inline styles beat class/media-query CSS without it. */
  header nav, .site-header nav, .navbar nav, header .nav-links {
    display: none !important; position: absolute !important; top: 100%; left: 0; right: 0;
    flex-direction: column !important; align-items: flex-start !important; gap: .15rem !important;
    background: color-mix(in srgb, var(--bg, #ffffff) 97%, transparent); padding: .75rem 1.25rem 1rem;
    border-top: 1px solid var(--border, rgba(0,0,0,.12)); box-shadow: 0 18px 34px -22px rgba(0,0,0,.55); max-height: 76vh; overflow-y: auto;
  }
  header nav.nav-open, .site-header nav.nav-open, .navbar nav.nav-open, header .nav-links.nav-open { display: flex !important; }
  header nav ul, .site-header nav ul, .navbar nav ul { flex-direction: column !important; align-items: flex-start !important; width: 100%; }
  header nav a, .site-header nav a, .navbar nav a, header .nav-links a { width: 100%; padding: .55rem 0; }
}
`
const HAMBURGER_JS = `(function(){
  function enhance(){
    var navs = document.querySelectorAll('header nav, .site-header nav, .navbar nav, header .nav-links');
    for (var i = 0; i < navs.length; i++) {
      var nav = navs[i];
      var header = nav.closest('header, .site-header, .navbar, .main-header') || nav.parentElement;
      if (!header || header.querySelector('.nav-toggle')) continue;
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'nav-toggle'; btn.setAttribute('aria-label', 'Toggle menu');
      btn.innerHTML = '<span></span><span></span><span></span>';
      (function(nav){
        btn.addEventListener('click', function(){ nav.classList.toggle('nav-open'); });
        nav.addEventListener('click', function(e){ if (e.target && e.target.closest && e.target.closest('a')) nav.classList.remove('nav-open'); });
      })(nav);
      // Insert into the nav's own flex row (with the brand) so it sits level with
      // the logo — not appended to the outer <header> where it drops to a new line.
      (nav.parentElement || header).appendChild(btn);
    }
  }
  if (document.readyState !== 'loading') enhance(); else document.addEventListener('DOMContentLoaded', enhance);
  try { new MutationObserver(enhance).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  // Add scrolled class to nav-pill and nav-minimal headers for scroll-triggered styles
  function watchScroll(){
    var headers = document.querySelectorAll('header.nav-minimal, .site-header.nav-minimal, header.nav-pill, .site-header.nav-pill');
    if (!headers.length) return;
    function onScroll(){ var y = window.scrollY || window.pageYOffset; for (var i=0;i<headers.length;i++){ headers[i].classList.toggle('scrolled', y > 40); } }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }
  if (document.readyState !== 'loading') watchScroll(); else document.addEventListener('DOMContentLoaded', watchScroll);
})();`

// Many older business sites are DESKTOP-ONLY: no viewport tag, no mobile
// breakpoints. Adding a viewport tag alone makes that worse (the page renders at
// true width with no mobile styles instead of harmlessly zoomed out), so a site
// like that needs real mobile rules. These are deliberately generic, live only
// inside a small-screen media query, and use !important because the original
// stylesheet is loaded first and often hard-codes desktop pixel widths.
const RESPONSIVE_RESCUE_CSS = `/* ── Mobile rescue: the original site had no mobile layout ── */
@media (max-width: 820px) {
  /* THE desktop lock: older templates pin "body { min-width: 1200px }", which
     keeps the page 1200px wide on every device — a phone then shows a shrunken
     desktop layout no matter what else is fixed. min-width MUST be cleared. */
  html, body { min-width: 0 !important; width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; }
  /* Nothing may be wider than the screen, and nothing may demand a desktop width */
  body * { max-width: 100% !important; min-width: 0 !important; }
  img, video, iframe, table, pre, canvas, svg { max-width: 100% !important; height: auto !important; }
  /* Desktop pixel widths → fluid */
  [style*="width:"], [width] { width: auto !important; }
  /* Multi-column rows stack */
  .row, .container, .wrapper, .flex, [class*="col-"], [class*="grid"], [class*="row"] {
    flex-direction: column !important; width: 100% !important; float: none !important;
    display: block !important; margin-left: 0 !important; margin-right: 0 !important;
  }
  /* Fixed/absolute desktop positioning breaks small screens */
  [style*="position:absolute"], [style*="position: absolute"] { position: static !important; }
  /* Header/nav wraps instead of overflowing */
  header, .header, .navbar, .nav, .top, .head {
    height: auto !important; flex-wrap: wrap !important; padding: .6rem 1rem !important;
  }
  header img, .logo img, .brand img { max-height: 44px !important; width: auto !important; }
  nav ul, .nav ul, .menu, .nav-links { flex-wrap: wrap !important; gap: .5rem 1rem !important; padding-left: 0 !important; }
  /* Desktop nav items are often pinned to a tall fixed height (e.g. 100px),
     which turns a phone header into a giant wall of links. */
  header a, .header a, .navbar a, .top a { height: auto !important; min-height: 0 !important; line-height: 1.4 !important; }
  /* Readable type and comfortable tap targets */
  body { font-size: 16px !important; line-height: 1.6 !important; }
  h1 { font-size: clamp(1.7rem, 7vw, 2.3rem) !important; }
  h2 { font-size: clamp(1.35rem, 5.5vw, 1.8rem) !important; }
  a, button, input, select, textarea { min-height: 40px; }
  input, select, textarea { width: 100% !important; box-sizing: border-box !important; }
  /* Wide tables scroll rather than blowing out the layout */
  table { display: block !important; overflow-x: auto !important; }
  /* Big desktop side padding wastes phone space */
  section, .section, main, footer { padding-left: 1rem !important; padding-right: 1rem !important; }
}
`

// Hero contrast safety — any hero-shaped section that has a background image
// must have LIGHT text over a dark overlay, always. Claude/Gemini regularly
// pick a muted body-copy color for the hero headline and forget that the
// background is a dark photo, producing dark-on-dark text that's unreadable.
// This runs LAST and wins with !important so no generated CSS can defeat it.
const HERO_CONTRAST_SAFETY_CSS = `/* ── Hero contrast safety net (deterministic override) ── */
/* Any hero/banner/masthead section that carries a background image gets:
   - a dark gradient overlay via ::before so any text is legible
   - forced light text on every text descendant */
.hero, .hero-section, .hero-container, .hero-wrapper,
.banner, .banner-hero, .site-hero, .page-hero, .masthead, .jumbotron,
[class*="hero" i][class*="section" i], section[id*="hero" i] {
  position: relative;
}
.hero:has(img), .hero-section:has(img), .banner:has(img),
.hero[style*="background"], .hero-section[style*="background"], .banner[style*="background"] {
  /* Dark gradient overlay so any text on top stays readable regardless of the
     photo behind it. Sits above the image but below the content. */
}
.hero::before, .hero-section::before, .banner-hero::before,
.site-hero::before, .page-hero::before, .masthead::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.7) 100%);
  z-index: 1;
  pointer-events: none;
}
/* Hero image and content both need to sit above the overlay */
.hero > *:not(.hero-bg-wrapper):not(.hero-bg):not(img),
.hero-section > *:not(.hero-bg-wrapper):not(.hero-bg):not(img),
.banner > *:not(.banner-bg):not(img),
.masthead > *:not(img) { position: relative; z-index: 2; }

/* Force high-contrast text on every text element inside any hero-like
   section, and any element with a "hero" or "banner" class ancestor.
   This is deliberately aggressive — a hero must be readable. */
.hero *, .hero-section *, .hero-container *, .hero-content *,
.banner *, .banner-hero *, .site-hero *, .page-hero *,
.masthead *, .jumbotron *,
section[id*="hero" i] *, section[class*="hero" i] * {
  color: #ffffff !important;
}
/* Muted subheads inside heroes: still light, just slightly dimmed */
.hero .subtitle, .hero .subhead, .hero .hero-subtitle, .hero p:not([class]),
.hero-section .subtitle, .hero-section .subhead, .hero-section .hero-subtitle, .hero-section p:not([class]),
.banner .subtitle, .banner .subhead, .banner p:not([class]),
.masthead .subtitle, .masthead .subhead, .masthead p:not([class]) {
  color: rgba(255, 255, 255, 0.85) !important;
}
/* Eyebrow / small labels above the hero headline */
.hero .eyebrow, .hero .sub-eyebrow, .hero .tagline, .hero .badge,
.hero-section .eyebrow, .hero-section .sub-eyebrow, .hero-section .tagline,
.banner .eyebrow, .masthead .eyebrow {
  color: rgba(255, 255, 255, 0.75) !important;
}
/* Text-only CTA links in heroes ("Learn more →") — need to stand out */
.hero a:not(.btn):not(.button), .hero-section a:not(.btn):not(.button),
.banner a:not(.btn):not(.button), .masthead a:not(.btn):not(.button) {
  color: #ffffff !important;
  opacity: 0.95;
  text-decoration: underline;
  text-underline-offset: 4px;
}
`

const FINAL_FIXES_CSS = `/* ── Final deterministic fixes — appended LAST so they always win ── */

/* ── Overflow / responsive safety ── */
/* Prevent horizontal scroll caused by AI writing pixel widths on mobile */
html, body { overflow-x: hidden; max-width: 100%; }
*, *::before, *::after { box-sizing: border-box; }
img, video, iframe, table, pre, canvas, svg { max-width: 100%; }
/* Ensure images inside cards and grids never break layout */
.card img, .feature-card img, .grid img, .grid-2 img, .grid-3 img, .grid-4 img { max-width: 100%; height: auto; }

/* Gradient text fix — AI often forgets background-clip */
.gradient-text, .text-gradient { background-image: linear-gradient(100deg, var(--primary, #6d5efb), var(--accent, #22d3ee)); }
.gradient-text, .text-gradient {
  -webkit-background-clip: text !important; background-clip: text !important;
  -webkit-text-fill-color: transparent !important; color: transparent !important;
  padding: 0 !important; box-shadow: none !important; border-radius: 0 !important;
}

/* ── Anti-dashed-border hard lock ── */
/* The #1 "vibe-coded" tell: AI-injected dashed/dotted nav borders.
   This rule wins over any AI-generated border-style on nav elements. */
nav a, nav button, nav li a,
header a, header button, header li a,
.nav-links a, .nav-menu a, .navbar a,
.nav-links button, .nav-menu button {
  border-style: solid !important;
}
nav a:not(.btn-primary):not(.btn-secondary):not([class*="btn"]),
header a:not(.btn-primary):not(.btn-secondary):not([class*="btn"]):not(.nav-logo):not(.logo):not(.brand),
.nav-links a:not([class*="btn"]),
.nav-menu a:not([class*="btn"]) {
  border: none !important;
  outline-style: solid !important;
}

/* ── Gallery overlay cap ── */
/* AI often writes rgba(0,0,0,0.7+) covering the whole image — images look black.
   Force a subtle bottom-fade gradient that only appears on hover. */
.gallery-item .overlay,
.gallery-item .gallery-overlay,
.gallery-item .gallery-item-overlay,
.gallery-item::after {
  background: linear-gradient(to top, rgba(0,0,0,0.52) 0%, transparent 65%) !important;
  opacity: 0;
  transition: opacity .3s ease !important;
}
.gallery-item:hover .overlay,
.gallery-item:hover .gallery-overlay,
.gallery-item:hover .gallery-item-overlay,
.gallery-item:hover::after { opacity: 1 !important; }
/* Prevent always-on dark overlay on gallery images */
.gallery-grid img, .gallery-item img, .photo-grid img {
  filter: none !important;
}

/* ── Gallery overlay text always white ── */
/* The text-contrast rule below resets color to var(--text) on sections —
   but gallery overlays sit on dark gradients and MUST stay white. */
.gallery-overlay, .gallery-item-overlay,
.gallery-overlay *, .gallery-item-overlay * {
  color: #fff !important;
}

/* ── Text contrast safety ── */
/* White text on a light section background is invisible.
   Force text-color reset on non-hero, non-dark, non-cta sections.
   Exempt gallery overlays (handled above). */
.section:not(.hero):not(.hero-section):not(.cta-section):not(.cta-banner):not([class*="dark"]):not([class*="bg-dark"]) {
  color: var(--text);
}
.section:not(.hero):not(.hero-section):not(.cta-section):not(.cta-banner):not([class*="dark"]):not([class*="bg-dark"]) h1,
.section:not(.hero):not(.hero-section):not(.cta-section):not(.cta-banner):not([class*="dark"]):not([class*="bg-dark"]) h2,
.section:not(.hero):not(.hero-section):not(.cta-section):not(.cta-banner):not([class*="dark"]):not([class*="bg-dark"]) h3,
.section:not(.hero):not(.hero-section):not(.cta-section):not(.cta-banner):not([class*="dark"]):not([class*="bg-dark"]) p:not(.gallery-overlay p):not(.gallery-item-overlay p) {
  color: var(--text);
}
`

const BASE_CSS = `/* ═══ ForgeAI Design System — component baseline ═══════════════════
   Color/font/radius vars are owned by the design pack loaded above this.
   BASE_CSS only adds layout helpers and semantic component classes.
   ═══════════════════════════════════════════════════════════════════ */
:root {
  /* Layout helpers — not in design packs */
  --maxw: 1140px;
  --section-pad: clamp(56px, 9vw, 112px);
  --gap: clamp(1.25rem, 2.5vw, 2rem);
  --h1: clamp(2.6rem, 5.5vw, 4.5rem);
  --h2: clamp(1.7rem, 3.4vw, 2.8rem);
  --h3: clamp(1.2rem, 2vw, 1.5rem);
  /* Aliases so BASE_CSS component classes can reference pack vars by either name */
  --on-primary: #fff;
  --muted: var(--text-muted, #888);
  --radius-pill: 999px;
  --ring: 0 0 0 3px color-mix(in srgb, var(--primary) 32%, transparent);
}
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; font-family: var(--font-body); background: var(--bg); color: var(--text); line-height: 1.65; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; overflow-x: hidden; }
img, svg, video { max-width: 100%; height: auto; display: block; }
/* Hide broken images gracefully — alt text shows but no grey box */
img:not([src]), img[src=""], img { color: transparent; }
img:-moz-broken { opacity: 0; }
/* Clean image presentation — rounded, cover-fit, never distorted or tilted */
.hero img:not(.hero-bg), .hero-section img:not(.hero-bg), .showcase img, .gallery img, .card img, .feature-card img, figure img, .media img { object-fit: cover; border-radius: var(--radius); }

/* Typography */
h1, h2, h3, h4 { font-family: var(--font-heading); margin: 0 0 .5em; line-height: 1.1; }
h1 { font-size: var(--h1); letter-spacing: -.02em; font-weight: 800; line-height: 1.04; }
h2 { font-size: var(--h2); letter-spacing: -.015em; font-weight: 700; }
h3 { font-size: var(--h3); font-weight: 600; }
p { margin: 0 0 1em; }
a { color: var(--primary); text-decoration: none; transition: color .18s ease, opacity .18s ease; }
a:hover { opacity: .85; }
.lead { font-size: clamp(1.1rem, 1.6vw, 1.35rem); color: var(--muted); }
.muted { color: var(--muted); }
.eyebrow { display: inline-block; font-size: .8rem; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--primary); margin-bottom: 1rem; }
.gradient-text { background: linear-gradient(100deg, var(--primary), var(--accent)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; text-shadow: none; }

/* Layout primitives */
.container { width: 100%; max-width: var(--maxw); margin: 0 auto; padding-inline: clamp(20px, 5vw, 40px); }
.section { padding-block: var(--section-pad); position: relative; }
.section-head { max-width: 720px; margin: 0 auto clamp(2rem, 5vw, 3.5rem); text-align: center; }
.grid { display: grid; gap: var(--gap); }
.grid-2 { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.grid-3 { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.grid-4 { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }

/* Header / nav — sticky + frosted (background AND blur, never smears) */
header, .site-header, .navbar, .main-header { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; padding: 1rem clamp(20px, 5vw, 40px); background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid var(--border); }
.brand, .logo, .brand-logo { font-family: var(--font-heading); font-weight: 800; font-size: 1.25rem; letter-spacing: -.01em; color: var(--text); }
nav, .nav-links { display: flex; align-items: center; gap: clamp(1rem, 2.5vw, 2rem); flex-wrap: wrap; list-style: none; margin: 0; padding: 0; }
.nav-links a, nav a { color: var(--muted); font-weight: 500; font-size: .95rem; }
.nav-links a:hover, nav a:hover, .nav-links a.active, nav a.active, nav a[aria-current] { color: var(--text); opacity: 1; }

/* Hero — mesh-gradient backdrop + big headline */
.hero, .hero-section { position: relative; padding-block: clamp(72px, 12vw, 148px); text-align: center; overflow: hidden; }
.hero::before, .hero-section::before { content: ""; position: absolute; inset: -20% -10% auto; height: 480px; z-index: 0; background: radial-gradient(46% 60% at 30% 25%, color-mix(in srgb, var(--primary) 40%, transparent), transparent 70%), radial-gradient(50% 60% at 74% 30%, color-mix(in srgb, var(--secondary) 32%, transparent), transparent 70%); filter: blur(40px); opacity: .85; pointer-events: none; }
.hero > *:not(.hero-bg), .hero-section > *:not(.hero-bg) { position: relative; z-index: 2; }
/* Full-bleed hero background image + legibility overlay (high-class hero) */
.hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; border-radius: 0; }
.hero:has(.hero-bg)::after, .hero-section:has(.hero-bg)::after { content: ""; position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, rgba(8,10,14,.5), rgba(8,10,14,.82)); }
/* Over a photo, force legible light text regardless of theme or the model's
   inline colors (a dark scrim + white text always reads). Gradient-text keeps
   its gradient because -webkit-text-fill-color:transparent wins over color. */
.hero:has(.hero-bg) h1, .hero:has(.hero-bg) h2, .hero:has(.hero-bg) h3, .hero:has(.hero-bg) p, .hero:has(.hero-bg) .eyebrow, .hero:has(.hero-bg) .hero-subtitle, .hero:has(.hero-bg) .lead, .hero:has(.hero-bg) li, .hero-section:has(.hero-bg) h1, .hero-section:has(.hero-bg) h2, .hero-section:has(.hero-bg) p { color: #ffffff !important; }
.hero:has(.hero-bg) .hero-subtitle, .hero:has(.hero-bg) .muted, .hero-section:has(.hero-bg) .hero-subtitle { color: rgba(255,255,255,.86) !important; }
.video-embed, .video-wrap { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
.video-embed iframe, .video-embed video, .video-wrap iframe, .video-wrap video { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; object-fit: cover; }
.hero h1, .hero-title, .hero-headline { max-width: 18ch; margin-inline: auto; }
.hero p, .hero-subtitle, .hero-subhead { max-width: 60ch; margin: 1.25rem auto 2rem; font-size: clamp(1.05rem, 1.6vw, 1.3rem); color: var(--muted); }
.hero-actions, .hero-cta, .cta-group { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }

/* Buttons */
.btn, a.btn, button.btn, .btn-primary, .btn-secondary, .btn-ghost, a.btn-primary, a.btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; font-family: inherit; font-weight: 600; font-size: 1rem; line-height: 1; cursor: pointer; padding: .9rem 1.7rem; border-radius: var(--radius-pill); border: 1px solid transparent; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
.btn-primary, .btn.primary, a.btn-primary { background: var(--primary); color: var(--on-primary); border-color: var(--primary); box-shadow: 0 10px 30px -10px var(--primary); }
.btn-primary:hover, .btn.primary:hover, a.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 16px 42px -12px var(--primary); opacity: 1; }
.btn-secondary, .btn.secondary, .btn-ghost { background: var(--surface); color: var(--text); border-color: var(--border); }
.btn-secondary:hover, .btn-ghost:hover { transform: translateY(-2px); border-color: var(--primary); }
button:not(.btn):not(.btn-primary):not(.btn-secondary):not(.btn-ghost) { cursor: pointer; background: var(--primary); color: var(--on-primary); border: none; border-radius: var(--radius-pill); padding: .8rem 1.6rem; font-weight: 600; transition: transform .18s ease, box-shadow .18s ease; }
button:not(.btn):not(.btn-primary):not(.btn-secondary):not(.btn-ghost):hover { transform: translateY(-1px); box-shadow: 0 12px 30px -10px var(--primary); }

/* Cards — glassy surface, hover lift */
.card, .feature-card, .feature, .info-card, .testimonial, .testimonial-card, .pricing-card, .plan, .profile-card, .match-card, .step { background: color-mix(in srgb, var(--surface) 92%, transparent); border: 1px solid var(--border); border-radius: var(--radius); padding: clamp(1.5rem, 3vw, 2rem); box-shadow: var(--shadow); transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
.card:hover, .feature-card:hover, .info-card:hover, .pricing-card:hover, .plan:hover, .profile-card:hover, .match-card:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--primary) 50%, var(--border)); box-shadow: var(--shadow-lg); }
.card-icon, .feature-icon, .icon-box { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--primary) 16%, transparent); color: var(--primary); font-size: 1.5rem; margin-bottom: 1.1rem; }

/* Stats / steps / testimonials / badges */
.stats, .stat-grid { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); text-align: center; }
.stat-value, .stat-number { display: block; font-family: var(--font-heading); font-weight: 800; font-size: clamp(2rem, 4vw, 3rem); line-height: 1; color: var(--text); }
.stat-label { color: var(--muted); font-size: .95rem; margin-top: .4rem; }
.step-num, .step-number { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: var(--radius-pill); background: var(--primary); color: var(--on-primary); font-weight: 700; margin-bottom: 1rem; }
blockquote, .testimonial-quote, .quote { font-size: 1.1rem; line-height: 1.6; margin: 0 0 1.25rem; }
.badge, .pill, .tag, .chip { display: inline-flex; align-items: center; gap: .4rem; padding: .35rem .85rem; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); font-size: .8rem; font-weight: 600; }

/* Forms */
button, input, select, textarea { font: inherit; color: inherit; }
input, select, textarea { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .8rem 1rem; color: var(--text); transition: border-color .18s ease, box-shadow .18s ease; }
input::placeholder, textarea::placeholder { color: color-mix(in srgb, var(--muted) 80%, transparent); }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--primary); box-shadow: var(--ring); }
label { display: block; font-size: .85rem; font-weight: 500; margin: 0 0 .4rem; color: var(--muted); }
.field, .form-group { margin-bottom: 1.1rem; }

/* Tables */
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: .85rem 1rem; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 600; font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; }

/* Footer */
footer, .site-footer { margin-top: clamp(4rem, 8vw, 6rem); padding: clamp(2.5rem, 5vw, 4rem) clamp(20px, 5vw, 40px); border-top: 1px solid var(--border); color: var(--muted); }
.footer-links { display: flex; gap: 1.5rem; flex-wrap: wrap; list-style: none; margin: 0; padding: 0; }
.footer-links a { color: var(--muted); }
.footer-links a:hover { color: var(--text); }

@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }

/* Wide content (data tables, etc.) scrolls instead of breaking the layout on phones */
.admin-table-wrap, .table-wrap, .table-responsive, .table-scroll { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }

/* ── Featured / highlighted card (pricing, spotlight, etc.) ─────────────────── */
.card.featured, .pricing-card.featured, .plan.featured { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary), 0 24px 56px -20px color-mix(in srgb, var(--primary) 40%, transparent); position: relative; }
.card.featured::before, .pricing-card.featured::before { content: attr(data-badge); position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: var(--primary); color: var(--on-primary); padding: .3rem .9rem; border-radius: var(--radius-pill); font-size: .75rem; font-weight: 700; white-space: nowrap; }

/* ── CTA / banner sections ───────────────────────────────────────────────────── */
.cta-section, .cta-banner, .promo-banner { background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 18%, var(--surface)), color-mix(in srgb, var(--secondary) 12%, var(--surface))); border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent); border-radius: var(--radius); padding: clamp(2.5rem, 6vw, 4.5rem); text-align: center; }

/* ── Avatars ─────────────────────────────────────────────────────────────────── */
.avatar, .avatar-img { border-radius: 50%; object-fit: cover; display: inline-block; vertical-align: middle; }
.avatar-sm, .avatar.sm { width: 36px; height: 36px; }
.avatar-md, .avatar.md { width: 52px; height: 52px; }
.avatar-lg, .avatar.lg { width: 80px; height: 80px; }
.avatar-xl, .avatar.xl { width: 120px; height: 120px; }

/* ── Gallery / portfolio grid with hover overlay ─────────────────────────────── */
.gallery-grid { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.gallery-item, .portfolio-item { position: relative; border-radius: var(--radius); overflow: hidden; aspect-ratio: 4 / 3; }
.gallery-item img, .portfolio-item img { width: 100%; height: 100%; object-fit: cover; transition: transform .35s ease; }
.gallery-item:hover img, .portfolio-item:hover img { transform: scale(1.06); }
.gallery-item-overlay, .item-overlay { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(0,0,0,.72) 0%, transparent 55%); opacity: 0; transition: opacity .25s ease; display: flex; align-items: flex-end; padding: 1.25rem; }
.gallery-item:hover .gallery-item-overlay, .portfolio-item:hover .item-overlay { opacity: 1; }
.gallery-item-overlay h3, .item-overlay h3, .gallery-item-overlay p, .item-overlay p { color: #fff; margin: 0; }

/* ── Filters / category bar ──────────────────────────────────────────────────── */
.filters, .filter-bar, .category-bar, .tag-bar { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: clamp(1.5rem, 3vw, 2.5rem); }
.filter-btn, .category-btn { padding: .45rem 1.1rem; border-radius: var(--radius-pill); border: 1px solid var(--border); background: var(--surface); color: var(--muted); font-size: .9rem; font-weight: 500; cursor: pointer; transition: all .18s ease; }
.filter-btn:hover, .category-btn:hover, .filter-btn.active, .category-btn.active, .filter-btn[data-active="true"], .category-btn[data-active="true"] { background: var(--primary); color: var(--on-primary); border-color: var(--primary); }

/* ── Skeleton loading placeholders ───────────────────────────────────────────── */
@keyframes shimmer { from { background-position: -800px 0; } to { background-position: 800px 0; } }
.skeleton, .skeleton-line, .skeleton-block { background: linear-gradient(90deg, var(--surface) 25%, color-mix(in srgb, var(--border) 80%, var(--surface)) 50%, var(--surface) 75%); background-size: 1600px 100%; animation: shimmer 1.6s infinite linear; border-radius: var(--radius-sm); display: block; }
.skeleton-text { height: 1em; margin-bottom: .5rem; }
.skeleton-text:last-child { width: 68%; }
.skeleton-card { height: 220px; border-radius: var(--radius); }
.skeleton-avatar { width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0; }
.skeleton-thumb { height: 180px; border-radius: var(--radius-sm); }

/* ── Step row with connecting line ───────────────────────────────────────────── */
.step-row { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); position: relative; }
.step-row::before { content: ""; position: absolute; top: 22px; left: 12%; right: 12%; height: 1px; background: linear-gradient(90deg, transparent, var(--border), transparent); pointer-events: none; }
.step { text-align: center; position: relative; }

/* ── Check / feature list ─────────────────────────────────────────────────────── */
.feature-list, .check-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .65rem; }
.feature-list li, .check-list li { display: flex; align-items: flex-start; gap: .65rem; line-height: 1.5; }
.feature-list li::before, .check-list li::before { content: "✓"; display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; border-radius: 50%; background: color-mix(in srgb, var(--primary) 16%, transparent); color: var(--primary); font-size: .7rem; font-weight: 700; margin-top: .15rem; flex-shrink: 0; }

/* ── Alert banners ────────────────────────────────────────────────────────────── */
.alert { padding: .9rem 1.25rem; border-radius: var(--radius-sm); border: 1px solid; margin-bottom: 1rem; font-size: .9rem; }
.alert-success { background: color-mix(in srgb, #22c55e 10%, transparent); border-color: color-mix(in srgb, #22c55e 35%, transparent); color: #22c55e; }
.alert-error { background: color-mix(in srgb, #ef4444 10%, transparent); border-color: color-mix(in srgb, #ef4444 35%, transparent); color: #ef4444; }
.alert-info { background: color-mix(in srgb, var(--primary) 10%, transparent); border-color: color-mix(in srgb, var(--primary) 35%, transparent); color: var(--primary); }
.alert-warning { background: color-mix(in srgb, var(--accent) 10%, transparent); border-color: color-mix(in srgb, var(--accent) 35%, transparent); color: var(--accent); }

/* ── Rating stars / score ─────────────────────────────────────────────────────── */
.stars, .rating { color: var(--accent); letter-spacing: .1em; font-size: 1rem; }

/* ── Progress / capacity bar ──────────────────────────────────────────────────── */
.progress-bar { height: 6px; background: var(--surface-2); border-radius: var(--radius-pill); overflow: hidden; }
.progress-bar-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--secondary)); border-radius: inherit; transition: width .6s ease; }

/* ── Horizontal media card ────────────────────────────────────────────────────── */
.card-horizontal, .media-card, .list-card { display: grid; grid-template-columns: auto 1fr; gap: 1.25rem; align-items: center; }
.card-horizontal img, .media-card img, .list-card img { width: 96px; height: 96px; object-fit: cover; border-radius: var(--radius-sm); flex-shrink: 0; }

/* ── Logo strip (partner logos) ───────────────────────────────────────────────── */
.logo-strip, .logos-row, .partners-row { display: flex; align-items: center; justify-content: center; gap: clamp(2rem, 5vw, 4rem); flex-wrap: wrap; opacity: .45; filter: grayscale(1); transition: opacity .3s ease; }
.logo-strip:hover, .logos-row:hover { opacity: .65; }

/* ── Reveal-on-scroll ─────────────────────────────────────────────────────────── */
.reveal { opacity: 0; transform: translateY(22px); transition: opacity .55s ease, transform .55s ease; }
.reveal.visible { opacity: 1; transform: none; }

/* ── Image aspect-ratio helpers ───────────────────────────────────────────────── */
.aspect-video { aspect-ratio: 16 / 9; overflow: hidden; border-radius: var(--radius); }
.aspect-square { aspect-ratio: 1; overflow: hidden; border-radius: var(--radius); }
.aspect-video img, .aspect-square img, .aspect-video video { width: 100%; height: 100%; object-fit: cover; }

/* ── Two-column feature (image left, copy right) ──────────────────────────────── */
.feature-split { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(2rem, 6vw, 5rem); align-items: center; }
.feature-split.reverse { direction: rtl; }
.feature-split.reverse > * { direction: ltr; }
@media (max-width: 720px) { .feature-split { grid-template-columns: 1fr; } .feature-split.reverse { direction: ltr; } }

/* ── Booking / date-range / ticket form card ──────────────────────────────────── */
.booking-card, .search-bar, .filter-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: clamp(1.25rem, 3vw, 2rem); display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; box-shadow: var(--shadow); }
.booking-card .field, .search-bar .field, .filter-card .field { flex: 1 1 160px; margin: 0; }

/* ═══ Responsive — phones & small tablets ═══ */
@media (max-width: 900px) {
  .grid-4 { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
}
@media (max-width: 720px) {
  header, .site-header, .navbar, .main-header { flex-wrap: wrap; gap: .75rem; padding: .8rem clamp(16px, 4vw, 24px); }
  nav, .nav-links { gap: .55rem 1rem; font-size: .92rem; width: 100%; }
  .hero, .hero-section { padding-block: clamp(56px, 14vw, 96px); }
  .hero-actions, .hero-cta, .cta-group { flex-direction: column; align-items: stretch; }
  .hero-actions > .btn, .hero-cta > .btn, .cta-group > .btn { width: 100%; }
  .section { padding-block: clamp(40px, 11vw, 80px); }
  .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  :root { --h1: clamp(2.1rem, 9vw, 2.9rem); }
  .container { padding-inline: 16px; }
}
${LOADING_CSS}${HAMBURGER_CSS}`

function sanitizeCss(files: ParsedChange[], cssPath: string) {
  const entry = files.find((f) => f.path === cssPath)
  if (!entry) return
  entry.content = entry.content
    .replace(/^\s*<\/?style[^>]*>\s*$/gim, '')
    .replace(/^\s*```[^\r\n]*\s*$/gm, '')
}

/** Every generated HTML page must declare the responsive viewport, or phones
 *  render it zoomed-out at desktop width. Inject it when the model omitted it. */
function ensureViewport(files: ParsedChange[]) {
  const correct = '<meta name="viewport" content="width=device-width, initial-scale=1" />'
  for (const f of files.filter((x) => x.path.replace(/\\/g, '/').endsWith('.html'))) {
    // REPLACE any existing viewport, not just add when missing. Old templates
    // often ship "width=1200" or "user-scalable=no", which pins the page to a
    // desktop width no matter what CSS says — the page then renders shrunk on
    // phones regardless of our @media rules.
    if (/<meta[^>]+name=["']viewport["']/i.test(f.content)) {
      f.content = f.content.replace(/<meta[^>]+name=["']viewport["'][^>]*>/gi, correct)
      continue
    }
    if (/<head[^>]*>/i.test(f.content)) {
      f.content = f.content.replace(/<head[^>]*>/i, (m) => `${m}\n  ${correct}`)
    }
  }
}

/** "our-team.html" → "Our Team" for a nav label. */
function pageLabel(file: string): string {
  return file.replace(/\.html$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Page'
}

/** Guarantee every page is reachable: for each HTML file, inject a nav link for
 *  any page whose link is missing (best-effort — only where a <nav> exists).
 *  This is the floor that makes the ">= 4 pages" requirement real even when the
 *  model under-links or a padded page wasn't in its original nav. */
function ensureNavLinks(files: ParsedChange[], pages: string[]) {
  for (const f of files.filter((x) => x.path.replace(/\\/g, '/').endsWith('.html'))) {
    if (!/<\/nav>/i.test(f.content)) continue
    let c = f.content
    for (const page of pages) {
      const href = page.replace(/^\.?\//, '')
      const esc = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`href=["']\\.?/?${esc}["']`, 'i').test(c)) continue
      c = c.replace(/<\/nav>/i, `  <a href="${href}">${pageLabel(page)}</a>\n</nav>`)
    }
    f.content = c
  }
}

/** Inject a spinner preloader overlay right after <body> on every static page so
 *  the site shows a loading animation on load (LOADING_CSS auto-hides it). */
function ensureLoader(files: ParsedChange[]) {
  for (const f of files.filter((x) => x.path.replace(/\\/g, '/').endsWith('.html'))) {
    if (/class=["'][^"']*(?<![\w-])page-loader(?![\w-])/.test(f.content)) continue
    if (/<body[^>]*>/i.test(f.content)) {
      f.content = f.content.replace(/<body([^>]*)>/i, '<body$1>\n  <div class="page-loader"><div class="loader-ring"></div></div>')
    }
  }
}

/**
 * Layer 4 of the reveal-safety guarantee: inline a tiny <script> + <style>
 * pair into every HTML's <head>. This runs BEFORE script.js is fetched, so
 * even if script.js is blocked, missing, delayed, or has a syntax error,
 * every section still becomes visible. The inline block:
 *   - CSS: a fa-emergency-reveal @keyframes animation on every element with
 *     a known "hidden by default" class/attribute. Fires at 4s. Uses
 *     !important so no other CSS can beat it. This alone guarantees
 *     visibility even with JS entirely disabled.
 *   - Script: on DOMContentLoaded, walks every above-the-fold hidden
 *     element and reveals it immediately (no wait for observer/backstop).
 *     Below-fold elements still get their scroll animation from script.js.
 */
const INLINE_REVEAL_SAFETY = `<style>
@keyframes fa-emergency-reveal { to { opacity: 1 !important; visibility: visible !important; } }
.scroll-reveal:not(.is-visible),.reveal:not(.active):not(.is-visible),.fade-in:not(.visible):not(.in),.slide-in:not(.visible):not(.in),.fade-up:not(.is-visible),.fade-down:not(.is-visible),.zoom-in:not(.is-visible),.animate:not(.animated),.animate-up:not(.in),.will-animate:not(.animated),.animate-on-scroll:not(.animated):not(.in-view),.animate-on-load:not(.in-view):not(.visible),[data-aos]:not(.aos-animate),[data-reveal]:not(.in-view):not(.is-visible),[data-scroll]:not(.is-inview):not(.in-view),[data-animate]:not(.is-visible):not(.animated) { animation: fa-emergency-reveal 0.4s ease 4s forwards !important; }
</style>
<script>
(function(){try{
  var conv={'scroll-reveal':'is-visible','reveal':'active','fade-in':'visible','slide-in':'visible','fade-up':'is-visible','fade-down':'is-visible','zoom-in':'is-visible','animate-on-scroll':'animated','animate-on-load':'in-view','animate-up':'in','animate':'animated','will-animate':'animated'};
  var attrs=[['data-reveal','in-view'],['data-scroll','is-inview'],['data-animate','is-visible'],['data-aos','aos-animate']];
  function revealAllAbove(){
    var vh=window.innerHeight||document.documentElement.clientHeight;
    function pin(el,cls){el.classList.add(cls);el.style.setProperty('opacity','1','important');el.style.setProperty('visibility','visible','important');el.style.transform='';}
    Object.keys(conv).forEach(function(c){
      document.querySelectorAll('.'+c).forEach(function(el){
        if(el.getBoundingClientRect().top<vh)pin(el,conv[c]);
      });
    });
    attrs.forEach(function(a){
      document.querySelectorAll('['+a[0]+']').forEach(function(el){
        if(el.getBoundingClientRect().top<vh)pin(el,a[1]);
      });
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',revealAllAbove);else revealAllAbove();
}catch(e){}})();
</script>`

function ensureRevealSafety(files: ParsedChange[]) {
  for (const f of files.filter((x) => x.path.replace(/\\/g, '/').endsWith('.html'))) {
    if (f.content.includes('fa-emergency-reveal')) continue // already injected
    if (/<\/head>/i.test(f.content)) {
      f.content = f.content.replace(/<\/head>/i, `${INLINE_REVEAL_SAFETY}\n</head>`)
    }
  }
}

/**
 * A sticky/fixed header with `backdrop-filter: blur()` but NO background is a
 * frosted bar with nothing to frost: content scrolls under it and just looks
 * smeared/clipped instead of hiding behind a clean bar. Give any such rule a
 * semi-opaque --bg background. The `[^{}]+` selector / `[^{}]*` body pattern
 * only matches leaf rule blocks, so @media wrappers are never corrupted.
 */
function fixBlurNavBackground(files: ParsedChange[], cssPath: string) {
  const entry = files.find((f) => f.path === cssPath)
  if (!entry) return
  entry.content = entry.content.replace(/([^{}]+)\{([^{}]*)\}/g, (full, selector, body) => {
    const stuck = /position\s*:\s*(sticky|fixed)/i.test(body)
    const blurred = /backdrop-filter\s*:\s*[^;]*blur/i.test(body)
    const hasBg = /(^|[;{])\s*background(-color)?\s*:/i.test(body)
    if (!stuck || !blurred || hasBg) return full
    const trimmed = body.replace(/\s*$/, '')
    const sep = trimmed.endsWith(';') || trimmed === '' ? '' : ';'
    return `${selector}{${trimmed}${sep} background: color-mix(in srgb, var(--bg, #0b0b10) 82%, transparent); }`
  })
}

/** Classes referenced in markup (class= or className=) with no rule in the stylesheet. */
function findUnstyledClasses(files: ParsedChange[], cssPath: string, markupExts: string[]): string[] {
  const css = files.find((f) => f.path === cssPath)?.content ?? ''
  const missing = new Set<string>()
  for (const f of files) {
    if (!markupExts.some((e) => f.path.endsWith(e))) continue
    for (const m of f.content.matchAll(/class(?:Name)?="([^"]+)"/g)) {
      for (const cls of m[1].split(/\s+/)) {
        if (!cls || missing.has(cls)) continue
        const re = new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`)
        if (!re.test(css)) missing.add(cls)
      }
    }
  }
  return [...missing]
}

/**
 * Style completion safety net: locally detect classes with no CSS rule and
 * ask for ONLY the missing rules, APPENDED to the stylesheet — the existing
 * CSS is never resent or rewritten, so it can't be lost to a bad reply.
 * Returns how many classes were missing (0 = nothing to do).
 */
async function appendMissingStyles(
  provider: AIProvider,
  files: ParsedChange[],
  cssPath: string,
  markupExts: string[],
  systemPrompt: string,
  onMissing?: (count: number) => Promise<unknown>,
): Promise<number> {
  const cssEntry = files.find((f) => f.path === cssPath)
  if (!cssEntry) return 0
  const initialMissing = findUnstyledClasses(files, cssPath, markupExts)
  if (!initialMissing.length) return 0
  await onMissing?.(initialMissing.length)

  // Output caps fit ~60 classes per reply — loop in batches, recomputing
  // what's still missing after each append, until covered (max 6 rounds).
  for (let round = 0; round < 6; round++) {
    const missing = findUnstyledClasses(files, cssPath, markupExts)
    if (!missing.length) break
    const batch = missing.slice(0, 60)
    const batchSet = new Set(batch)

    // Only send markup files that actually use classes from this batch
    const markup = files
      .filter((f) => markupExts.some((e) => f.path.endsWith(e)))
      .filter((f) => [...f.content.matchAll(/class(?:Name)?="([^"]+)"/g)]
        .some((m) => m[1].split(/\s+/).some((c) => batchSet.has(c))))
      .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 4000)}\n\`\`\``)
      .join('\n\n')
    const rootBlock = cssEntry.content.match(/:root\s*{[^}]*}/)?.[0] ?? ''

    let appended = false
    for (let attempt = 0; attempt < 2 && !appended; attempt++) {
      const res = await safeChat(
        provider,
        `Markup that uses the classes below:\n\n${markup}\n\nThe stylesheet's CSS variables:\n\`\`\`css\n${rootBlock}\n\`\`\`\n\nThese classes have NO css rule yet, so they render with ugly browser defaults. Write polished rules for EXACTLY these classes:\n${batch.map((c) => `.${c}`).join('\n')}\n\nOutput ONLY the ADDITIONAL css rules to append, as <file path="styles-additions.css">, reusing the CSS variables above so the design stays cohesive. Include hover/focus states and responsive breakpoints where relevant. Do NOT repeat existing rules.`,
        systemPrompt,
      )
      if (!res) { await sleep(2000); continue }
      const file = parseAIChanges(res.content)[0]
      if (file?.content && file.content.trim().length > 100) {
        cssEntry.content += `\n\n/* ── Styles for remaining classes (round ${round + 1}) ── */\n${file.content.trim()}\n`
        appended = true
      } else {
        await sleep(2000)
      }
    }
    if (!appended) break // model refuses to cooperate — element baseline still covers the gaps
    await sleep(1500)
  }
  return initialMissing.length
}

// ═══ DESIGN DIRECTOR ══════════════════════════════════════
// One distinctive visual identity, generated up front and injected into every
// file's prompt. This is what stops the builder from sometimes phoning in the
// generic violet-on-slate default — every page follows ONE intentional design.

const DESIGN_DIRECTOR_PROMPT = `You are an award-winning brand & UI designer. Given a product idea you invent a DISTINCTIVE visual identity that feels tailor-made for it — the palette, type, and motifs a top studio would choose. You NEVER reach for the generic default (never violet #8b5cf6 on slate #0f172a unless the brand genuinely calls for it). DEFAULT TO BRIGHT, LIGHT themes — a white or near-white --bg with strong colored accents. Only choose a dark palette when the category unmistakably demands it (gaming, nightlife, luxury black-label, crypto/DeFi, cybersecurity). Most sites — retail, food, health, education, SaaS, portfolio, quiz apps, productivity tools — should feel bright, airy, and energetic. You output a tight, prescriptive spec, no prose padding.`

// Strong, opinionated fallback — still far better than a bland default if the
// model's brief call fails. Bright editorial identity that reads as "designed".
const DEFAULT_DESIGN_BRIEF = `VIBE: bright, energetic, confident, modern, editorial.
PALETTE: --bg #ffffff; --surface #f7f5f2; --surface-2 #edeae5; --text #18130f; --muted #6b6460; --primary #e85d04; --primary-hover #fb8500; --secondary #219ebc; --accent #ffb703; --border rgba(0,0,0,0.1).
FONTS: headings 'Space Grotesk' (600/700), body 'Inter' (400/500) — both Google Fonts.
TYPE SCALE: h1 clamp(2.5rem,6vw,4.5rem)/1.05/700; h2 clamp(1.75rem,3.5vw,2.75rem)/1.1/700; h3 clamp(1.25rem,2vw,1.5rem)/1.25/600; body 1.0625rem/1.7.
SPACING: rhythm 4/8/16/24/40/64/96; section padding clamp(64px,10vw,120px) vertical; content max-width 1120px.
MOTIFS: soft radial mesh-gradient hero backdrop blending --primary and --secondary at low opacity; glassy cards (--surface + 1px rgba(255,255,255,.07) border + layered shadow 0 20px 50px -20px rgba(0,0,0,.6)); pill buttons with a soft glow on hover; gradient text on the hero headline; sticky nav with a SEMI-OPAQUE --bg background (~82% opacity) AND backdrop-blur so content scrolls cleanly behind it — never a blur with no background; generous whitespace; rounded-2xl (16px) corners; smooth 180ms ease transitions.`

const briefHeader = 'DESIGN BRIEF — follow it EXACTLY so every page shares ONE cohesive, premium identity (use these exact CSS variable names in :root):'

// Optional user-chosen vibe that steers the design director on top of the
// automatic industry-matching. 'auto' (or unknown) adds nothing.
const STYLE_DIRECTIVES: Record<string, string> = {
  minimal: 'STYLE DIRECTION: minimal & clean — a restrained palette (2-3 colors plus neutrals), generous whitespace, simple type, subtle borders/shadows; calm and uncluttered — but STILL high-class and premium, with tasteful polish (refined shadows, smooth micro-interactions, elegant full-bleed imagery). Minimal, never boring or bare.',
  bold: 'STYLE DIRECTION: bold & dynamic — high-energy, vivid saturated colors, big confident type, strong contrast and punchy accents. Make it pop.',
  elegant: 'STYLE DIRECTION: elegant & premium — refined and sophisticated; a graceful serif or refined sans for headings, a tasteful muted or rich palette, fine details and airy spacing.',
}

/** Phase 2 of the planning pipeline: given the visual identity (designBrief),
 *  Claude writes the full content PRD — page-by-page blueprint with actual copy,
 *  section order, CTAs, and data-model spec. This runs BEFORE any coding so
 *  Gemini always has a complete script to follow instead of inventing content
 *  on the fly (which produces generic, "vibe-coded" output).
 *  Best-effort: falls back silently if Claude is unavailable. */
async function generateContentPRD(
  enhancer: AIProvider | null,
  provider: AIProvider,
  prompt: string,
  siteName: string,
  stack: string,
  designBrief: string,
): Promise<string> {
  const planner = enhancer ?? provider
  try {
    const resp = await safeChat(
      planner,
      `You are a senior product strategist and UX copywriter. You are writing the CONTENT BLUEPRINT for a ${stack === 'mern' ? 'full-stack web app' : 'marketing website'} called "${siteName}".

User brief: "${prompt}"

Visual identity already decided:
${designBrief.slice(0, 800)}

Write the PRODUCT REQUIREMENTS DOCUMENT (PRD) — the exact blueprint the coding AI will follow. Be SPECIFIC and production-ready. Write actual copy, never lorem ipsum or placeholders.

## Pages & Sections Blueprint
For EACH page, list IN ORDER:
### [Page Name] (/route)
**Purpose:** one sentence
**Sections:**
1. [Section]: what it shows + 1-2 actual copy lines in brand voice
2. ...
**Key headlines (write the real text):** H1 "...", H2s "...", "..."
**Primary CTA:** "Button text" → action

## Brand Voice & Copy
**Tagline:** "..."
**Value prop (1 sentence):** "..."
**5 on-brand headlines:** (write the actual text for this specific site)
**3 CTA variants:** "...", "...", "..."
**Brand adjectives:** 3 words

## Data Models (for MERN backend)
For each entity visitors interact with:
- **ModelName**: field1 (type), field2 (type) — what the UI shows from this

## User Flows
Top 2-3 things a visitor does, step by step.

Write for THIS specific site — not generic. Every headline must feel written by a real copywriter for this exact brand.`,
      'You are a product strategist and copywriter. Output structured markdown only — actual copy, never placeholders.',
    )
    const prd = resp?.content?.trim() ?? ''
    return prd.length > 300 ? prd : ''
  } catch {
    return ''
  }
}

/** Art-direct a distinctive identity for this specific site. Resilient: a
 *  provider failure or a thin reply falls back to the strong default brief. */
async function buildDesignBrief(provider: AIProvider, prompt: string, siteName: string, style?: string): Promise<string> {
  const styleLine = style && STYLE_DIRECTIVES[style]
    ? `\n\n${STYLE_DIRECTIVES[style]} (Still make the identity clearly match the site's industry/type.)`
    : ''
  const res = await safeChat(
    provider,
    `Invent a distinctive visual identity for this website:\n\n"${prompt}"\n\nSite name: ${siteName}${styleLine}\n\nReturn a DESIGN BRIEF as plain text (no markdown fences) with EXACTLY these labelled lines, tailored to THIS product's mood:\nVIBE: 4-6 adjectives.\nPALETTE: hex/rgba for --bg --surface --surface-2 --text --muted --primary --primary-hover --secondary --accent --border. Cohesive, theme-appropriate, high contrast between --text and --bg. DEFAULT TO A BRIGHT/LIGHT palette (white or near-white --bg) — only go dark if the category unmistakably demands it (gaming, nightlife, luxury black-label, crypto). NOT the generic violet-on-slate default.\nFONTS: a real Google Fonts pairing — a display font for headings + a clean body font, with weights.\nTYPE SCALE: fluid clamp() sizes + line-height + weight for h1/h2/h3/body.\nSPACING: a spacing rhythm and section vertical padding and content max-width.\nMOTIFS: 5 SPECIFIC, implementable CSS treatments — name the exact effect, not a vague adjective. Examples of the level of specificity required: "hero has a radial mesh-gradient backdrop (two overlapping radial-gradient blobs at 30%/70% using --primary and --secondary at 30% opacity, blurred 60px)", "cards use a 1px rgba(255,255,255,.07) border + box-shadow 0 18px 44px -18px rgba(0,0,0,.5) + translateY(-4px) on hover", "primary button has a box-shadow 0 10px 30px -10px var(--primary) glow that intensifies on hover", "section dividers use a single-pixel linear-gradient(90deg, transparent, --border, transparent) line", "featured/highlighted cards get a 1px solid --primary border + a subtle glow". Keep treatments SUBTLE and contained — never large floating blobs that overlap content.\nPHOTO SUBJECTS: 2-4 comma-separated CONCRETE photo subjects showing the PLACES, PEOPLE, and real things a visitor expects for this category — not abstract concepts (e.g. a university: "university campus, students studying, graduation ceremony, library"; a restaurant: "plated gourmet food, restaurant interior, chef cooking"; a hotel: "hotel lobby, luxury suite, resort pool").\nREFERENCE: name this site's CATEGORY, then how best-in-class REAL sites in that category are built — their signature SECTIONS in the usual order, layout patterns, imagery style, and tone. (e.g. a hotel: full-bleed hero with a booking/enquiry bar, rooms & suites showcase, amenities, photo gallery, dining, special offers, guest reviews, location/map; a restaurant: hero, menu, reservations, gallery, story, hours/location; a SaaS: hero, logos, features, how-it-works, pricing, testimonials, FAQ, CTA.) Build this site to feel like a TOP example of its category, following those conventions.\n\nThe identity MUST obviously match this site's INDUSTRY/TYPE (a sports brand = athletic, bold, high-energy; a law firm = refined and trustworthy; a bakery = warm and inviting) — not a generic template. The hero headline must read with STRONG contrast against the hero background; keep any gradient/accent color to a SINGLE word so the headline never washes out, and no ghosting text-shadow.\n\nWhatever the vibe, the final result MUST be HIGH-CLASS with tremendous styling and tasteful visual effects — never plain, generic, or bare.\n\nBe specific and prescriptive — this is injected verbatim into every file generation.`,
    DESIGN_DIRECTOR_PROMPT,
  )
  const brief = res?.content?.trim()
  return brief && brief.length > 150 ? brief : DEFAULT_DESIGN_BRIEF
}

/** True only if the URL actually serves an image (HEAD 2xx/3xx + image/* type).
 *  Used to keep broken hotlinks out of the pool so no <img> ever renders empty. */
async function urlIsImage(url: string): Promise<boolean> {
  try {
    const r = await axios.head(url, { timeout: 5000, maxRedirects: 3, validateStatus: () => true })
    return r.status >= 200 && r.status < 400 && String(r.headers['content-type'] ?? '').startsWith('image/')
  } catch { return false }
}

/** Fetch a pool of topical, real web photos for the given subjects — Unsplash
 *  when UNSPLASH_ACCESS_KEY is set (highest quality), otherwise the keyless
 *  Openverse API (CC-licensed web photos, each URL validated so it truly loads).
 *  Returns [] on any error / no subjects → the builder falls back to picsum, so
 *  this can never break a build and never yields a broken image. */
async function fetchImagePool(subjects: string[]): Promise<string[]> {
  const subs = subjects.slice(0, 4).filter(Boolean)
  if (!subs.length) return []
  const key = process.env.UNSPLASH_ACCESS_KEY
  const perSubject = await Promise.all(subs.map(async (subject): Promise<string[]> => {
    try {
      if (key) {
        const { data } = await axios.get('https://api.unsplash.com/search/photos', {
          params: { query: subject, per_page: 6, orientation: 'landscape', content_filter: 'high' },
          headers: { Authorization: `Client-ID ${key}` },
          timeout: 8000,
        })
        return (data?.results ?? [])
          .map((p: any) => p?.urls?.raw)
          .filter((u: any): u is string => typeof u === 'string')
          .map((u: string) => `${u}&w=1600&q=80&fit=crop`)
      }
      // Keyless: Openverse CC-licensed web photos, validated so only loading URLs remain.
      const { data } = await axios.get('https://api.openverse.org/v1/images/', {
        params: { q: subject, page_size: 8, mature: 'false' },
        timeout: 8000,
      })
      const candidates = (data?.results ?? [])
        .map((r: any) => r?.url)
        .filter((u: any): u is string => typeof u === 'string' && u.startsWith('https') && !/\.svg(\?|$)/i.test(u))
      const checked = await Promise.all(candidates.map(async (u: string) => ((await urlIsImage(u)) ? u : '')))
      return checked.filter(Boolean)
    } catch {
      return []
    }
  }))
  return [...new Set(perSubject.flat())].slice(0, 18)
}

// ─── Static site generation (HTML/CSS/JS) ──────────────────
async function generateStaticSite(
  provider: AIProvider,
  prompt: string,
  siteName: string,
  designBrief: string,
  task: any,
  /** Set when this is a REBUILD of a real client site. The generic new-site
   *  recipe (feature grid → steps → stats → testimonials → FAQ → CTA) is a
   *  template for greenfield projects; imposing it on an established brand
   *  produces something thinner than what they already have, and no client
   *  swaps a rich bespoke site for a stock layout. When rebuilding we mirror
   *  and then SURPASS their own structure instead. */
  source?: { pages: number; images: number; sections: string[] },
  /** Optional dedicated provider for CSS generation. Set on rebuild/enhance
   *  flows so Claude does the styling; other files stay on `provider`. */
  stylist?: AIProvider,
  /** The original site's stylesheet(s), concatenated + capped. When present,
   *  Claude is shown "here's what you must beat by 100%" — so the new design
   *  cannot regress on visual specificity vs the site it replaces. */
  originalCss?: string,
): Promise<{ files: ParsedChange[]; summary?: string } | null> {
  const generated: ParsedChange[] = []
  // The design brief is identical for every file in this build, so it rides in
  // the (cached) system prompt next to BUILDER_SYSTEM_PROMPT instead of being
  // re-sent inside each user message. Combined they clear Claude's ~1–2k-token
  // cache minimum, so every per-file call after the first reads this whole
  // prefix at ~0.1x input price rather than paying for it again.
  const pack = selectPack(designBrief)
  const packCss = getPackCss(pack)
  const builderSystem = `${BUILDER_SYSTEM_PROMPT}\n\n${briefHeader}\n${designBrief}\n\n${getPackPromptNote(pack)}`

  const genFile = async (instruction: string, expectPath: string, useProvider: AIProvider = provider): Promise<string | null> => {
    // 3 attempts on the main provider (Gemini), then 1 attempt on Claude as fallback.
    // This handles: (a) transient Gemini rate limits / network errors,
    // (b) Gemini not wrapping the response in <file path="..."> tags.
    const providers: Array<{ p: AIProvider; label: string }> = [
      { p: useProvider, label: 'main' },
      { p: useProvider, label: 'main-retry' },
      { p: useProvider, label: 'main-retry-2' },
    ]
    const fallback = createEnhancer()
    if (fallback) providers.push({ p: fallback, label: 'Claude' })

    for (const { p, label } of providers) {
      // Add explicit format reminder to every attempt so the model never
      // returns raw HTML without the <file> wrapper
      const wrappedInstruction = `${instruction}\n\nIMPORTANT: Wrap your ENTIRE response in exactly one <file path="${expectPath}"> tag and nothing else — no markdown fences around it.`
      const res = await safeChat(p, wrappedInstruction, builderSystem)
      if (!res) { await sleep(label === 'main' ? 3000 : 5000); continue }

      // Try exact path match first, fall back to first parsed file
      let file = parseAIChanges(res.content).find(
        (f) => f.path.replace(/\\/g, '/').toLowerCase() === expectPath.toLowerCase(),
      ) ?? parseAIChanges(res.content)[0]

      // Last-resort: if the model returned raw HTML without <file> tags,
      // treat the whole response content as the file
      const raw = res.content.trim()
      if (!file?.content?.trim() && (raw.startsWith('<!DOCTYPE') || raw.startsWith('<html'))) {
        file = { path: expectPath, content: raw }
      }

      if (file?.content?.trim()) {
        if (label === 'Claude') {
          await updateTask(task, {}, `🤖 Claude stepped in to generate ${expectPath}`)
        }
        generated.push({ path: expectPath, content: file.content })
        return res.content
      }
      await sleep(2000)
    }
    return null
  }

  // 1. index.html — also has the model plan extra pages + a summary line
  await updateTask(task, { progress: 15 }, '🎨 Designing the site — generating index.html…')
  const indexRes = await genFile(
    `Build this website:\n\n${prompt}\n\nSite name: ${siteName}.
Generate ONLY index.html now. Include <meta name="viewport" content="width=device-width, initial-scale=1"> in the <head>, and link <link rel="stylesheet" href="styles.css"> and <script src="script.js" defer> (you will write those files later — do not inline them).
${source
  ? `This is a REBUILD of an established company's existing website. Their current site has ${source.pages} pages and ${source.images} images${source.sections.length ? `, with sections like: ${source.sections.slice(0, 10).join('; ')}` : ''}. Your rebuild MUST BE RICHER THAN THEIRS, never thinner — at least ${Math.max(4, source.pages)} pages and at least ${Math.max(10, source.images)} images. Mirror THEIR information architecture (the pages and sections listed in the BRAND SOURCE), then improve on it: better hierarchy, stronger visuals, clearer calls to action. Do NOT replace their structure with a generic template — a client will not abandon a site they like for a stock layout.`
  : `This site MUST have AT LEAST 4 pages total: index.html PLUS at least 3 more pages that fit the product (e.g. about, features/services, contact, gallery, pricing).`} Add working nav links to ALL of them in the sticky header nav.
Make the home page LONG, impressive and FULLY RESPONSIVE like a real product homepage: a sticky nav, a full hero (eyebrow + big headline with an accent span + subhead + two CTAs), ${source
  ? `then rebuild THEIR OWN SECTIONS from the BRAND SOURCE — the same topics and services they already show, in a comparable order — but executed far better: richer imagery, stronger typography, clearer hierarchy. Keep every service, capability and claim their current site makes; losing content is a downgrade. **HARD MINIMUM: at least 4 substantial content sections AFTER the hero (5 sections total including the hero).** If the source has fewer, invent additional sections that fit their business category and content (e.g. a "why choose us" / process / testimonials / FAQ / CTA banner)`
  : `then AT LEAST FIVE MORE full sections AFTER the hero (6 <section> elements total on the homepage — hard minimum, do not ship fewer), FOLLOWING THIS SITE'S CATEGORY CONVENTIONS from the DESIGN BRIEF (the sections a best-in-class real site in this category has, in their usual order — e.g. a hotel: rooms/suites, amenities, gallery, offers, reviews, location; a SaaS: features, how-it-works, pricing, testimonials, FAQ)`}, and a rich footer.\n\n**PLENTY OF IMAGES — this is critical, the site must feel photo-rich and visual, not text-heavy.** Requirements:\n- Full-bleed hero background image with dark gradient overlay (a positioned <img> OR CSS background-image on the hero section).\n- AT LEAST 3 OTHER SECTIONS with their own background imagery — either full-bleed background photos with overlay, subtle background patterns, OR a prominent side/inline photo. Not every section needs a hero-style background, but the page must feel VISUALLY rich section-to-section, never a wall of text on a plain background.\n- A dedicated gallery/showcase section with 4-6 photos in a grid.\n- Testimonial section with pravatar avatars.\n- Total: at least 10 real photos across the homepage.\n\nUse https://picsum.photos/seed/{seed}/{w}/{h} URLs (seed = a unique word+number per image so each is distinct and stable — hero1, gallery2, feature3, etc.) at appropriate sizes (heroes ≥ 1600 wide, gallery ≥ 600 wide). Avatars via https://i.pravatar.cc/300?img={n}. These URLs always resolve.\n\nMake the home page feel alive with smooth entrance animations, scroll-reveal on sections, and hover micro-interactions. Use fluid, responsive markup — no fixed pixel widths that overflow on phones. Real, specific, on-brand copy — never lorem, never "..." placeholders.
After the file, add exactly two lines:
EXTRA PAGES: comma-separated .html filenames the nav links to — LIST AT LEAST 3
SITE SUMMARY: one sentence describing the site`,
    'index.html',
  )
  if (!indexRes) return null

  // Section-count floor — from-prompt requires hero + 5 more = 6 sections
  // total; rebuild requires hero + 3 more = 4 sections total (rebuild floor is
  // softer because it mirrors the source's architecture, and some source sites
  // just don't have that much content). Auto-repair by re-asking Gemini for
  // the missing count rather than accepting a thin homepage.
  const minSections = source ? 4 : 6
  const countSections = (html: string) => (html.match(/<section\b/gi) ?? []).length
  let sectionsSoFar = countSections(generated[0].content)
  if (sectionsSoFar < minSections) {
    await updateTask(task, {}, `⚠️ Homepage shipped only ${sectionsSoFar} section(s) — asking Gemini to extend it to at least ${minSections}`, 'warn')
    for (let extendAttempt = 0; extendAttempt < 2 && sectionsSoFar < minSections; extendAttempt++) {
      const need = minSections - sectionsSoFar
      const extRes = await safeChat(provider, `The homepage index.html you just wrote only has ${sectionsSoFar} <section> element(s), but the requirement is at LEAST ${minSections}. Return the COMPLETE index.html again with ${need} ADDITIONAL substantial content section(s) added (real copy, on-brand for this business, no placeholders, ideally with their own background imagery or a prominent inline photo). Every existing section, image, and link MUST be preserved. Return as <file path="index.html">…</file>.\n\nCurrent index.html:\n\`\`\`html\n${generated[0].content}\n\`\`\``, builderSystem)
      const fixed = extRes ? parseAIChanges(extRes.content).find((f) => f.path === 'index.html') : undefined
      if (fixed?.content && countSections(fixed.content) > sectionsSoFar) {
        generated[0].content = fixed.content
        sectionsSoFar = countSections(fixed.content)
        await updateTask(task, {}, `✅ Homepage now has ${sectionsSoFar} section(s)`)
      } else {
        break
      }
    }
  } else {
    await updateTask(task, {}, `📐 Homepage has ${sectionsSoFar} section(s) (floor: ${minSections})`)
  }

  const indexHtml = generated[0].content
  const summaryLine = indexRes.match(/SITE SUMMARY:\s*(.+)/)?.[1]?.trim()
  const extraPages = (indexRes.match(/EXTRA PAGES:\s*(.+)/)?.[1] ?? '')
    .split(',')
    .map((p) => p.trim().replace(/[`"']/g, ''))
    .filter((p) => /^[\w-]+\.html$/i.test(p) && p.toLowerCase() !== 'index.html')
    .slice(0, Number(process.env.BUILDER_MAX_PAGES ?? 8))
  // Floor: guarantee at least 3 extra pages (4 total). Pad with sensible defaults
  // the model didn't already include, so a build always ships >= 4 pages.
  for (const d of ['about.html', 'services.html', 'contact.html', 'gallery.html', 'pricing.html', 'faq.html']) {
    if (extraPages.length >= 3) break
    if (!extraPages.includes(d)) extraPages.push(d)
  }

  // 2. extra pages FIRST — styles.css must see EVERY page's markup before
  // it is written, or page-specific elements render browser-default
  const generatedPages: string[] = []
  for (const page of extraPages) {
    await updateTask(task, { progress: 20 }, `📄 Generating ${page}…`)
    await sleep(1500)
    const ok = await genFile(
      `Here is the site's index.html for reference (reuse its exact header, nav, footer, and linked styles.css/script.js):\n\`\`\`html\n${indexHtml.slice(0, 6000)}\n\`\`\`\n\nGenerate the COMPLETE ${page} page for this site (original request: ${prompt.slice(0, 300)}). Full, polished content — no placeholders.`,
      page,
    )
    if (ok) {
      generatedPages.push(page)
    }
    // If generation failed, silently skip — don't add the page to the nav
    // so the user never sees a broken 404 link
  }

  // Guarantee responsiveness (viewport meta) and that EVERY GENERATED page is
  // reachable from the nav. Only include pages that were actually generated —
  // failed pages are excluded so they never appear as broken nav links.
  ensureViewport(generated)
  ensureNavLinks(generated, ['index.html', ...generatedPages])

  // All pages' markup — the context for styles.css and script.js. This is
  // a long input: the hybrid provider routes it to Gemini automatically.
  const allPagesHtml = () => generated
    .filter((f) => f.path.endsWith('.html'))
    .map((f) => `### ${f.path}\n\`\`\`html\n${f.content.slice(0, 6000)}\n\`\`\``)
    .join('\n\n')

  // 3. styles.css — written AFTER every page exists, covering all of them.
  // On rebuild flows the stylist (Claude) takes over here so the styling reads
  // premium; on normal generation `stylist` is undefined and this stays on the
  // main provider (unchanged behaviour).
  await updateTask(task, { progress: 40 },
    stylist ? '🎨 Claude is styling this rebuild — generating styles.css…' : '🎨 Generating styles.css for all pages…')
  await sleep(1500)
  // "Beat this" reference — when we have the original site's own CSS, show it
  // to the stylist and demand a 100%-better result. Without a concrete
  // reference the model has nothing to out-do; with it, we anchor quality
  // above what the client already had.
  const beatReference = originalCss
    ? `\n\n═══ THE SITE'S CURRENT STYLESHEET — YOUR NEW ONE MUST BE AT LEAST 100% BETTER ═══\nBelow is the CSS the client's existing site actually ships. Read it — see their palette, their type scale, their spacing rhythm, their card/button treatment. Then write a stylesheet that unambiguously beats it: sharper typography, richer palette (built on top of THEIR brand colors so it's still recognisable), stronger depth hierarchy, better spacing rhythm, more thoughtful hover/focus states, and full responsive coverage. Not just different — measurably better. Do NOT copy their rules verbatim, do NOT inherit their exact class names in your CSS unless the generated HTML also uses them. Use this as a QUALITY FLOOR and a POINT OF DEPARTURE:\n\n\`\`\`css\n${originalCss.slice(0, 30000)}\n\`\`\`\n`
    : ''
  if (!(await genFile(
    `Here are ALL the site's pages:\n\n${allPagesHtml()}\n\nOriginal request: ${prompt.slice(0, 400)}\n\nGenerate the COMPLETE styles.css for this site: every class and id used in ANY page above, plus base styles and the full quality bar. Style all forms, inputs, selects, textareas, checkbox groups, fieldsets, cards, and grids — no element on any page may render with browser defaults.\n\nThe site MUST be FULLY RESPONSIVE, mobile-first: include \`img, video { max-width: 100%; height: auto }\`, a fluid max-width content container, and @media breakpoints at 960px and 640px that stack multi-column grids to one column, wrap/collapse the nav, shrink the hero and section padding, and let wide content (e.g. tables) scroll horizontally. Nothing may overflow the viewport horizontally on a phone.${beatReference}`,
    'styles.css',
    stylist,
  ))) {
    await updateTask(task, {}, '⚠️ Could not generate styles.css after retrying', 'warn')
  }

  // 4. script.js — also sees every page, since all pages load the same file
  await updateTask(task, { progress: 50 }, '⚙️ Generating script.js…')
  await sleep(1500)
  if (!(await genFile(
    `Here are the site's pages:\n\n${allPagesHtml()}\n\nGenerate the COMPLETE script.js: wire up every interactive element referenced in ANY page above (nav toggle, forms with validation feedback, tabs, smooth scrolling) PLUS tasteful dynamic effects — scroll-reveal animations as sections enter the viewport (an IntersectionObserver that adds a visible class), and any animated counters or tabs the markup calls for. Vanilla JS only. Every page loads this same file, so guard every selector against missing elements.`,
    'script.js',
  ))) {
    await updateTask(task, {}, '⚠️ Could not generate script.js after retrying', 'warn')
  }

  sanitizeCss(generated, 'styles.css')
  // Follow-up styling pass rides the same stylist as styles.css itself, so a
  // rebuild's whole CSS lineage stays on Claude when it's available.
  await appendMissingStyles(stylist ?? provider, generated, 'styles.css', ['.html'], BUILDER_SYSTEM_PROMPT,
    (n) => updateTask(task, { progress: 55 }, `🎨 ${n} class(es) missing styles — extending styles.css…`))
  sanitizeCss(generated, 'styles.css')
  fixBlurNavBackground(generated, 'styles.css')

  // Loading effect: a spinner preloader overlay on every page + the page-load CSS.
  ensureLoader(generated)
  // Reveal safety net inlined into every <head> — runs BEFORE script.js is
  // fetched, so sections stay visible even if script.js is blocked, missing,
  // or has a syntax error. Fourth and final layer of the "no blank sections
  // ever" guarantee.
  ensureRevealSafety(generated)
  const stylesEntry = generated.find((f) => f.path === 'styles.css')
  if (stylesEntry) {
    // Pack CSS is the deterministic foundation layer — AI rules override on top
    stylesEntry.content = `${packCss}\n/* ── Site Styles ── */\n${stylesEntry.content}\n${LOADING_CSS}\n${FINAL_FIXES_CSS}\n${HAMBURGER_CSS}\n${REVEAL_SAFETY_CSS}\n${HERO_CONTRAST_SAFETY_CSS}`
  }
  const scriptEntry = generated.find((f) => f.path === 'script.js')
  // Preloader scrub — the model often invents its OWN preloader (#preloader,
  // .preloader, body.loading-state) expecting matching JS handlers we didn't
  // ask for. Without the handlers the spinner spins forever and the page
  // never renders. Force-hide anything preloader-shaped on DOMContentLoaded
  // and load, then again after a short delay for late-injected variants.
  const preloaderScrub = `(function(){try{function kill(){try{document.body.classList.remove('loading-state','loading','is-loading','preload','no-js');document.documentElement.classList.remove('loading-state','loading','is-loading','preload','no-js');document.querySelectorAll('#preloader,.preloader,#pre-loader,.pre-loader,#loading-overlay,.loading-overlay,#loading-screen,.loading-screen,.site-preloader,.page-preloader').forEach(function(n){n.style.display='none';n.style.opacity='0';n.style.visibility='hidden';n.style.pointerEvents='none';setTimeout(function(){try{n.remove()}catch(e){}},50);});}catch(e){}}kill();document.addEventListener('DOMContentLoaded',kill);window.addEventListener('load',function(){kill();setTimeout(kill,300);setTimeout(kill,1500);});}catch(e){}})();`
  // Universal reveal handler — the model invents its own class-name
  // conventions (.scroll-reveal → .is-visible, .reveal → .active, .fade-in
  // → .visible, [data-aos] → .aos-animate). Without matching JS handlers,
  // every one of those elements stays at opacity: 0 forever and the whole
  // section looks empty. Observe every common convention and add the right
  // visibility class on intersect; then a 2.5s backstop force-reveals anything
  // still hidden so the page can never look blank.
  const revealScrub = `(function(){try{
    var conventions=[
      {sel:'.scroll-reveal',add:'is-visible'},
      {sel:'.reveal',add:'active'},
      {sel:'.fade-in',add:'visible'},
      {sel:'.slide-in',add:'visible'},
      {sel:'.animate-on-scroll',add:'animated'},
      {sel:'.animate-on-load',add:'in-view'},
      {sel:'[data-aos]',add:'aos-animate'},
      {sel:'[data-reveal]',add:'in-view'},
      {sel:'[data-scroll]',add:'is-inview'},
      {sel:'[data-animate]',add:'is-visible'},
      {sel:'.animate:not(.animated)',add:'animated'},
      {sel:'.will-animate',add:'animated'},
      {sel:'.fade-up',add:'is-visible'},
      {sel:'.fade-down',add:'is-visible'},
      {sel:'.zoom-in',add:'is-visible'}
    ];
    // Force inline opacity/visibility with !important so the element stays
    // visible no matter which class-name convention the AI-written CSS uses
    // (.is-visible vs .animated vs .visible vs …). Without this, the emergency
    // animation's forwards-held state gets DROPPED when IO adds .animated (its
    // :not(.animated) selector stops matching → animation removed → opacity
    // reverts to the base rule's 0). Transform is left cleared, not forced, so
    // hover translations on cards still work.
    function makeVisible(el,cls){el.classList.add(cls);el.style.setProperty('opacity','1','important');el.style.setProperty('visibility','visible','important');el.style.transform='';}
    if(!('IntersectionObserver' in window)){
      conventions.forEach(function(c){document.querySelectorAll(c.sel).forEach(function(el){makeVisible(el,c.add);});});
      return;
    }
    conventions.forEach(function(c){
      var els=document.querySelectorAll(c.sel);
      if(!els.length)return;
      var io=new IntersectionObserver(function(entries){
        entries.forEach(function(e){if(e.isIntersecting){makeVisible(e.target,c.add);io.unobserve(e.target);}});
      },{threshold:0.08,rootMargin:'0px 0px -40px 0px'});
      els.forEach(function(el){io.observe(el);});
    });
    // Backstop 1: after 2.5s force-reveal anything still hidden by known convention.
    setTimeout(function(){
      conventions.forEach(function(c){document.querySelectorAll(c.sel).forEach(function(el){makeVisible(el,c.add);});});
    },2500);

    // Backstop 2 (ABSOLUTE): after 3.5s walk every direct child of every
    // <section>/<main>/<article>. Any element whose computed opacity is 0 AND
    // is not deliberately-hidden UI (dropdown, modal, tooltip, popover,
    // preloader, cookie banner — those SHOULD stay hidden until interaction)
    // gets force-revealed. Class-name-agnostic — works no matter what
    // convention Gemini invents next. This is the "cannot recur" guarantee.
    var deliberateHideSel='dropdown,submenu,sub-menu,mega-menu,tooltip,popover,modal,dialog,overlay,cookie,consent,preloader,pre-loader,loading,offscreen,collapsed,accordion-content,tab-panel,tab-content';
    function isDeliberatelyHidden(el){
      var e=el;while(e && e.classList){
        for(var i=0;i<e.classList.length;i++){var c=e.classList[i].toLowerCase();
          if(deliberateHideSel.split(',').some(function(k){return c.indexOf(k)!==-1;}))return true;
        }
        if(e.hasAttribute && (e.hasAttribute('hidden')||e.getAttribute('aria-hidden')==='true'||e.getAttribute('role')==='dialog'||e.getAttribute('role')==='menu'||e.getAttribute('role')==='tooltip'))return true;
        e=e.parentElement;
      }
      return false;
    }
    setTimeout(function(){
      var containers=document.querySelectorAll('section,main,article,[class*="section"],[class*="Section"]');
      containers.forEach(function(c){
        c.querySelectorAll('*').forEach(function(el){
          if(!el.isConnected||isDeliberatelyHidden(el))return;
          try{
            var cs=getComputedStyle(el);
            if(cs.opacity==='0'||cs.visibility==='hidden'){
              el.style.setProperty('opacity','1','important');
              el.style.setProperty('visibility','visible','important');
              el.style.setProperty('transform','none','important');
              el.style.setProperty('animation','none','important');
            }
          }catch(e){}
        });
      });
    },3500);
  }catch(e){}})();`
  if (scriptEntry) scriptEntry.content = `${preloaderScrub}\n${revealScrub}\n${scriptEntry.content}\n/* Mobile hamburger nav */\n${HAMBURGER_JS}\n`

  // Vercel-ready by default — every generated static site ships with a
  // vercel.json so a Vercel deploy is one-click clean-URLs (about → /about
  // serving about.html), correct 404 handling, no trailing slashes. This
  // also removes the need for Blitz Deploy to write it later at deploy
  // time — the file is already in the repo. Ignored by other hosts.
  // Vercel serves 404.html automatically from the root if present — no
  // config field needed. `errorPage` is NOT in Vercel's vercel.json schema
  // and including it causes "invalid config" build failures.
  const vercelJson = JSON.stringify({
    cleanUrls: true,
    trailingSlash: false,
  }, null, 2) + '\n'
  if (!generated.find((f) => f.path === 'vercel.json')) {
    generated.push({ path: 'vercel.json', content: vercelJson })
  }

  return { files: generated, summary: summaryLine }
}

// ═══ ENHANCE MODE ══════════════════════════════════════════
// Keep the client's EXISTING pages — their structure, their sections, their copy,
// their photos in the same places — and give the site a stunning new stylesheet.
// The layout was designed by a human and already works; regenerating it from
// scratch throws that away. Here we only replace the styling (and may add a few
// tasteful elements), which is both safer and far more faithful.

async function enhanceExistingSite(
  provider: AIProvider,
  importUrl: string,
  sitePath: string,
  designBrief: string,
  task: any,
  priorAudit?: SiteAudit,
  /** Dedicated provider for the CSS enhancement layer (Claude on enhance mode)
   *  so the boomabastic styling isn't gated on the free stack's output cap. */
  stylist?: AIProvider,
): Promise<{ files: ParsedChange[]; summary?: string; audit?: SiteAudit; enhancements?: string[] } | null> {
  await updateTask(task, { progress: 12 }, `🔎 Capturing the existing pages from ${importUrl}…`)
  // Capture generously — every page we miss becomes a link that leaves the new
  // site, so cover the whole small-business site rather than just the top few.
  const pages = await capturePages(importUrl, 14, { timeoutMs: 15000, budgetMs: 120000 })
  if (!pages.length) return null
  await updateTask(task, { progress: 18 }, `📄 Captured ${pages.length} page(s): ${pages.map((p) => p.file).join(', ')}`)

  // Score the original so the report can show what we started from. The route
  // already audited it when gating the request — reuse that result if present.
  const audit = priorAudit ?? (await auditSite(importUrl, pages) ?? undefined)
  if (audit) {
    await updateTask(task, { progress: 20 }, `📊 Original site scored ${audit.score}/10 — ${audit.headline}`)
  }
  const enhancements: string[] = []

  // Their photos, downloaded and mapped so each one goes back EXACTLY where it was
  const allImageUrls = [...new Set(pages.flatMap((p) => imageUrlsIn(p)))]
  const imageMap = await downloadImageMap(allImageUrls, path.join(sitePath, 'assets'), 'assets/')
  await updateTask(task, { progress: 24 }, `🖼️ Saved ${imageMap.size} of their images (kept in their original positions)`)

  // Keep their own stylesheets, downloaded locally so the site is self-contained.
  // Our sheet is linked AFTER theirs, so it layers polish on top and the design
  // can only improve — never regress, which matters when the original is good.
  const cssMap = await downloadStylesheets(pages, path.join(sitePath, 'assets'), 'assets/')
  if (cssMap.size) await updateTask(task, {}, `🎨 Kept ${cssMap.size} of their stylesheet(s) as the base — our enhancements layer on top`)
  // Their scripts too — these drive their own nav drawer, sliders and forms.
  const scriptMap = await downloadScripts(pages, path.join(sitePath, 'assets'), 'assets/')
  if (scriptMap.size) await updateTask(task, {}, `⚙️ Kept ${scriptMap.size} of their script(s) so existing interactions still work`)

  // Internal links → the local page files
  const pageMap = new Map<string, string>()
  for (const p of pages) pageMap.set(p.url.replace(/\/$/, ''), p.file)

  const files: ParsedChange[] = pages.map((p) => ({
    path: p.file,
    content: sanitizeImportedHtml(p, imageMap, pageMap, { keepStyles: true, cssMap, scriptMap }),
  }))

  // What the enhancement layer can target
  const allHtml = files.map((f) => f.content).join('\n')
  const { classes, ids } = selectorsIn(allHtml)
  const homeHtml = files.find((f) => f.path === 'index.html')?.content ?? files[0].content

  const cssEntry: ParsedChange = { path: 'styles.css', content: '' }
  files.push(cssEntry)

  await updateTask(task, { progress: 34 },
    stylist ? '🎨 Claude is designing the enhancement layer over their existing site…'
            : '🎨 Writing an enhancement layer over their existing design…')
  const cssProvider = stylist ?? provider
  const layerCss = await (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await safeChat(
        cssProvider,
        `${briefHeader}\n${designBrief}\n\nThis is an ENHANCEMENT of a website that ALREADY has its own stylesheet and looks decent on desktop. Their CSS loads FIRST; yours loads AFTER and layers on top. The HTML is FIXED and their DESKTOP layout must be preserved.\n\nTheir homepage markup:\n\`\`\`html\n${homeHtml.slice(0, 9000)}\n\`\`\`\n\nClasses used across the site: ${classes.slice(0, 120).join(', ')}\n${ids.length ? `IDs: ${ids.slice(0, 30).join(', ')}` : ''}\n\nWrite styles.css that ELEVATES it to a premium, high-end feel WITHOUT breaking their layout:\n- Refined depth: softer layered shadows on cards, 1px translucent borders, subtle gradient or glass accents.\n- Better rhythm: slightly more generous section padding and consistent spacing.\n- Typography polish: tighter heading letter-spacing, better line-height, a confident type scale.\n- Micro-interactions: smooth ~180ms transitions, hover lift on cards/buttons, clear focus-visible rings.\n- Images: object-fit cover and consistent rounded corners (never move or resize them out of place).\n\nMOBILE IS CRITICAL — many templates render as a shrunken desktop on phones. Dedicate a SUBSTANTIAL portion of the output (at least a third) to @media queries at 900px, 640px and 420px that make the site truly phone-friendly. Inside those @media blocks you MAY freely set display/width/flex/grid/padding on their existing classes/ids to: (1) collapse multi-column rows to a single column, (2) let containers, .row, .wrapper and .col-* elements go width:100% with side padding 16px, (3) wrap or hide desktop-only nav in favor of a hamburger, (4) prevent ALL horizontal overflow (html,body{overflow-x:hidden;max-width:100vw}), (5) shrink hero/section vertical padding, (6) scale headings down via clamp(), (7) stack side-by-side hero image + text vertically, (8) make tables scroll horizontally instead of blowing out. Use !important inside @media so their desktop rules give way on small screens. Target the ACTUAL class names listed above.\n\nCRITICAL RULES OUTSIDE @media: do NOT change their color identity dramatically — refine it. Do NOT set display:none on anything. Do NOT alter widths/positions in ways that would move their sections. Only use the class/id names listed above. Prefer additive polish over overrides. Output as <file path="styles.css">.`,
        BUILDER_SYSTEM_PROMPT,
      )
      if (!res) { await sleep(2000); continue }
      const file = parseAIChanges(res.content)[0]
      if (file?.content?.trim()) return stripCodeFence(file.content.trim())
      await sleep(2000)
    }
    return ''
  })()
  if (layerCss) {
    // Structural guard: strip anything that would move their layout or hijack
    // their fonts/colors. Prompt instructions alone are not reliable — without
    // this, a "polish" layer can turn their nav into display:block and their
    // brand buttons red. Responsive @media blocks keep the full property set.
    const { css: safeCss, dropped } = sanitizeEnhancementCss(layerCss)
    cssEntry.content += `/* ── ForgeAI enhancement layer (loads after the original styles) ── */\n${safeCss}\n`
    if (dropped) {
      await updateTask(task, {}, `🛡️ Removed ${dropped} declaration(s) that would have altered their layout, fonts or brand colors`)
    }
  }
  sanitizeCss(files, 'styles.css')
  fixBlurNavBackground(files, 'styles.css')

  // Interactions. Their own JS is preserved, so we only ADD a scroll-reveal —
  // and the hamburger ONLY if they don't already have a mobile menu of their own
  // (injecting a second one would give the page two burgers).
  const ownMobileNav = hasOwnMobileNav(allHtml)
  await updateTask(task, { progress: 72 },
    ownMobileNav
      ? '⚙️ Adding scroll-reveal (their own mobile menu detected — leaving it alone)'
      : '⚙️ Adding scroll-reveal and a mobile hamburger menu…')

  const reveal = `(function(){try{var els=document.querySelectorAll('section,.card,.feature,.testimonial');if(!els.length||!('IntersectionObserver'in window))return;els.forEach(function(el){el.classList.add('fa-reveal')});var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('fa-in');io.unobserve(e.target)}})},{threshold:.12});els.forEach(function(el){io.observe(el)})}catch(e){}})();`
  const revealCss = `\n/* Scroll reveal (additive — never hides content if JS fails) */\n.fa-reveal{opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}\n.fa-in{opacity:1;transform:none}\n@media (prefers-reduced-motion: reduce){.fa-reveal{opacity:1;transform:none;transition:none}}\n`

  files.push({ path: 'script.js', content: `// ForgeAI enhancements\n${reveal}\n` })

  ensureViewport(files)
  const styles = files.find((f) => f.path === 'styles.css')!
  styles.content += `\n${revealCss}\n${FINAL_FIXES_CSS}`

  // Always ship the full mobile rescue on enhance mode. It's scoped inside
  // @media (max-width: 820px) so it can only affect small screens, and enhance
  // targets sites that need help — a good mobile site would not be enhanced.
  // The previous "did they have breakpoints?" gate was too generous: layui and
  // similar templates ship phone breakpoints that don't actually work, so we
  // were skipping the rescue on the exact sites that needed it most.
  const js = files.find((f) => f.path === 'script.js')!
  styles.content += `\n${RESPONSIVE_RESCUE_CSS}\n${MOBILE_MENU_CSS}`
  js.content += `\n/* Mobile menu (any markup) */\n${MOBILE_MENU_JS}\n`
  enhancements.push('Made the site work on phones: fluid widths, stacked columns, a wrapping header, readable type and no horizontal scrolling — applied under a 820px media query so the desktop layout is untouched')
  await updateTask(task, {}, '📱 Applied the full mobile rescue layer (fires under 820px only)')
  if (!ownMobileNav) {
    styles.content += `\n${HAMBURGER_CSS}`
    js.content += `\n/* Mobile hamburger nav */\n${HAMBURGER_JS}\n`
  }

  // What actually changed — reported to the client in the PDF
  enhancements.push(
    `Preserved the original structure of all ${pages.length} page(s) — every section, heading and link kept in place`,
    `Downloaded and self-hosted ${imageMap.size} image(s) in their original positions, so the site no longer depends on the old server`,
  )
  if (cssMap.size) enhancements.push(`Kept the original stylesheet(s) as the base and layered new styling on top, so nothing regressed`)
  if (scriptMap.size) enhancements.push(`Preserved ${scriptMap.size} of the site's own script(s) so existing interactions keep working`)
  if (layerCss) enhancements.push('Added a premium styling layer: refined shadows and borders, consistent rounded corners, tighter typography rhythm and smooth hover/focus transitions')
  enhancements.push('Added scroll-reveal animation so sections fade in as the visitor scrolls')
  enhancements.push('Guaranteed a responsive viewport on every page and added mobile layout fixes')
  if (!ownMobileNav) enhancements.push('Added a mobile hamburger menu (the original had none)')
  enhancements.push('Removed analytics/tracking scripts from the delivered copy')

  return {
    files,
    summary: `Enhanced ${pages.length} page(s) from ${importUrl} — original structure and photos kept, styling upgraded.`,
    audit,
    enhancements,
  }
}

// ═══ CLAUDE-CONTROLLED REBUILD ═════════════════════════════
// New rebuild flow: keep the client's HTML markup exactly (every element,
// class, id, section, image, link stays where it is), throw away their entire
// stylesheet(s) and scripts, and let CLAUDE write a brand new styles.css from
// scratch — a fresh, more advanced design than the original. Same content,
// completely new visual identity. This feature is Claude-only: it fails
// loudly if ANTHROPIC_API_KEY is not configured, because the whole promise
// of the mode is the styling quality that only Claude delivers.

async function rebuildImportedSiteWithClaude(
  claude: AIProvider | null,
  importUrl: string,
  sitePath: string,
  designBrief: string,
  task: any,
  priorAudit?: SiteAudit,
): Promise<{ files: ParsedChange[]; summary?: string; audit?: SiteAudit; enhancements?: string[] } | null> {
  if (!claude) {
    await updateTask(task, {}, '❌ Claude-rebuild needs ANTHROPIC_API_KEY — configure it or use enhance mode instead', 'error')
    return null
  }

  await updateTask(task, { progress: 12 }, `🔎 Capturing pages from ${importUrl}…`)
  const pages = await capturePages(importUrl, 14, { timeoutMs: 15000, budgetMs: 120000 })
  if (!pages.length) return null
  await updateTask(task, { progress: 18 }, `📄 Captured ${pages.length} page(s): ${pages.map((p) => p.file).join(', ')}`)

  const audit = priorAudit ?? (await auditSite(importUrl, pages) ?? undefined)
  if (audit) {
    await updateTask(task, { progress: 20 }, `📊 Original site scored ${audit.score}/10 — Claude will completely restyle it`)
  }
  const enhancements: string[] = []

  // Keep their real photos — those are content, not styling.
  const allImageUrls = [...new Set(pages.flatMap((p) => imageUrlsIn(p)))]
  const imageMap = await downloadImageMap(allImageUrls, path.join(sitePath, 'assets'), 'assets/')
  await updateTask(task, { progress: 24 }, `🖼️ Saved ${imageMap.size} of their images (kept in their original positions)`)

  // Internal links → local files
  const pageMap = new Map<string, string>()
  for (const p of pages) pageMap.set(p.url.replace(/\/$/, ''), p.file)

  // Sanitize with keepStyles=false → strips <style>, <link stylesheet>,
  // style="" attributes AND all their <script> tags. What survives: the raw
  // structural HTML + their content + their images. A clean canvas for Claude.
  const files: ParsedChange[] = pages.map((p) => ({
    path: p.file,
    content: sanitizeImportedHtml(p, imageMap, pageMap, { keepStyles: false }),
  }))

  // What Claude has to style
  const allHtml = files.map((f) => f.content).join('\n')
  const { classes, ids } = selectorsIn(allHtml)
  const perPageMarkup = files
    .map((f) => `### ${f.path}\n\`\`\`html\n${f.content.slice(0, 6000)}\n\`\`\``)
    .join('\n\n')

  await updateTask(task, { progress: 34 }, '🎨 Claude is writing a brand new stylesheet from scratch…')

  const REBUILD_SYSTEM_PROMPT = `You are a senior brand designer restyling a real client website. Your ONE job: read the brand's own content and produce a stylesheet that FITS THAT BRAND — professional, correct, and free of layout bugs. You do NOT impose a house style. You do NOT default to dark themes, gradient text, glowing pills, or "startup premium". You do NOT add visual flourishes the brand's category does not call for.\n\nMatch the register the client would recognize as THEIR brand: a recruitment agency is corporate and trustworthy; a law firm is conservative and authoritative; a dental clinic is clean and reassuring; a fintech is precise and confident; a bakery is warm and tactile. When in doubt, err toward calmer, more professional, more neutral. Restraint reads as premium; ornament reads as amateur.\n\nOutput must be COMPLETE and correct — layout bugs (misplaced dropdowns, modal covering the hero, missing icons rendering as empty circles) are worse than a plainer design. Fix each issue before shipping.`

  const styleRes = await safeChat(
    claude,
    `${briefHeader}\n${designBrief}\n\nYou are RESTYLING this real client website. The HTML markup is FIXED — cannot change a single element, class, id, or piece of content. Write a complete styles.css that makes the site look like it was designed by a competent professional agency for THIS specific brand.\n\nEvery page's markup:\n\n${perPageMarkup}\n\nClasses used across the site: ${classes.slice(0, 200).join(', ')}\n${ids.length ? `IDs used: ${ids.slice(0, 60).join(', ')}` : ''}\n\n═══ STEP 1 — READ THE BRAND BEFORE WRITING ANY CSS ═══\n\nLook at the actual copy, headings, page names, and imagery in the HTML above. Answer silently:\n- What does this business DO? (recruitment agency? SaaS? clinic? construction?)\n- Who is the audience? (B2B decision-makers? consumers? patients?)\n- What visual register does that audience expect? Professional/corporate? Clean/minimal? Warm/artisan? Confident/technical?\n\nThen commit to a design that MATCHES that register. Examples of correct matching:\n- Recruitment / consulting / legal / accounting → LIGHT theme, muted professional palette (navy/slate/beige/white), serif or clean sans headings, generous whitespace, subtle shadows, NO gradient text, NO neon glow, NO dark cards.\n- SaaS / fintech → light or dark depending on their existing brand, tight sans-serif, modular cards, restrained accent color, NO gratuitous gradients.\n- Consumer / lifestyle / creative → warmer palette, more expressive type, but STILL restrained.\n- Only genuinely "premium consumer product" categories (perfume, luxury goods, DTC apparel) call for the dark-with-gradient-hero treatment. DEFAULT AWAY FROM IT.\n\n═══ STEP 2 — NON-NEGOTIABLE HARD REQUIREMENTS ═══\n\n**A. NO LAYOUT BUGS.** Common failure modes to explicitly prevent:\n   - **Cookie / consent banners** (any element with id/class containing cookie, consent, gdpr, cmp, banner-cookie): position: fixed at bottom of viewport (bottom:0; left:0; right:0), NOT centered, NEVER covering hero content. Full-width strip, small padding, semi-transparent background, on top with z-index >= 9999.\n   - **Dropdown / submenu panels** (nav dropdowns, submenu, mega-menu, .dropdown-menu, .submenu): position: absolute relative to their PARENT nav-item (which must be position: relative), NOT floating detached in the header. Hidden by default (opacity:0; visibility:hidden or display:none), shown on parent :hover or :focus-within.\n   - **Icon-only elements with no visible glyph** (spans/i with class like icon, fa-*, glyphicon that render empty because the icon font was stripped): give them a small width/height and neutral background OR display:none if they're purely decorative. Never leave empty circles hanging.\n   - **Sticky nav must not overlap content** — add scroll-padding-top to html equal to nav height, and margin-top / padding-top to the first section.\n\n**B. RESPONSIVENESS — perfect on a 375px phone.** Required:\n   - html, body { overflow-x: hidden; max-width: 100vw } at all sizes.\n   - img, video, iframe { max-width: 100%; height: auto }.\n   - @media (max-width: 960px), (max-width: 640px), (max-width: 420px) that collapse multi-column layouts to one column, shrink hero/section vertical padding, scale headings down, stack image+text vertically, wrap the nav.\n   - Fluid container: ~1140px max on desktop, width:100% with 16-20px padding on phones.\n   - Tap targets: buttons/links/inputs min-height 44px on mobile.\n\n**C. STYLE EVERY CLASS AND ID LISTED ABOVE** — nothing may render with browser defaults. Base styles for html/body/typography/links/forms/buttons/inputs/lists as well.\n\n═══ STEP 3 — CRAFT QUALITY (professional, not flashy) ═══\n\n1. Type scale using clamp(): hero h1 ~ clamp(2.25rem, 5vw, 3.75rem) — CONFIDENT but not shouty. Body 16-18px, line-height 1.6.\n2. Google Fonts @import at the top of the file — pick fonts that fit the brand register (a recruitment agency: Inter / DM Sans / Source Sans; a legal firm: Merriweather / Playfair display for headings). DO NOT rely on the HTML to load fonts.\n3. Palette in :root as CSS custom properties. Restrained: primary + one accent + a few neutrals. Verify contrast on every text/background pair.\n4. Depth is SUBTLE: 1px borders, soft shadows (max 8-16px blur, low opacity), rounded corners 8-12px. NO glowing pills, NO neon, NO heavy gradients unless the brand is genuinely a consumer luxury product.\n5. Rhythm: consistent section padding (clamp(56px, 8vw, 96px) vertical), a max-width content container centered.\n6. Transitions ~180ms on interactive elements, hover states restrained (subtle color shift or 1-2px lift, not glow).\n7. Nav: sticky header with SOLID background (not backdrop-filter unless the brand is minimal/tech), thin border-bottom, obvious active-link state.\n8. Images: object-fit: cover, consistent rounded corners, never rotated/tilted.\n9. NO GRADIENT TEXT on headings unless the brand is deliberately expressive. Solid brand color on the hero headline is the professional default.\n\nOutput exactly one file, complete, no truncation:\n<file path="styles.css">\n/* the entire stylesheet here */\n</file>`,
    REBUILD_SYSTEM_PROMPT,
  )
  const newCss = styleRes ? parseAIChanges(styleRes.content)[0]?.content : undefined
  if (!newCss || newCss.trim().length < 400) {
    await updateTask(task, {}, '❌ Claude did not return a usable stylesheet — try again', 'error')
    return null
  }

  const cssEntry: ParsedChange = { path: 'styles.css', content: stripCodeFence(newCss.trim()) }
  files.push(cssEntry)
  sanitizeCss(files, 'styles.css')
  fixBlurNavBackground(files, 'styles.css')

  // Verify Claude wrote real mobile rules. The 820px safety net below will
  // save us on phones regardless, but if this check fails Claude effectively
  // ignored the responsive requirement — worth surfacing to the task log so
  // we notice model regressions instead of relying on the net forever.
  const phoneMediaCount = (cssEntry.content.match(/@media[^{]*max-width\s*:\s*(\d+)px/gi) ?? [])
    .filter((q) => Number(q.match(/(\d+)px/)?.[1] ?? 9999) <= 640).length
  if (phoneMediaCount < 2) {
    await updateTask(task, {}, `⚠️ Claude wrote only ${phoneMediaCount} phone-size @media block(s) — the 820px safety net will pick up the slack`, 'warn')
  } else {
    await updateTask(task, {}, `📱 Claude wrote ${phoneMediaCount} phone-size @media block(s) — responsive by design`)
  }

  // Interactions — deterministic, small, always on.
  const reveal = `(function(){try{var els=document.querySelectorAll('section,.card,.feature,.testimonial,article');if(!els.length||!('IntersectionObserver'in window))return;els.forEach(function(el){el.classList.add('fa-reveal')});var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('fa-in');io.unobserve(e.target)}})},{threshold:.12});els.forEach(function(el){io.observe(el)})}catch(e){}})();`
  const revealCss = `\n/* Scroll reveal */\n.fa-reveal{opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}\n.fa-in{opacity:1;transform:none}\n@media (prefers-reduced-motion: reduce){.fa-reveal{opacity:1;transform:none;transition:none}}\n`

  // Runtime scrub — three layers:
  //   1. Class/id-based removal (Klaro, Cookiebot, OneTrust, Iubenda, …).
  //   2. TEXT-based removal for consent modals that use non-obvious class
  //      names (e.g. "cn-modal", "translation-notice"). If an element is
  //      fixed/absolute positioned AND its text looks like a consent modal
  //      ("consent", "cookies", "gdpr", "translations", "privacy policy"),
  //      it goes — regardless of class name.
  //   3. Any body/html scroll-lock class or inline overflow:hidden gets
  //      cleared so a leftover modal-lock can't freeze the page.
  //   MutationObserver re-runs on any DOM mutation.
  const cookieScrub = `(function(){try{
    var idSel='[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id*="gdpr" i],[class*="gdpr" i],[id*="klaro" i],[class*="klaro" i],[class*="cn-" i][class*="modal" i],[class*="cn-" i][class*="notice" i],[id*="privacy-settings" i],[class*="privacy-settings" i],[id*="cookiebot" i],[id*="onetrust" i],[id*="iubenda" i],[id*="tarteaucitron" i],[id*="cookieyes" i],[class*="cmp" i][class*="modal" i],[class*="translation" i][class*="notice" i],[class*="translation" i][class*="modal" i]';
    var textRe=/\\b(we (need|use|require) your consent|consent to load|manage (your )?cookies|cookie (settings|preferences|consent)|we use cookies|privacy settings|third-party service to translate|accept and continue|by clicking accept)\\b/i;
    function isOverlay(el){var s=getComputedStyle(el);return (s.position==='fixed'||s.position==='absolute')&&el.offsetWidth>200&&el.offsetHeight>100;}
    function nuke(){
      document.querySelectorAll(idSel).forEach(function(n){n.remove();});
      // Text-based scan — walk visible fixed/absolute containers only
      document.querySelectorAll('div,section,aside,dialog').forEach(function(el){
        if(!el.isConnected)return;
        if(!isOverlay(el))return;
        var txt=(el.textContent||'').slice(0,600);
        if(textRe.test(txt))el.remove();
      });
      // Body/html scroll-lock cleanup
      ['klaro','no-scroll','modal-open','cookie-open','overflow-hidden'].forEach(function(c){
        document.body.classList.remove(c);document.documentElement.classList.remove(c);
      });
      if(document.body.style.overflow==='hidden')document.body.style.overflow='';
      if(document.documentElement.style.overflow==='hidden')document.documentElement.style.overflow='';
    }
    nuke();
    if(window.MutationObserver){
      var mo=new MutationObserver(function(){nuke();});
      mo.observe(document.documentElement,{childList:true,subtree:true});
      // Second sweep after 500ms for JS-injected banners on delay
      setTimeout(nuke,500);setTimeout(nuke,1500);
    }
  }catch(e){}})();`

  files.push({ path: 'script.js', content: `// ForgeAI rebuild — cookie scrub + scroll reveal + mobile menu\n${cookieScrub}\n${reveal}\n${MOBILE_MENU_JS}\n` })

  ensureViewport(files)
  const styles = files.find((f) => f.path === 'styles.css')!

  // Deterministic layout-bug guard — three visible failure modes that broke
  // the last rebuild (cookie banner over hero, floating dropdown panel, empty
  // icon circles). Force known-good positioning regardless of Claude's CSS.
  const layoutFixes = `
/* ── ForgeAI layout-bug safety net (always overrides Claude's positioning) ── */

/* Cookie / consent / privacy modals — we stripped every tracking script from
   the rebuild, so no consent is needed AND their close-button JS no longer
   exists. Hide them entirely; anything that slipped past the HTML sanitizer
   would otherwise sit stuck open blocking the page forever. */
[id*="cookie" i], [class*="cookie" i],
[id*="consent" i], [class*="consent" i],
[id*="gdpr" i],   [class*="gdpr" i],
[id*="cmp" i],    [class*="cmp-banner" i],
[id*="klaro" i],  [class*="klaro" i],
[id*="privacy-settings" i], [class*="privacy-settings" i],
[id*="cookiebot" i], [id*="onetrust" i], [id*="iubenda" i],
#CybotCookiebotDialog, #onetrust-consent-sdk, #tarteaucitron, #cookieyes {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
/* And whatever body-lock class those modals set to disable scroll */
body.klaro, body.no-scroll, body.modal-open, body.cookie-open,
html.klaro, html.no-scroll, html.modal-open {
  overflow: auto !important;
  position: static !important;
}

/* Dropdown / submenu panels — anchor to their parent nav item, hide by default */
.nav li, nav li, .menu li, .navbar li,
.nav-item, .eg-navli, .eg-dropdown, .has-dropdown, .has-submenu {
  position: relative !important;
}
.dropdown-menu, .submenu, .sub-menu, .mega-menu, .eg-sub, .nav-sub, .dropdown {
  position: absolute !important;
  top: 100% !important; left: 0 !important;
  min-width: 200px !important;
  opacity: 0; visibility: hidden;
  transition: opacity .15s ease, visibility .15s ease;
  z-index: 100;
}
.nav li:hover > .dropdown-menu, .nav li:hover > .submenu, .nav li:hover > .sub-menu,
.nav li:hover > .eg-sub, .nav li:hover > .dropdown,
.eg-dropdown:hover > .eg-sub, .has-dropdown:hover > .dropdown-menu,
li:focus-within > .dropdown-menu, li:focus-within > .submenu,
li:focus-within > .eg-sub, li:focus-within > .dropdown {
  opacity: 1; visibility: visible;
}

/* Icon-only spans whose icon font was stripped render as empty circles.
   Hide any element that has ONLY icon-library classes (no text, no children). */
i:empty[class*="fa-"], i:empty[class*="glyphicon"], i:empty[class*="icon-"],
span:empty[class*="fa-"], span:empty[class*="glyphicon"], span:empty[class*="icon-"] {
  display: none !important;
}
`

  // Deterministic safety net — the rescue and mobile menu CSS always apply,
  // scoped inside @media queries so they can never fight Claude's desktop rules.
  styles.content += `\n${revealCss}\n${layoutFixes}\n${RESPONSIVE_RESCUE_CSS}\n${MOBILE_MENU_CSS}\n${HAMBURGER_CSS}\n${FINAL_FIXES_CSS}`

  enhancements.push(
    `Preserved every page's HTML structure, content, and image positions (${pages.length} page(s), ${imageMap.size} image(s))`,
    'Threw away the original stylesheet(s) entirely — Claude wrote a completely new one from scratch, matched to this brand\'s register',
    'Professional design tuned to the brand — restrained palette, real type scale, subtle depth, no gratuitous flourishes',
    'Fully responsive: mobile-first @media queries plus a deterministic 820px safety net so phones can never render a shrunken desktop',
    'Layout-bug guard: cookie banners anchor to the bottom, dropdown panels stay attached to their nav item, orphaned icon fonts are hidden',
    'Added scroll-reveal animation and a mobile hamburger menu',
    'Removed analytics/tracking scripts from the delivered copy',
  )

  return {
    files,
    summary: `Rebuilt ${pages.length} page(s) from ${importUrl} — original HTML/content kept, Claude wrote a completely new stylesheet.`,
    audit,
    enhancements,
  }
}

// ═══ MERN BUILDER ══════════════════════════════════════════
// Full-stack generation: a deterministic scaffold for everything that must
// be exactly right (package.json files, Vite config, server entry, wiring —
// nothing the model can hallucinate wrong), plus AI-generated creative files
// (Mongoose models, Express routes, React pages). The stylesheet is written
// LAST, after every component exists — same ordering rule as static sites.

const MERN_SYSTEM_PROMPT = `You are ForgeAI Builder, an elite full-stack MERN engineer (MongoDB + Mongoose, Express, React 18 + Vite + react-router-dom v6, Node). You are asked for ONE file at a time — each reply contains exactly the requested file, complete.

RULES:
- JavaScript only, no TypeScript. React function components with hooks. The server uses CommonJS (require/module.exports); the client uses ES modules.
- JSX ATTRIBUTE QUOTING: NEVER use backslash-escaped quotes inside a double-quoted JSX attribute — e.g. value="36.5\"" is INVALID JSX and crashes the build. If an attribute value contains a double-quote character (like inch marks), use single quotes: value='36.5"'. This is a hard esbuild parse error.
- The client calls the API with axios at RELATIVE paths ("/api/…") — never hardcode a host.
- Server code is defensive: validate input, ALWAYS wrap every async route handler in try/catch and call next(err) on failure — example: router.get('/', async (req,res,next)=>{ try{ const docs=await Model.find(); res.json(docs) }catch(e){ next(e) } }). Return proper status codes (400 validation, 404 not found, 500 server error), never crash on bad data.
- MONGOOSE UNIQUE INDEXES — CRITICAL: NEVER use \`unique: true\` alone on an optional field (one without \`required: true\`). Optional unique fields MUST also have \`sparse: true\` — e.g. \`sku: { type: String, unique: true, sparse: true }\`. Without \`sparse: true\`, every document that omits the field stores \`null\`, and the second insert crashes with "E11000 duplicate key error … dup key: { field: null }". Only \`slug\` and similar required identifiers are safe with \`unique: true\` alone.
- API RESPONSE SHAPE — CRITICAL: GET / (list route) MUST return a plain JSON array — e.g. res.json(docs). NEVER return a paginated wrapper like res.json({ items: docs, total: N }) or res.json({ products: docs, totalCount: N }). The frontend does docs.map(...) directly — a wrapped object crashes every page with "TypeError: x.map is not a function".
- AUTH RULES — CRITICAL: GET / GET /:id / POST / are always PUBLIC (no requireAdmin). PUT /:id is also PUBLIC — users update their own cart, booking or form without an admin token. ONLY router.delete('/:id') requires requireAdmin. NEVER put requireAdmin on GET, POST, or PUT routes.
- IMAGES FIELD IS AN ARRAY — CRITICAL: Mongoose stores \`images\` as \`[String]\` (an array of URLs). NEVER call \`.split(',')\` on it — it is NOT a string. To show one image: \`src={(Array.isArray(item.images) ? item.images[0] : item.images) || fallbackUrl}\`. To build a gallery: \`(item.images || []).map(...)\`. When sending a single image URL to an API (e.g. cart payload): \`image: Array.isArray(product.images) ? product.images[0] : product.images\`. Violating this crashes the page with "TypeError: x.split is not a function" or shows "[object Array]" as the src.
- Client code is defensive too: in JSX, NEVER call methods on possibly-missing API fields — write (user.bio || '').slice(0, 60), items?.map, value ?? fallback. Missing data must never crash a render. When an API call fails (catch block), set an error state and render a visible error message — NEVER silently swallow errors or leave the user staring at an empty/blank section. Example: catch(e){ setError(e.response?.data?.error || 'Failed to load data. Please check your connection.') }.
- main.jsx already renders <App /> inside <BrowserRouter>. NEVER import or render BrowserRouter/Router yourself — a nested router crashes React at runtime. Use only Routes, Route, NavLink, Link, useParams, useNavigate.
- UI COMPONENTS — src/components/ui.jsx is already written and exports EXACTLY these named exports (import only from this list — nothing else exists there): toast, Button, Card, Spinner, Badge, Alert, Input, Textarea, Modal, Stat, EmptyState, PageHeader, Table, Tabs. Import pattern: \`import { Button, Spinner, EmptyState } from '../components/ui'\`. NEVER import a name not in this list — it will crash the build with "X is not exported". NEVER generate or overwrite src/components/ui.jsx — it is deterministic and generated by the platform.
- HOOKS RULES (critical — breaking these crashes the WHOLE app with "Invalid hook call" / "Cannot read properties of null (reading 'useEffect')"): call hooks (useState, useEffect, useRef, useContext, useNavigate, useParams, custom hooks) ONLY at the top level of a React component function — NEVER at module scope / top of the file, NEVER conditionally, NEVER inside loops or ordinary non-component functions. In EVERY file that uses hooks, import them explicitly, e.g. import { useState, useEffect } from 'react'. Component names must be PascalCase and must return JSX.
- STYLING — READ CAREFULLY: there is NO Tailwind here. NEVER write utility classes like "flex", "grid", "p-6", "px-4", "mx-auto", "gap-4", "text-lg", "text-center", "font-bold", "bg-white", "rounded-xl", "shadow-md", "max-w-6xl", "md:flex". They render COMPLETELY UNSTYLED. Instead, a global DESIGN SYSTEM is already loaded that styles this exact class VOCABULARY — build your markup out of it so it looks polished with zero extra CSS:
  ⚠️ THIS IS REACT JSX — ALWAYS use className="..." not class="...". Using class= silently breaks ALL styling. Every single element must use className.
  • Layout: wrap page content in <div className="container">; group sections as <section className="section">…; use "grid grid-2 | grid-3 | grid-4" for card rows; center intros with className="section-head".
  • Hero (landing): <section className="hero"><img className="hero-bg" src="https://picsum.photos/seed/hero1/1600/900" alt=""/><div className="container"> <span className="eyebrow">…</span> <h1>… use <span className="gradient-text">ONE accent word</span> (never the whole headline — it must stay high-contrast/legible)</h1> <p className="hero-subtitle">…</p> <div className="hero-actions"><a className="btn-primary">…</a><a className="btn-secondary">…</a></div> </div></section>
  • Buttons: className="btn-primary" / "btn-secondary" / "btn-ghost" (on <a> or <button>).
  • Cards & content: className="card" or "feature-card" (with className="feature-icon"), "stats"+"stat-value"/"stat-label", "step"+"step-num", "testimonial", "badge", "card-elevated" for highlighted plans.
  • Filtering: className="filter-bar" wrapping buttons — add className="active" on the selected one.
  • Media: className="gallery-grid" + "gallery-item" for image grids. Gallery structure: <div className="gallery-item"><img src="..." alt=""/><div className="gallery-overlay"><span>caption</span></div></div>. NEVER add a flat dark overlay — it makes images look black. The overlay is subtle (bottom-fade, hover-only). className="aspect-hero" for 16:9 embeds. className="avatar" for circular profile photos.
  • GALLERY GRID COUNT: use even numbers of items (4, 6, 8) to prevent an orphaned last item. If odd items, give the last one className="gallery-item" style={{gridColumn:'span 2'}}.
  • TEXT CONTRAST: On light-background sections (bg, surface, white), ALWAYS use className with var(--text) coloring — never write inline style={{color:'white'}} or style={{color:'#fff'}} unless the parent has a dark background. White text on cream = invisible.
  • Feature splits: use a "grid grid-2" with an image + text column.
  • Loading: inline spinner/skeleton with inline style while data is fetching — replace with real content when loaded.
  • Feedback: className="alert alert-success" / "alert-error" / "alert-info" for inline messages.
  • CTA sections: wrap in <div className="cta-section"> for a gradient call-to-action block.
  • Reveal: add className="animate-in" to sections/cards — the design system animates them in.
  • Nav lives in <header> with a className="nav-logo" and a <nav> of links (add className="active" on the current one). Footer is <footer className="footer"> with className="footer-grid" inside.
  You MAY add extra semantic classNames for page-specific bits (the stylesheet covers them too), but ALWAYS build on this vocabulary — never bare unstyled <div>s for structural things.
- QUALITY BAR: the UI must look like a designer built it (Linear/Stripe/Vercel/Lovable tier), never "AI-generated filler". Follow the DESIGN BRIEF you are given EXACTLY — its palette, fonts, type scale, spacing, and motifs — and never fall back to a generic default (never violet #8b5cf6 on slate #0f172a unless the brief says so). Big confident headings with a clamp() type scale; DEPTH via layered shadows, subtle gradients / soft mesh hero backdrop, and 1px translucent card borders; generous section padding and a max-width content column; smooth ~180ms hover/focus micro-interactions on every interactive element; a sticky nav that has BOTH a semi-opaque --bg background (~82% opacity) AND backdrop-blur (a blurred nav with no background lets content smear through it — always give it the background). CONTRAST IS NON-NEGOTIABLE — the hero headline must read with strong contrast against its background; use gradient-text on AT MOST one accent word (never the whole headline), and never let words fade into the background. No heavy text-shadow/glow that ghosts the text. MEDIA — the site must be MEDIA-RICH, everything loaded from the web with URLs that ALWAYS resolve. If the DESIGN BRIEF includes a PHOTO LIBRARY, use THOSE exact URLs for real photos (they are topical + always load); otherwise use high-quality photos via https://picsum.photos/seed/{seed}/{w}/{h} where {seed} is a short UNIQUE word+number per image (e.g. hero1, feature2, gallery3) so each image is distinct and STABLE (sizes hero/showcase ≥ 1200 wide, cards ≥ 600 wide), avatars via https://i.pravatar.cc/300?img={n}. The LANDING hero MUST START with a full-bleed background image — <img className="hero-bg" src="https://picsum.photos/seed/hero1/1600/900" alt=""/> as the FIRST child of <section className="hero"> — UNLESS the request explicitly says no hero image. Put PLENTY of images across every page (feature/gallery/showcase/testimonial sections). Include at least one VIDEO from the web: a relevant YouTube embed inside <div className="video-embed"><iframe src="https://www.youtube.com/embed/VIDEO_ID" allowfullscreen></iframe></div>, or a muted autoplay looping <video className="hero-bg" autoPlay muted loop playsInline/>. Present images cleanly (object-fit: cover, rounded corners) — NEVER rotate/tilt/skew/overlap them. Explicit width/height + descriptive alt on every <img>. Never reference local files that don't exist.
- DYNAMIC & ANIMATED: make the app feel alive — entrance/scroll-reveal animations, hover/focus micro-interactions, and loading states (a spinner or skeleton placeholders) while data is fetching. A page loader is shown until the app mounts. Lively, never static.
- FOLLOW CATEGORY CONVENTIONS: build the sections, layout, and structure that best-in-class REAL sites in this site's CATEGORY use — the DESIGN BRIEF's REFERENCE names the category and its conventions. A hotel must feel like a hotel site (rooms, amenities, gallery, offers, location), a restaurant like a restaurant site (menu, reservations, gallery), etc. — not a generic template.
- SUBSTANCE & DENSITY: build RICH, full pages — never thin one-section pages. Every major page MUST have 6–8 distinct sections. Landing/Home: hero → stats/social-proof → feature highlights (3-col grid) → how-it-works (step-row) → gallery or showcase → testimonials → CTA banner → footer. Listing pages: filter-bar + category-btn chips → grid of cards → pagination. Detail/single-item pages: hero image → key details + action button → description → related items grid. Form/booking pages: a prominent booking-card search bar → results → booking confirmation. Each section must have a real eyebrow label, a strong h2, a sub-paragraph, and the appropriate visual treatment. Pages that match what Lovable would build — never sparse.
- No placeholders, no "...", no TODOs — complete working code only.
- ONLY import from packages that exist in client/package.json: react, react-dom, react-router-dom, axios. NEVER import "framer-motion", "react-icons", "react-serif", "styled-components", "chakra-ui", "@mui/material", "date-fns", "lodash", or ANY other npm package — they are NOT installed and will crash the build. All styling is done via CSS classes; all utilities are written inline.
- In CSS files, ALL @import rules (e.g. Google Fonts @import url(...)) MUST be the very first lines of the file — before any :root, *, or other rules. An @import after any other CSS rule is invalid and fails the build.

Return ONLY the requested file, in exactly this format:
<file path="relative/path">
content
</file>`

interface MernPlan {
  summary: string
  models: { name: string; fields: { name: string; type: string }[] }[]
  pages: { file: string; route: string; purpose: string }[]
}

/** Heuristic: does this JSX lean on Tailwind/utility classes? The MERN scaffold
 *  ships NO Tailwind, so utility classes render unstyled — the #1 cause of ugly
 *  MERN pages. Semantic-class components score ~0 here. */
function looksTailwind(jsx: string): boolean {
  const tokens = [...jsx.matchAll(/className="([^"]+)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter(Boolean)
  if (tokens.length < 6) return false
  const util =
    /^(?:(?:sm|md|lg|xl|2xl|hover|focus|active|group-hover|dark)?:)?(?:(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|min-w|max-w|min-h|max-h|gap|space-x|space-y|text|font|leading|tracking|bg|from|via|to|border|rounded|shadow|ring|opacity|z|top|left|right|bottom|inset|col|row|grid-cols|grid-rows|basis|flex|divide)-[a-z0-9.\/\[\]#-]+|flex|grid|hidden|block|inline|inline-block|inline-flex|container|relative|absolute|fixed|sticky|truncate|uppercase|lowercase|capitalize|italic|underline|antialiased|items-center|items-start|items-end|justify-center|justify-between|justify-around|justify-end|self-center|overflow-hidden|overflow-auto|cursor-pointer|mx-auto)$/
  const hits = tokens.filter((t) => util.test(t)).length
  return hits >= 6 || hits / tokens.length > 0.3
}

/** Fix JSX attribute quoting bugs the AI commonly produces:
 *  1. Backslash-escaped quotes inside double-quoted attributes: value="36.5\""
 *     → convert to single-quoted: value='36.5"'
 *  2. Unescaped < or > inside JSX attribute string values (rare but fatal)
 *  These cause a hard esbuild parse error and a failed Render deploy. */
function sanitizeJsx(src: string): string {
  // Replace value="...\""  →  value='..."'
  // Matches any JSX attribute whose double-quoted value contains \" anywhere
  return src.replace(/(\w[\w-]*)="([^"]*\\"[^"]*)"/g, (_match, attr, val) => {
    // Unescape the backslash-escaped quotes, then wrap in single quotes
    const fixed = val.replace(/\\"/g, '"')
    // If the value itself contains single quotes we can't use them — use &quot; instead
    if (fixed.includes("'")) {
      return `${attr}="${fixed.replace(/"/g, '&quot;')}"`
    }
    return `${attr}='${fixed}'`
  })
}

// Default pages used to pad a plan up to the >= 4-page floor. PascalCase files
// (matching the plan's file regex) at conventional routes.
const MERN_FALLBACK_PAGES = [
  { file: 'About.jsx', route: '/about', purpose: 'About the project — mission, story, and team' },
  { file: 'Services.jsx', route: '/services', purpose: 'The key features or services offered' },
  { file: 'Contact.jsx', route: '/contact', purpose: 'A contact form and contact details' },
  { file: 'Gallery.jsx', route: '/gallery', purpose: 'A showcase or gallery of the content' },
  { file: 'Pricing.jsx', route: '/pricing', purpose: 'Pricing tiers or plans' },
  { file: 'Faq.jsx', route: '/faq', purpose: 'Frequently asked questions' },
]

/** Guarantee at least 4 pages, padding from the fallback pool without dupes. */
function padMernPages(pages: { file: string; route: string; purpose: string }[]) {
  const routes = new Set(pages.map((p) => p.route.toLowerCase()))
  const files = new Set(pages.map((p) => p.file.toLowerCase()))
  for (const d of MERN_FALLBACK_PAGES) {
    if (pages.length >= 4) break
    if (routes.has(d.route.toLowerCase()) || files.has(d.file.toLowerCase())) continue
    pages.push(d)
    routes.add(d.route.toLowerCase())
    files.add(d.file.toLowerCase())
  }
  return pages
}

function sanitizeMernPlan(raw: any): MernPlan | null {
  const models = (Array.isArray(raw?.models) ? raw.models : []).slice(0, 3)
    .map((m: any) => ({
      name: String(m?.name ?? '').replace(/[^A-Za-z]/g, '').replace(/^./, (c: string) => c.toUpperCase()),
      fields: (Array.isArray(m?.fields) ? m.fields : []).slice(0, 12)
        .map((f: any) => ({
          name: String(f?.name ?? '').replace(/[^A-Za-z0-9_]/g, ''),
          type: ['String', 'Number', 'Boolean', 'Date'].includes(f?.type) ? f.type : 'String',
        }))
        .filter((f: any) => f.name),
    }))
    .filter((m: any) => m.name && m.fields.length)
  let pages = (Array.isArray(raw?.pages) ? raw.pages : [])
    .map((p: any) => ({
      file: String(p?.file ?? ''),
      route: String(p?.route ?? '/'),
      purpose: String(p?.purpose ?? '').slice(0, 200),
    }))
    .filter((p: any) => /^[A-Z][A-Za-z0-9]*\.jsx$/.test(p.file))
  // Always have a landing page at "/", then guarantee at least 4 pages total.
  if (!pages.some((p: any) => p.route === '/')) {
    pages.unshift({ file: 'Home.jsx', route: '/', purpose: 'Landing page that introduces the app' })
  }
  pages = padMernPages(pages).slice(0, 6)
  if (!models.length || !pages.length) return null
  return { summary: String(raw?.summary ?? 'A full-stack MERN application.').slice(0, 300), models, pages }
}

async function planMernSite(provider: AIProvider, prompt: string, brief?: string, enhancer?: AIProvider | null): Promise<MernPlan> {
  // Extract Pages & Data Models from PRD — handle numbered headings like "## 3. Data Models (MERN Stack)"
  const prdPagesSection = brief
    ? (brief.match(/##\s*(?:\d+\.\s*)?Pages(?:\s*\([^)]*\))?[\s\S]*?(?=##\s*(?:\d+\.\s*)?(?:Brand|User|Data|Copy|Seo|Suc)|═══|$)/i)?.[0] ?? '').slice(0, 1200)
    : ''
  const prdModelsSection = brief
    ? (brief.match(/##\s*(?:\d+\.\s*)?Data Models(?:\s*\([^)]*\))?[\s\S]*?(?=##\s*(?:\d+\.\s*)?(?:Brand|User|Pages|Copy|Seo|Suc)|═══|$)/i)?.[0] ?? '').slice(0, 800)
    : ''

  // Parse explicit model names from the PRD (e.g. "### `Topic` Schema" or "### Topic")
  const prdModelNames: string[] = []
  if (prdModelsSection) {
    const nameRe = /###\s+`?([A-Z][A-Za-z0-9]+)`?/g
    let m: RegExpExecArray | null
    while ((m = nameRe.exec(prdModelsSection)) !== null) {
      prdModelNames.push(m[1])
    }
  }

  const mandatoryModels = prdModelNames.length
    ? `\n\nCRITICAL — use EXACTLY these model names from the PRD (no renaming, no substitutions): ${prdModelNames.join(', ')}.`
    : ''

  const conventions = (prdPagesSection || prdModelsSection)
    ? `\n\nCONTENT PLAN (use these pages and models exactly — don't invent new ones):\n${prdModelsSection}\n${prdPagesSection}${mandatoryModels}`
    : brief
      ? `\n\nMatch this site's CATEGORY CONVENTIONS:\n${brief.slice(0, 800)}`
      : ''

  const planPrompt = `Design a MERN web app for this request:\n\n${prompt}${conventions}\n\nReply with ONLY one JSON object — no prose, no markdown fences:\n{"summary":"one sentence","models":[{"name":"PascalCase","fields":[{"name":"camelCase","type":"String"}]}],"pages":[{"file":"Home.jsx","route":"/","purpose":"what the page shows and does"}]}\nField types: String | Number | Boolean | Date. Limits: 1-3 models, 4-6 pages. Always include Home.jsx at route "/".`

  const tryPlan = async (p: AIProvider): Promise<MernPlan | null> => {
    try {
      const res = await chatWithContinuation(p, [{ role: 'user', content: planPrompt }], MERN_SYSTEM_PROMPT)
      const text = stripCodeFence(res.content.trim())
      const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
      return sanitizeMernPlan(JSON.parse(jsonText))
    } catch { return null }
  }

  // Planning is a reasoning task — try Claude first, fall back to Gemini
  const plan = (enhancer ? await tryPlan(enhancer) : null) ?? await tryPlan(provider)
  if (plan) return plan

  // Hard fallback — at least use the user's prompt to guess the model name
  const guessedModel = (prompt.match(/\b([A-Z][a-z]+(?:ing|ion|ment|er|ee)?)\b/)?.[1]) ?? 'Item'
  return {
    summary: 'A full-stack MERN application.',
    models: [{ name: guessedModel, fields: [{ name: 'title', type: 'String' }, { name: 'description', type: 'String' }, { name: 'status', type: 'String' }] }],
    pages: [
      { file: 'Home.jsx', route: '/', purpose: 'Landing page introducing the app' },
      { file: 'About.jsx', route: '/about', purpose: 'About the project — mission and story' },
      { file: 'Services.jsx', route: '/services', purpose: 'Key features or services offered' },
      { file: 'Contact.jsx', route: '/contact', purpose: 'Contact form and details' },
    ],
  }
}

/** Config/entry files that must be exactly right — written by code, not AI. */
function mernScaffoldConfigs(siteName: string, plan: MernPlan): ParsedChange[] {
  const rootPkg = {
    name: siteName,
    private: true,
    engines: { node: '>=18' },
    scripts: {
      start: 'node server/index.js',
      dev: 'node server/index.js',
      build: 'npm --prefix client install && npm --prefix client run build',
    },
    dependencies: { cors: '^2.8.5', dotenv: '^16.4.5', express: '^4.19.2', jsonwebtoken: '^9.0.2', mongoose: '^8.4.0' },
  }
  const clientPkg = {
    name: `${siteName}-client`,
    private: true,
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    // Vite + the React plugin are build tools, but they live in `dependencies`
    // (NOT devDependencies) on purpose: hosts like Render build with
    // NODE_ENV=production / --omit=dev, which SKIPS devDependencies — that makes
    // `vite build` fail ("vite: not found"), so no client/dist is produced and
    // the server serves no assets (CSS as text/plain, JS 404). Keeping them here
    // guarantees the client builds regardless of the install mode.
    dependencies: {
      axios: '^1.7.2', react: '^18.3.1', 'react-dom': '^18.3.1', 'react-router-dom': '^6.23.1',
      vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.1',
    },
  }
  const viteConfig = [
    "import { defineConfig } from 'vite'",
    "import react from '@vitejs/plugin-react'",
    '',
    'export default defineConfig({',
    '  plugins: [react()],',
    "  // Force a SINGLE React instance — prevents 'Invalid hook call' /",
    "  // 'Cannot read properties of null (reading useEffect)' from a duplicate React copy.",
    "  resolve: { dedupe: ['react', 'react-dom'] },",
    "  server: { proxy: { '/api': 'http://localhost:4000' } },",
    '})',
    '',
  ].join('\n')
  const indexHtml = [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${siteName}</title>`,
    '    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>" />',
    '    <link rel="preconnect" href="https://fonts.googleapis.com" />',
    '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    '    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&family=Poppins:wght@400;500;600;700&family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />',
    '  </head>',
    '  <body>',
    '    <div id="root"><div class="app-loading"><div class="spinner"></div></div></div>',
    '    <script type="module" src="/src/main.jsx"></script>',
    `    <script>${HAMBURGER_JS}</script>`,
    '  </body>',
    '</html>',
    '',
  ].join('\n')
  const mainJsx = [
    "import React from 'react'",
    "import ReactDOM from 'react-dom/client'",
    "import { BrowserRouter } from 'react-router-dom'",
    "import App from './App.jsx'",
    "import './index.css'",
    '',
    "ReactDOM.createRoot(document.getElementById('root')).render(",
    '  <React.StrictMode>',
    '    <BrowserRouter>',
    '      <App />',
    '    </BrowserRouter>',
    '  </React.StrictMode>,',
    ')',
    '',
    '// Scroll-reveal: add .visible to .reveal elements when they enter the viewport',
    "const observer = new IntersectionObserver((entries) => {",
    "  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } })",
    "}, { threshold: 0.12 })",
    "const wire = () => document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))",
    "wire()",
    "// Re-wire after React renders new pages",
    "const _mo = new MutationObserver(wire)",
    "_mo.observe(document.getElementById('root'), { childList: true, subtree: true })",
    '',
  ].join('\n')
  const gitignore = ['node_modules/', 'client/node_modules/', 'client/dist/', '.env', ''].join('\n')
  const envExample = [
    '# MongoDB connection string — local MongoDB or a free Atlas cluster.',
    '# Without it the site still loads, but API routes return errors.',
    `MONGODB_URI=mongodb://localhost:27017/${siteName}`,
    'PORT=4000',
    '',
  ].join('\n')
  const readme = [
    `# ${siteName}`,
    '',
    plan.summary,
    '',
    'Built with ForgeAI Builder — MERN stack (MongoDB, Express, React + Vite, Node).',
    '',
    '## Run locally',
    '',
    '```bash',
    'npm install        # server dependencies',
    'npm run build      # installs client deps and builds the React app',
    'npm start          # serves the API + built client on http://localhost:4000',
    '```',
    '',
    'For live-reload frontend development, also run the Vite dev server:',
    '',
    '```bash',
    'npm --prefix client run dev    # http://localhost:5173 (proxies /api to :4000)',
    '```',
    '',
    '## Database',
    '',
    'Copy `.env.example` to `.env` and set `MONGODB_URI` (a free MongoDB Atlas cluster works).',
    'The site loads without a database, but API routes need one.',
    '',
    '## Deploy',
    '',
    'Any Node host works. On Render: build command `npm install && npm run build`,',
    'start command `npm start`, and set `MONGODB_URI` in the environment settings.',
    '',
  ].join('\n')

  // Known-good Dockerfile shipped with EVERY MERN build so deploys are
  // deterministic: the client is always built with its full toolchain (so
  // client/dist always exists), and the Express server serves those assets with
  // correct MIME types. Without this, hosts fall back to their own Node build,
  // which frequently fails to produce client/dist — the app then serves CSS as
  // text/plain and 404s the JS. The multi-stage build keeps the final image slim.
  const dockerfile = [
    '# ForgeAI MERN app — build the Vite client, then run the Express server.',
    'FROM node:20-alpine AS client-build',
    'WORKDIR /app',
    'COPY client/package.json ./client/',
    'RUN npm install --prefix client',
    'COPY client ./client',
    'RUN npm run build --prefix client',
    '',
    'FROM node:20-alpine',
    'WORKDIR /app',
    'ENV NODE_ENV=production',
    'COPY package.json ./',
    'RUN npm install --omit=dev',
    'COPY server ./server',
    'COPY --from=client-build /app/client/dist ./client/dist',
    'EXPOSE 4000',
    'CMD ["node", "server/index.js"]',
    '',
  ].join('\n')
  const dockerignore = ['node_modules', 'client/node_modules', 'client/dist', '.git', '.env', ''].join('\n')

  // Deterministic ui.jsx — every named export that AI pages commonly import.
  // Generated here so it is always complete and never left to the AI, which
  // reliably forgets toast / Card / Badge and breaks the Vite build.
  const uiJsx = `import React from 'react'

function _showToast(message, type = 'info') {
  if (typeof document === 'undefined') return
  const colors = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#374151' }
  const el = document.createElement('div')
  el.textContent = message
  el.style.cssText = \`position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;border-radius:10px;color:#fff;font-size:14px;font-weight:500;background:\${colors[type]||colors.info};box-shadow:0 4px 16px rgba(0,0,0,.18);transition:opacity .3s;\`
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300) }, 3000)
}
export const toast = Object.assign(
  (message, type) => _showToast(message, type),
  { success: (m) => _showToast(m, 'success'), error: (m) => _showToast(m, 'error'), warning: (m) => _showToast(m, 'warning'), info: (m) => _showToast(m, 'info') }
)

export function Button({ children, onClick, type = 'button', variant = 'primary', disabled = false, className = '', ...props }) {
  const cls = variant === 'secondary' ? 'btn-secondary' : variant === 'ghost' ? 'btn-ghost' : 'btn-primary'
  return <button type={type} onClick={onClick} disabled={disabled} className={\`\${cls} \${className}\`} style={{ opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }} {...props}>{children}</button>
}

export function Card({ children, className = '', style = {}, ...props }) {
  return <div className={\`card \${className}\`} style={{ background: 'var(--surface,#fff)', border: '1px solid var(--border,rgba(0,0,0,.08))', borderRadius: '12px', padding: '24px', ...style }} {...props}>{children}</div>
}

export function Spinner({ className = '', ...props }) {
  return (
    <div className={\`spinner-container \${className}\`} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'1rem', width:'100%' }} {...props}>
      <div style={{ width:'2.5rem', height:'2.5rem', border:'3px solid rgba(var(--primary-rgb,99,102,241),.15)', borderTopColor:'var(--primary,#6366f1)', borderRadius:'50%', animation:'spin .8s linear infinite' }} />
      <style dangerouslySetInnerHTML={{__html:'@keyframes spin{to{transform:rotate(360deg)}}'}} />
    </div>
  )
}

export function Badge({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: { background:'rgba(99,102,241,.15)', color:'#6366f1', border:'1px solid rgba(99,102,241,.3)' },
    success: { background:'rgba(34,197,94,.15)', color:'#22c55e', border:'1px solid rgba(34,197,94,.3)' },
    warning: { background:'rgba(234,179,8,.15)', color:'#eab308', border:'1px solid rgba(234,179,8,.3)' },
    secondary: { background:'rgba(100,116,139,.15)', color:'#94a3b8', border:'1px solid rgba(100,116,139,.3)' },
  }
  return <span className={\`badge \${className}\`} style={{ display:'inline-block', padding:'.25rem .6rem', fontSize:'.75rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', borderRadius:'9999px', ...(styles[variant]||styles.primary) }} {...props}>{children}</span>
}

export function Alert({ children, variant = 'error', className = '', ...props }) {
  const cls = variant === 'success' ? 'alert alert-success' : variant === 'info' ? 'alert alert-info' : 'alert alert-error'
  return <div className={\`\${cls} \${className}\`} style={{ margin:'1rem 0', padding:'1rem', borderRadius:'6px', borderLeft:'4px solid currentColor' }} {...props}>{children}</div>
}

export function Input({ className = '', style = {}, ...props }) {
  return <input className={className} style={{ width:'100%', padding:'10px 14px', border:'1px solid var(--border,rgba(0,0,0,.12))', borderRadius:'8px', fontSize:'.9375rem', background:'var(--surface,#fff)', color:'var(--text,#111)', outline:'none', ...style }} {...props} />
}

export function Textarea({ className = '', style = {}, ...props }) {
  return <textarea className={className} style={{ width:'100%', padding:'10px 14px', border:'1px solid var(--border,rgba(0,0,0,.12))', borderRadius:'8px', fontSize:'.9375rem', background:'var(--surface,#fff)', color:'var(--text,#111)', outline:'none', resize:'vertical', minHeight:'100px', ...style }} {...props} />
}

export function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="card" style={{ maxWidth:'500px', width:'90%', maxHeight:'80vh', overflowY:'auto' }} onClick={(e) => e.stopPropagation()}>
        {title && <h3 style={{ marginBottom:'1rem' }}>{title}</h3>}
        {children}
        <button className="btn-ghost" onClick={onClose} style={{ marginTop:'1rem' }}>Close</button>
      </div>
    </div>
  )
}

export function Stat({ value, label, icon, className = '' }) {
  return (
    <div className={\`stat \${className}\`} style={{ textAlign:'center', padding:'1.5rem', background:'var(--surface,#fff)', borderRadius:'12px', border:'1px solid var(--border,rgba(0,0,0,.08))' }}>
      {icon && <div style={{ fontSize:'2rem', marginBottom:'.5rem' }}>{icon}</div>}
      <div style={{ fontSize:'2.25rem', fontWeight:700, color:'var(--primary,#6366f1)', lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:'.875rem', color:'var(--muted,#64748b)', marginTop:'.35rem' }}>{label}</div>
    </div>
  )
}

export function EmptyState({ title = 'Nothing here yet', description, action, icon = '📭' }) {
  return (
    <div style={{ textAlign:'center', padding:'4rem 2rem', color:'var(--muted,#64748b)' }}>
      <div style={{ fontSize:'3rem', marginBottom:'1rem' }}>{icon}</div>
      <h3 style={{ margin:'0 0 .5rem', color:'var(--text,#111)', fontWeight:600 }}>{title}</h3>
      {description && <p style={{ margin:'0 0 1.5rem', maxWidth:'400px', marginInline:'auto' }}>{description}</p>}
      {action && <div>{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={\`page-header \${className}\`} style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem', marginBottom:'2rem' }}>
      <div>
        <h1 style={{ margin:0, fontSize:'clamp(1.5rem,3vw,2rem)', fontWeight:700 }}>{title}</h1>
        {subtitle && <p style={{ margin:'.35rem 0 0', color:'var(--muted,#64748b)' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap' }}>{actions}</div>}
    </div>
  )
}

export function Table({ columns = [], rows = [], className = '' }) {
  return (
    <div style={{ overflowX:'auto' }}>
      <table className={\`table \${className}\`} style={{ width:'100%', borderCollapse:'collapse', fontSize:'.9375rem' }}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={{ padding:'.75rem 1rem', textAlign:'left', borderBottom:'2px solid var(--border,rgba(0,0,0,.1))', fontWeight:600, color:'var(--muted,#64748b)', whiteSpace:'nowrap' }}>
                {typeof col === 'string' ? col : col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom:'1px solid var(--border,rgba(0,0,0,.06))' }}>
              {columns.map((col, ci) => (
                <td key={ci} style={{ padding:'.75rem 1rem' }}>{typeof col === 'string' ? row[col] : (col.accessor ? row[col.accessor] : row[ci])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Tabs({ tabs = [], active, onChange, className = '' }) {
  return (
    <div className={\`tabs \${className}\`} style={{ display:'flex', gap:'.25rem', borderBottom:'2px solid var(--border,rgba(0,0,0,.1))', marginBottom:'1.5rem' }}>
      {tabs.map((tab) => {
        const id = typeof tab === 'string' ? tab : tab.id
        const label = typeof tab === 'string' ? tab : tab.label
        const isActive = active === id
        return (
          <button key={id} onClick={() => onChange?.(id)}
            style={{ padding:'.6rem 1.25rem', background:'none', border:'none', borderBottom:isActive ? '2px solid var(--primary,#6366f1)' : '2px solid transparent', marginBottom:'-2px', fontWeight:isActive ? 600 : 400, color:isActive ? 'var(--primary,#6366f1)' : 'var(--muted,#64748b)', cursor:'pointer', borderRadius:'4px 4px 0 0', transition:'all .15s' }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

const UI = { toast, Button, Card, Spinner, Badge, Alert, Input, Textarea, Modal, Stat, EmptyState, PageHeader, Table, Tabs }
export default UI
`

  return [
    { path: 'package.json', content: JSON.stringify(rootPkg, null, 2) + '\n' },
    { path: 'client/package.json', content: JSON.stringify(clientPkg, null, 2) + '\n' },
    { path: 'client/vite.config.js', content: viteConfig },
    { path: 'client/index.html', content: indexHtml },
    { path: 'client/src/main.jsx', content: mainJsx },
    { path: 'client/src/components/ui.jsx', content: uiJsx },
    { path: 'Dockerfile', content: dockerfile },
    { path: '.dockerignore', content: dockerignore },
    { path: '.gitignore', content: gitignore },
    { path: '.env.example', content: envExample },
    { path: 'README.md', content: readme },
  ]
}

/** Server entry — built AFTER route generation so it only mounts files that exist. */
function mernServerEntry(siteName: string, plan: MernPlan, files: ParsedChange[], adminPassword: string): ParsedChange {
  const mounts = plan.models
    .map((m) => m.name.toLowerCase())
    .filter((lower) => files.some((f) => f.path === `server/routes/${lower}.routes.js`))
    .map((lower) => `app.use('/api/${pluralize(lower)}', require('./routes/${lower}.routes'))`)
    .join('\n')
  const content = [
    "require('dotenv').config()",
    "const path = require('path')",
    "const express = require('express')",
    "const cors = require('cors')",
    "const mongoose = require('mongoose')",
    "const jwt = require('jsonwebtoken')",
    '',
    'const app = express()',
    'app.use(cors())',
    'app.use(express.json())',
    '',
    '// ── Admin auth helpers ──────────────────────────────────────────────────────',
    "const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || 'forgeai-admin-secret-change-me'",
    `const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ${JSON.stringify(adminPassword)}`,
    '',
    'function requireAdmin(req, res, next) {',
    "  const header = req.headers.authorization || ''",
    "  const token = header.replace(/^Bearer\\s+/i, '').trim()",
    "  if (!token) return res.status(401).json({ error: 'Admin authentication required' })",
    '  try { jwt.verify(token, ADMIN_SECRET); next() }',
    "  catch { res.status(401).json({ error: 'Invalid or expired admin token' }) }",
    '}',
    '',
    "app.post('/api/admin/login', function (req, res) {",
    '  const { password } = req.body || {}',
    "  if (!password || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password.' })",
    "  const token = jwt.sign({ role: 'admin' }, ADMIN_SECRET, { expiresIn: '12h' })",
    '  res.json({ token })',
    '})',
    '',
    '// ── DB readiness guard — keeps 500s from leaking when Mongo is not connected ──',
    'function dbReady(req, res, next) {',
    '  if (mongoose.connection.readyState === 1) return next()',
    '  // Auto-reconnect if the connection dropped (e.g. seed script disconnect)',
    '  if (mongoose.connection.readyState === 0) {',
    "    mongoose.connect(process.env.MONGODB_URI || MONGODB_URI, { serverSelectionTimeoutMS: 8000 })",
    '      .then(function () { next() })',
    "      .catch(function () { res.status(503).json({ error: 'Database not connected. Set the MONGODB_URI environment variable.' }) })",
    '    return',
    '  }',
    "  res.status(503).json({ error: 'Database not connected. Set the MONGODB_URI environment variable to a valid MongoDB connection string (e.g. MongoDB Atlas) and redeploy.' })",
    '}',
    "app.use('/api', dbReady)",
    '',
    '// ── Data routes (GET+POST+PUT public; DELETE requires admin token) ────────────',
    mounts,
    '',
    '// ── Global error handler ─────────────────────────────────────────────────────',
    'app.use(function (err, req, res, _next) {',
    "  console.error('[API error]', err.message)",
    '  res.status(err.status || 500).json({ error: err.message || \'Internal server error\' })',
    '})',
    '',
    '// ── Serve the built React client ─────────────────────────────────────────────',
    "const dist = path.join(__dirname, '..', 'client', 'dist')",
    'app.use(express.static(dist))',
    "app.get('*', function (req, res, next) {",
    "  if (req.path.indexOf('/api/') === 0) return next()",
    "  res.sendFile(path.join(dist, 'index.html'))",
    "})",
    '',
    'const PORT = process.env.PORT || 4000',
    `const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/${siteName}'`,
    '',
    "mongoose.connection.on('disconnected', function () {",
    "  console.warn('[DB] connection lost — reconnecting...')",
    "  mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 }).catch(function(e){ console.error('[DB] reconnect failed:', e.message) })",
    "})",
    "",
    "mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 })",
    "  .then(function () {",
    "    console.log('MongoDB connected')",
    "    app.listen(PORT, function () { console.log('Server ready on port ' + PORT) })",
    "  })",
    '  .catch(function (err) {',
    "    console.error('MongoDB connection failed: ' + err.message)",
    "    console.error('Set MONGODB_URI to a valid MongoDB Atlas connection string.')",
    "    // Start server anyway so healthcheck / static assets still work",
    "    app.listen(PORT, function () { console.log('Server on port ' + PORT + ' (DB unavailable — API routes return 503)') })",
    '  })',
    '',
  ].join('\n')
  return { path: 'server/index.js', content }
}

/** Extract a field's constraints from its generated Mongoose model source so the
 *  admin form matches the server: a `required` flag and any `enum` value list. */
function modelFieldConstraints(src: string, field: string): { required: boolean; enumValues: string[] } {
  const block = src.match(new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*\\{([^}]*)\\}'))?.[1] ?? ''
  const enumRaw = block.match(/enum\s*:\s*\[([^\]]*)\]/)?.[1] ?? ''
  return {
    required: /required\s*:\s*true/.test(block),
    enumValues: enumRaw ? enumRaw.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [],
  }
}

/** Always-present admin panel: generic CRUD over every model, wired to the
 *  /api endpoints. Code-generated (not AI) so it is always correct, and reached
 *  ONLY at /admin — never linked from the public site navigation. Reads the
 *  generated Mongoose models so the form matches server constraints (required
 *  fields, enum dropdowns) — otherwise create/update fails with a 400. */
function mernAdminPage(plan: MernPlan, files: ParsedChange[], adminPassword: string): ParsedChange {
  const models = plan.models.map((m) => {
    const src = files.find((f) => f.path === `server/models/${m.name}.js`)?.content ?? ''
    return {
      name: m.name,
      endpoint: `/api/${pluralize(m.name.toLowerCase())}`,
      fields: m.fields.map((f) => ({ name: f.name, type: f.type, ...modelFieldConstraints(src, f.name) })),
    }
  })
  const content = `import { useState, useEffect } from 'react'
import axios from 'axios'

// ForgeAI admin panel — generic CRUD over every data model.
// Intentionally NOT linked from the public site; reach it directly at /admin.
const MODELS = ${JSON.stringify(models, null, 2)}
const TOKEN_KEY = 'forgeai_admin_token'

function authHeader() {
  const t = localStorage.getItem(TOKEN_KEY)
  return t ? { Authorization: \`Bearer \${t}\` } : {}
}

// ── Login screen ──────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.post('/api/admin/login', { password })
      localStorage.setItem(TOKEN_KEY, data.token)
      onLogin()
    } catch {
      setError('Invalid password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <section className="section">
        <form className="card admin-login-card" onSubmit={submit}>
          <h1 className="admin-login-title">Admin Access</h1>
          <label className="admin-field" style={{ display: 'block', marginBottom: 16 }}>
            <span className="admin-label">Password</span>
            <input
              className="admin-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', marginTop: 6 }}
              autoFocus
            />
          </label>
          {error && <p className="admin-error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>
      </section>
    </div>
  )
}

// ── Model manager ─────────────────────────────────────────────────────────────
function ModelManager({ model, onAuthFail }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({})
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await axios.get(model.endpoint)
      setRows(Array.isArray(data) ? data : (data.items || data.data || []))
      setError('')
    } catch (e) {
      setError('Failed to load ' + model.name + 's')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const set = (name, isBool) => (e) =>
    setForm((f) => ({ ...f, [name]: isBool ? e.target.checked : e.target.value }))

  const reset = () => { setForm({}); setEditing(null) }

  const submit = async (e) => {
    e.preventDefault()
    const payload = {}
    model.fields.forEach((f) => {
      let v = form[f.name]
      if (f.type === 'Boolean') { payload[f.name] = !!v; return }
      if (v === '' || v == null) return
      if (f.type === 'Number') { const n = Number(v); if (!Number.isNaN(n)) payload[f.name] = n; return }
      payload[f.name] = v
    })
    try {
      if (editing) await axios.put(model.endpoint + '/' + editing, payload, { headers: authHeader() })
      else await axios.post(model.endpoint, payload, { headers: authHeader() })
      reset()
      await load()
    } catch (err) {
      if (err.response?.status === 401) { onAuthFail(); return }
      const d = err.response && err.response.data
      setError((d && (d.message || d.error)) || err.message || 'Save failed — check the required fields')
    }
  }

  const edit = (row) => { setEditing(row._id); setForm(row) }

  const remove = async (id) => {
    if (!window.confirm('Delete this record?')) return
    try { await axios.delete(model.endpoint + '/' + id, { headers: authHeader() }); await load() }
    catch (err) {
      if (err.response?.status === 401) { onAuthFail(); return }
      setError('Delete failed')
    }
  }

  return (
    <section className="admin-model card">
      <h2 className="admin-model-title">{model.name}</h2>
      {error && <p className="admin-error">{error}</p>}
      <form className="admin-form" onSubmit={submit}>
        {model.fields.map((f) => (
          <label key={f.name} className="admin-field">
            <span className="admin-label">{f.name}{f.required ? ' *' : ''}</span>
            {f.enumValues && f.enumValues.length ? (
              <select className="admin-input" value={form[f.name] == null ? '' : form[f.name]} onChange={set(f.name)}>
                <option value="">— select —</option>
                {f.enumValues.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : f.type === 'Boolean' ? (
              <input type="checkbox" checked={!!form[f.name]} onChange={set(f.name, true)} />
            ) : (
              <input
                className="admin-input"
                type={f.type === 'Number' ? 'number' : f.type === 'Date' ? 'date' : 'text'}
                value={form[f.name] == null ? '' : form[f.name]}
                onChange={set(f.name)}
              />
            )}
          </label>
        ))}
        <div className="admin-actions">
          <button type="submit" className="btn btn-primary">{editing ? 'Update' : 'Create'}</button>
          {editing && (
            <button type="button" className="btn btn-secondary" onClick={reset}>Cancel</button>
          )}
        </div>
      </form>
      {loading ? (
        <p className="admin-loading">Loading…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {model.fields.map((f) => <th key={f.name}>{f.name}</th>)}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td className="admin-empty" colSpan={model.fields.length + 1}>No records yet.</td></tr>
              )}
              {rows.map((row) => (
                <tr key={row._id}>
                  {model.fields.map((f) => (
                    <td key={f.name}>
                      {typeof row[f.name] === 'boolean'
                        ? (row[f.name] ? 'Yes' : 'No')
                        : String(row[f.name] == null ? '' : row[f.name])}
                    </td>
                  ))}
                  <td className="admin-row-actions">
                    <button className="btn btn-secondary" onClick={() => edit(row)}>Edit</button>
                    <button className="btn btn-secondary" onClick={() => remove(row._id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ── Root component ────────────────────────────────────────────────────────────
function tokenValid() {
  try {
    const t = localStorage.getItem(TOKEN_KEY)
    if (!t) return false
    const payload = JSON.parse(atob(t.split('.')[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(TOKEN_KEY)
      return false
    }
    return true
  } catch { return false }
}

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(tokenValid)

  const logout = () => {
    try { localStorage.removeItem(TOKEN_KEY) } catch {}
    setLoggedIn(false)
  }

  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />

  return (
    <main className="admin container">
      <header className="admin-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Admin Panel</h1>
          <p className="admin-sub">Manage your application's data. This page is not linked from the public site.</p>
        </div>
        <button className="btn btn-secondary" onClick={logout}>Log Out</button>
      </header>
      {MODELS.map((m) => <ModelManager key={m.name} model={m} onAuthFail={logout} />)}
    </main>
  )
}
`
  return { path: 'client/src/pages/Admin.jsx', content }
}

/** A flexible auto-generated Mongoose model (strict:false accepts any fields the
 *  client sends) for an API endpoint the client called but the plan never made. */
function healModel(name: string): string {
  return [
    "const mongoose = require('mongoose');",
    '// Auto-generated to back a client API call that had no matching route.',
    `const schema = new mongoose.Schema({ name: { type: String, trim: true } }, { strict: false, timestamps: true });`,
    `module.exports = mongoose.model('${name}', schema);`,
    '',
  ].join('\n')
}

/** Proper English pluralization for model names used as API endpoint paths. */
function pluralize(word: string): string {
  const w = word.toLowerCase()
  // Irregular
  const irreg: Record<string, string> = {
    person: 'people', man: 'men', woman: 'women', child: 'children',
    tooth: 'teeth', foot: 'feet', mouse: 'mice', goose: 'geese',
  }
  if (irreg[w]) return irreg[w]
  // Already plural (ends in common plural markers)
  if (/^(quiz|bus|class|pass|glass|mass|dress|address|mess|success|press)$/.test(w)) return w + 'zes'.slice(w.endsWith('z') ? 0 : 1)
  if (/[aeiou]z$/.test(w)) return w + 'zes'
  if (/z$/.test(w)) return w + 'zes'
  if (/[sxz]$/.test(w) || /[cs]h$/.test(w)) return w + 'es'
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies'
  if (/fe?$/.test(w)) return w.replace(/fe?$/, 'ves')
  return w + 's'
}

/** Return candidates for ep by stripping/adding common plural suffixes. */
function pluralVariants(ep: string): string[] {
  const v = new Set<string>()
  // singular → plural
  v.add(ep + 's')
  v.add(ep + 'es')
  if (ep.endsWith('y')) v.add(ep.slice(0, -1) + 'ies')
  // plural → singular
  if (ep.endsWith('ies')) v.add(ep.slice(0, -3) + 'y')
  if (ep.endsWith('es') && ep.length > 3) v.add(ep.slice(0, -2))
  if (ep.endsWith('s') && ep.length > 2) v.add(ep.slice(0, -1))
  v.delete(ep)
  return [...v]
}

/** Generic CRUD Express router mounted at the exact endpoint the client calls. */
function healRoute(name: string): string {
  const N = name
  return [
    "const express = require('express');",
    `const ${N} = require('../models/${N}');`,
    "const jwt = require('jsonwebtoken');",
    'const router = express.Router();',
    '',
    'function requireAdmin(req, res, next) {',
    "  const h = req.headers.authorization || ''; const t = h.replace(/^Bearer\\s+/i, '').trim();",
    "  if (!t) return res.status(401).json({ error: 'Admin authentication required' });",
    "  try { jwt.verify(t, process.env.ADMIN_JWT_SECRET || 'forgeai-admin-secret-change-me'); next(); }",
    "  catch { res.status(401).json({ error: 'Invalid or expired admin token' }); }",
    '}',
    '',
    `router.get('/', async (req, res) => { try { res.json(await ${N}.find().sort('-createdAt')); } catch (e) { res.status(500).json({ error: 'Failed to fetch.' }); } });`,
    `router.get('/:id', async (req, res) => { try { const doc = await ${N}.findById(req.params.id); if (!doc) return res.status(404).json({ error: 'Not found.' }); res.json(doc); } catch (e) { res.status(404).json({ error: 'Not found.' }); } });`,
    `router.post('/', async (req, res) => { try { res.status(201).json(await ${N}.create(req.body)); } catch (e) { res.status(400).json({ error: e.message }); } });`,
    `router.put('/:id', async (req, res) => { try { const doc = await ${N}.findByIdAndUpdate(req.params.id, req.body, { new: true }); if (!doc) return res.status(404).json({ error: 'Not found.' }); res.json(doc); } catch (e) { res.status(400).json({ error: e.message }); } });`,
    `router.delete('/:id', requireAdmin, async (req, res) => { try { const doc = await ${N}.findByIdAndDelete(req.params.id); if (!doc) return res.status(404).json({ error: 'Not found.' }); res.json({ message: 'Deleted.' }); } catch (e) { res.status(404).json({ error: 'Not found.' }); } });`,
    '',
    'module.exports = router;',
    '',
  ].join('\n')
}

/** Deterministic post-generation route audit.
 *  Rule: GET / GET/:id / POST / → always PUBLIC.  PUT/:id / DELETE/:id → requireAdmin.
 *  Scans every generated server/routes/*.routes.js and enforces this regardless
 *  of what the AI wrote. Handles all patterns:
 *    - router.use(requireAdmin)  ← blanket lock on the whole router
 *    - router.get('/', requireAdmin, ...)
 *    - router.get('/:id', requireAdmin, ...)
 *    - router.post('/', requireAdmin, ...)
 *  No AI needed — pure string replacement. Never throws. */
/** Move any @import rules to the top of CSS files.
 *  CSS spec requires @import before all other rules — placing them mid-file
 *  causes Vite to emit a warning AND some browsers silently ignore them. */
function fixCssImportOrder(files: ParsedChange[]): void {
  for (const f of files.filter((x) => x.path.endsWith('.css'))) {
    const lines = f.content.split('\n')
    const imports = lines.filter((l) => /^\s*@import\b/.test(l))
    const rest = lines.filter((l) => !/^\s*@import\b/.test(l))
    if (!imports.length) continue
    f.content = [...imports, '', ...rest].join('\n')
    console.log(`[fixCss] moved ${imports.length} @import(s) to top of ${f.path}`)
  }
}

/** Strip imports of npm packages that aren't in the generated client's package.json.
 *  Vite fails the ENTIRE build on one unresolvable import — one hallucinated
 *  package like "react-serif" or "framer-motion" kills the whole site.
 *  Relative imports (./foo) and the known installed packages are kept; everything
 *  else is commented out so the file still parses. */
function stripHallucinatedPackageImports(files: ParsedChange[]): void {
  const ALLOWED = new Set([
    'react', 'react-dom', 'react-router-dom', 'axios',
    'vite', '@vitejs/plugin-react',
  ])
  for (const f of files.filter((x) => /^client\/src\/.+\.(jsx?|tsx?)$/.test(x.path.replace(/\\/g, '/')))) {
    const lines = f.content.split('\n')
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      // Match bare package imports: import ... from 'pkg' where pkg is NOT relative
      const m = lines[i].match(/^(\s*import\b[^'"]*['"])([^./][^'"]*)(["'].*)$/)
      if (!m) continue
      const rawPkg = m[2]
      // Scoped packages: @scope/name — use full @scope/name as key
      const pkg = rawPkg.startsWith('@') ? rawPkg.split('/').slice(0, 2).join('/') : rawPkg.split('/')[0]
      if (ALLOWED.has(pkg)) continue
      console.warn(`[auditImports] removed hallucinated import "${rawPkg}" from ${f.path}`)
      lines[i] = `// [ForgeAI removed] import "${rawPkg}" — package not in client/package.json`
      changed = true
    }
    if (changed) f.content = lines.join('\n')
  }
}

/**
 * Scan generated Mongoose model files and add `sparse: true` to any
 * `unique: true` field that is NOT marked `required: true`.
 * Without sparse, every doc that omits the field stores null and the
 * second insert crashes with E11000 duplicate key { field: null }.
 */
function auditMongooseModels(files: ParsedChange[]): void {
  const modelFiles = files.filter((f) => /^server\/models\/.+\.js$/.test(f.path.replace(/\\/g, '/')))
  for (const f of modelFiles) {
    const before = f.content
    // Match field definition blocks that have unique:true but NOT required:true and NOT sparse:true
    // Pattern: find object literals containing `unique: true` but missing `required: true` and `sparse`
    f.content = f.content.replace(
      /\{([^{}]*\bunique\s*:\s*true\b[^{}]*)\}/g,
      (block, inner) => {
        // Skip if already sparse or if required:true is present (slug-style fields are safe)
        if (/sparse\s*:\s*true/.test(inner)) return block
        if (/required\s*:\s*true/.test(inner)) return block
        // Inject sparse: true after unique: true
        return `{${inner.replace(/(\bunique\s*:\s*true)/, '$1,\n      sparse: true')}}`
      },
    )
    if (f.content !== before) {
      console.log(`[auditModels] added sparse:true to optional unique fields in ${f.path}`)
    }
  }
}

function auditPublicPostRoutes(files: ParsedChange[]): void {
  const routeFiles = files.filter((f) => /^server\/routes\/.+\.routes\.js$/.test(f.path.replace(/\\/g, '/')))
  for (const f of routeFiles) {
    const before = f.content
    f.content = f.content
      // Remove top-level router.use(requireAdmin) that blanket-locks all routes
      .replace(/router\.use\s*\(\s*requireAdmin\s*\)\s*;?\n?/g, '')
      // Remove requireAdmin from GET / and GET /:id
      .replace(/router\.get\s*\(\s*(['"`]\/['"`])\s*,\s*requireAdmin\s*,/g, 'router.get($1,')
      .replace(/router\.get\s*\(\s*(['"`]\/:id['"`])\s*,\s*requireAdmin\s*,/g, 'router.get($1,')
      // Remove requireAdmin from POST /
      .replace(/router\.post\s*\(\s*(['"`]\/['"`])\s*,\s*requireAdmin\s*,/g, 'router.post($1,')
      // Remove requireAdmin from PUT /:id — user-facing operations (cart, booking,
      // contact edits) need to update records without an admin token; only DELETE is protected
      .replace(/router\.put\s*\(\s*(['"`]\/:id['"`])\s*,\s*requireAdmin\s*,/g, 'router.put($1,')
    // Fix paginated GET / response shapes — AI sometimes wraps the array in
    // { items: [], total: N } which breaks .map() in every frontend page.
    // Unwrap to a plain array so every generated page works without patching.
    f.content = f.content.replace(
      /res\.json\s*\(\s*\{\s*\w+\s*:\s*(await\s+\w+\.find\s*\([^)]*\)(?:\.[a-zA-Z0-9_()[\]'"., ]*)*)\s*,\s*(?:total|count|totalCount|total_count)\s*:[^}]+\}\s*\)/g,
      'res.json($1)',
    )
    if (f.content !== before) {
      console.log(`[auditRoutes] enforced public GET+POST+PUT and plain-array GET in ${f.path}`)
    }
  }
}

/**
 * Audit all generated JSX/JS frontend files and auto-fix the patterns that
 * reliably crash generated sites at runtime. Pure string transforms — no AI,
 * no prompts. Runs after every generation pass so bugs never reach the user.
 *
 * Fixes applied:
 *  1. images.split(',') — Mongoose stores images as [String]; .split crashes
 *  2. src={x.images} — renders "[object Array]"; extract first element
 *  3. image: x.images in object literals (cart/API payloads) — same issue
 *  4. Nested <BrowserRouter> / <Router> — crashes React with "invalid hook call"
 *  5. Hardcoded localhost API URLs — break in production containers
 */
function auditFrontendJsx(files: ParsedChange[]): void {
  const jsxFiles = files.filter((f) => /^client\/.*\.[jt]sx?$/.test(f.path.replace(/\\/g, '/')))
  for (const f of jsxFiles) {
    const before = f.content

    // 1. .images.split(',')[0]  →  safe first-element extraction
    f.content = f.content.replace(
      /(\w+)\.images\.split\s*\(\s*['",]\s*['"]\s*\)\s*\[0\]/g,
      "(Array.isArray($1.images) ? $1.images[0] : ($1.images || '').split(',')[0])",
    )
    // Also handle .images?.split(...)
    f.content = f.content.replace(
      /(\w+)\.images\?\s*\.\s*split\s*\(\s*['",]\s*['"]\s*\)/g,
      "(Array.isArray($1.images) ? $1.images : ($1.images || '').split(','))",
    )

    // 2. src={x.images}  and  src={x.images || fallback}
    //    Replace bare `x.images` used as an img src with safe first-element access.
    //    Match: src={expr.images} or src={expr.images || 'fallback'}
    f.content = f.content.replace(
      /src=\{(\w+)\.images(\s*\|\|\s*['"`][^'"` ]*['"`])?\}/g,
      (_, varName, fallback) => {
        const fb = fallback ? fallback.trim() : "|| 'https://picsum.photos/seed/img/400/400'"
        return `src={(Array.isArray(${varName}.images) ? ${varName}.images[0] : ${varName}.images) ${fb}}`
      },
    )

    // 3. image: x.images  inside object literals (cart payloads, API bodies)
    //    Only fix bare assignment — leave already-guarded expressions alone.
    f.content = f.content.replace(
      /\bimage\s*:\s*(\w+)\.images(?!\s*\?|\s*&&|\s*\[|\s*\.)/g,
      'image: (Array.isArray($1.images) ? $1.images[0] : $1.images)',
    )

    // 4. Nested BrowserRouter / Router — crashes React entirely
    //    Remove import and JSX wrapper; BrowserRouter is already in main.jsx
    f.content = f.content.replace(
      /import\s*\{[^}]*\bBrowserRouter\b[^}]*\}\s*from\s*['"]react-router-dom['"]\s*;?\n?/g,
      (m) => `// [ForgeAI] BrowserRouter removed — already in main.jsx\n`,
    )
    f.content = f.content.replace(/<BrowserRouter>([\s\S]*?)<\/BrowserRouter>/g, '$1')
    f.content = f.content.replace(/<Router>([\s\S]*?)<\/Router>/g, '$1')

    // 5. Hardcoded http://localhost:PORT/api — breaks in Docker / production
    f.content = f.content.replace(
      /['"`]https?:\/\/localhost:\d+\/api\//g,
      "'/api/",
    )

    // 6. Strip unknown named imports from '../components/ui' — only the exports
    //    in the deterministic ui.jsx are valid; unknown names crash the Vite build.
    const knownUiExports = new Set([
      'toast','Button','Card','Spinner','Badge','Alert','Input','Textarea',
      'Modal','Stat','EmptyState','PageHeader','Table','Tabs',
    ])
    f.content = f.content.replace(
      /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*\/components\/ui['"]/g,
      (match, names) => {
        const kept = names.split(',').map((n: string) => n.trim()).filter((n: string) => knownUiExports.has(n.replace(/\s+as\s+\w+$/, '').trim()))
        if (kept.length === 0) return `// [ForgeAI] removed invalid ui imports: ${names.trim()}`
        const rebuilt = `import { ${kept.join(', ')} } from '../components/ui'`
        return rebuilt === match ? match : rebuilt
      },
    )

    if (f.content !== before) {
      console.log(`[auditFrontend] auto-fixed JSX anti-patterns in ${f.path}`)
    }
  }
}

/** Self-heal API mismatches: any `/api/<x>` the client calls but the server never
 *  mounted gets a flexible model + CRUD route generated and mounted — so a page
 *  never 404s against its own backend. Deterministic; never throws. */
async function healMissingApiEndpoints(files: ParsedChange[], log: (m: string, p?: number) => Promise<unknown>): Promise<void> {
  const server = files.find((f) => f.path.replace(/\\/g, '/') === 'server/index.js')
  if (!server) return
  const called = new Set<string>()
  for (const f of files.filter((x) => /^client\/.*\.jsx$/.test(x.path.replace(/\\/g, '/')))) {
    for (const m of f.content.matchAll(/["'`]\/api\/([a-zA-Z0-9_-]+)/g)) called.add(m[1].toLowerCase())
  }
  const mounted = new Set<string>()
  for (const m of server.content.matchAll(/app\.use\(\s*["'`]\/api\/([a-zA-Z0-9_-]+)/g)) mounted.add(m[1].toLowerCase())
  let mountLines = ''
  for (const ep of [...called].filter((e) => !mounted.has(e)).slice(0, 4)) {
    const norm = (p: string) => p.replace(/\\/g, '/')
    const routePaths = files.map((f) => norm(f.path))

    // 1. Exact route file already exists — just mount it.
    if (routePaths.includes(`server/routes/${ep}.routes.js`)) {
      mountLines += `app.use('/api/${ep}', require('./routes/${ep}.routes'))\n`
      await log(`🔌 Aliased /api/${ep} to its existing route (mount-path mismatch fixed).`)
      continue
    }

    // 2. Plural/singular variant exists — alias the client path to the real route file.
    const variant = pluralVariants(ep).find((v) => routePaths.includes(`server/routes/${v}.routes.js`))
    if (variant) {
      mountLines += `app.use('/api/${ep}', require('./routes/${variant}.routes'))\n`
      await log(`🔌 /api/${ep} → ${variant}.routes.js (plural/singular mismatch fixed — no duplicate model created).`)
      continue
    }

    // 3. Genuine gap — no related route exists at all. Generate a minimal model + route.
    const name = (ep.replace(/[^a-zA-Z0-9]/g, '').replace(/^./, (c) => c.toUpperCase())) || 'Item'
    if (routePaths.includes(`server/models/${name}.js`)) continue
    files.push({ path: `server/models/${name}.js`, content: healModel(name) })
    files.push({ path: `server/routes/${ep}.routes.js`, content: healRoute(name) })
    mountLines += `app.use('/api/${ep}', require('./routes/${ep}.routes'))\n`
    await log(`🔌 Client calls /api/${ep} with no backend — generated minimal ${name} model + route.`)
  }
  if (mountLines) {
    server.content = /\n\/\/ Serve the built React client/.test(server.content)
      ? server.content.replace(/\n\/\/ Serve the built React client/, `\n${mountLines}\n// Serve the built React client`)
      : server.content.replace(/\nconst dist =/, `\n${mountLines}\nconst dist =`)
  }
}

export async function generateMernSite(
  provider: AIProvider,
  prompt: string,
  siteName: string,
  designBrief: string,
  log: (message: string, progress?: number) => Promise<unknown>,
): Promise<{ files: ParsedChange[]; summary: string; adminPassword: string; plan?: MernPlan }> {
  const files: ParsedChange[] = []
  const adminPassword = generateAdminPassword()
  const pack = selectPack(designBrief)
  const packCss = getPackCss(pack)
  // Injected into the VISUAL files (App shell, pages, stylesheet) so the whole
  // UI shares one identity. Backend files (models/routes/server) skip it.
  const briefBlock = `${briefHeader}\n${designBrief}\n\n${getPackPromptNote(pack)}\n\n${getReactPackPromptNote()}\n\n`

  const enhancer = createEnhancer()

  const gen = async (instruction: string, expectPath: string): Promise<boolean> => {
    const isJsx = expectPath.endsWith('.jsx')
    let nudge = ''
    // Try primary provider (Gemini) 3 times before falling back to Claude
    const providers: AIProvider[] = [provider, ...(enhancer ? [enhancer] : [])]
    for (const p of providers) {
      const maxAttempts = p === provider ? 3 : 2
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await safeChat(p, instruction + nudge, MERN_SYSTEM_PROMPT)
        if (!res) { await sleep(attempt === 0 ? 3000 : 5000); continue }
        const parsed = parseAIChanges(res.content)
        const file = parsed.find(
          (f) => f.path.replace(/\\/g, '/').toLowerCase() === expectPath.toLowerCase(),
        ) ?? parsed[0]
        if (file?.content?.trim()) {
          // The scaffold has NO Tailwind — utility classes render UNSTYLED. If the
          // model reached for them, retry ONCE demanding semantic classNames the
          // generated stylesheet can actually target (this is the #1 cause of
          // ugly MERN pages). Second Tailwind reply is accepted to avoid looping.
          if (isJsx && attempt === 0 && looksTailwind(file.content)) {
            nudge = `\n\nYOUR LAST ATTEMPT USED TAILWIND UTILITY CLASSES (e.g. "flex", "p-6", "bg-white", "rounded-xl", "max-w-6xl", "text-center") — this project has NO Tailwind, so they render COMPLETELY UNSTYLED. Rewrite the SAME rich content using ONLY descriptive semantic classNames (e.g. "hero", "profile-card", "match-grid", "section-title") that the global stylesheet targets. No utility classes anywhere.`
            await log(`🎨 ${expectPath.split('/').pop()} used Tailwind (unsupported here) — regenerating with semantic classes`)
            await sleep(1200)
            continue
          }
          if (p !== provider) await log(`🤖 Claude stepped in for ${expectPath.split('/').pop()} (Gemini unavailable)`)
          // Sanitize JSX attribute quoting bugs (e.g. value="36.5\"") that
          // cause a hard esbuild parse error and a failed Render deploy
          const content = isJsx ? sanitizeJsx(file.content) : file.content
          files.push({ path: expectPath, content })
          return true
        }
        await sleep(2000)
      }
    }
    await log(`⚠️ Could not generate ${expectPath} after retrying`)
    return false
  }

  // ── Plan ──
  await log('🧠 Planning the app — data models, API, pages…', 10)
  const plan = await planMernSite(provider, prompt, designBrief, enhancer)
  await log(`📐 Plan: model(s) ${plan.models.map((m) => m.name).join(', ')}; page(s) ${plan.pages.map((p) => p.file).join(', ')}`)

  const contract = `PROJECT PLAN (follow it exactly):\n${JSON.stringify(plan, null, 1)}\n\nAPI CONVENTION: every model is served at /api/<modelname-lowercase>s with full CRUD — GET / (list), GET /:id, POST /, PUT /:id, DELETE /:id. The React client calls these with axios at relative paths.`

  // Deterministic scaffold — configs and entry points, nothing to hallucinate
  files.push(...mernScaffoldConfigs(siteName, plan))

  // ── Mongoose models ──
  let pct = 15
  const generatedModels: string[] = []
  for (const m of plan.models) {
    await log(`🗄️ Generating Mongoose model ${m.name}…`, (pct += 4))
    await sleep(1500)
    const ok = await gen(
      `${contract}\n\nGenerate server/models/${m.name}.js — the Mongoose model for ${m.name} (CommonJS) with fields ${JSON.stringify(m.fields)}, { timestamps: true }, and sensible required/trim/default options. module.exports the model.`,
      `server/models/${m.name}.js`,
    )
    if (ok) {
      generatedModels.push(m.name)
    } else {
      // Fallback: write a minimal but valid model so the route can still compile
      await log(`⚙️ Model generation failed for ${m.name} — writing minimal fallback model`)
      const fallbackFields = m.fields.map((f) => {
        const t = f.type === 'Number' ? 'Number' : f.type === 'Boolean' ? 'Boolean' : f.type === 'Date' ? 'Date' : 'String'
        return `  ${f.name}: { type: ${t}, trim: ${t === 'String' ? 'true' : 'false'} }`
      }).join(',\n')
      files.push({
        path: `server/models/${m.name}.js`,
        content: [
          "const mongoose = require('mongoose')",
          `const schema = new mongoose.Schema({\n${fallbackFields}\n}, { timestamps: true })`,
          `module.exports = mongoose.model('${m.name}', schema)`,
          '',
        ].join('\n'),
      })
      generatedModels.push(m.name)
    }
  }

  // ── Express routes — only for models that have a file ──
  for (const m of plan.models) {
    if (!generatedModels.includes(m.name)) continue
    const lower = m.name.toLowerCase()
    await log(`🔌 Generating API routes for ${m.name}…`, (pct += 4))
    await sleep(1500)
    const ok = await gen(
      `${contract}\n\nGenerate server/routes/${lower}.routes.js — an Express router (CommonJS) for the ${m.name} model (require it from ../models/${m.name}).\n\nAuth rules — these are FIXED, no exceptions:\n• GET / → PUBLIC\n• GET /:id → PUBLIC\n• POST / → PUBLIC (anyone can create — visitors submit forms, admin panel creates records through the same endpoint)\n• PUT /:id → requireAdmin only\n• DELETE /:id → requireAdmin only\n\nInline requireAdmin directly in this file (verify JWT from req.headers.authorization, secret: process.env.ADMIN_JWT_SECRET || 'forgeai-admin-secret-change-me'). Every handler async with try/catch and proper status codes (201 create, 400 validation, 404 missing, 500 otherwise). module.exports the router.`,
      `server/routes/${lower}.routes.js`,
    )
    if (!ok) {
      // Fallback: write a minimal CRUD route using the heal route generator
      await log(`⚙️ Route generation failed for ${m.name} — writing minimal fallback route`)
      files.push({ path: `server/routes/${lower}.routes.js`, content: healRoute(m.name) })
    }
  }

  // Server entry — mounts only the route files that actually got generated
  files.push(mernServerEntry(siteName, plan, files, adminPassword))

  // ── React app shell ──
  await log('⚛️ Generating App.jsx…', (pct += 5))
  await sleep(1500)
  const routeList = plan.pages.map((p) => `${p.route} → pages/${p.file}`).join(', ')
  await gen(
    `${briefBlock}${contract}\n\nGenerate client/src/App.jsx — the root component: a sticky header nav (brand "${siteName}", NavLink to every page), <Routes> mapping ${routeList}, and a footer. Use semantic classNames everywhere so the stylesheet can make it look premium (all styling comes from index.css — do not import it here; main.jsx already does). REMINDER: main.jsx already provides <BrowserRouter> — do not render any Router here.`,
    'client/src/App.jsx',
  )

  // Nested-router guard: main.jsx already wraps <App /> in <BrowserRouter>.
  // A second Router inside App.jsx throws at first render (blank page +
  // uncaught minified error) — strip it deterministically if the model
  // ignored the instruction.
  const appEntry = files.find((f) => f.path === 'client/src/App.jsx')
  if (appEntry && /<\s*(BrowserRouter|Router)[\s>]/.test(appEntry.content)) {
    appEntry.content = appEntry.content
      .replace(/(import\s*{[^}]*}\s*from\s*['"]react-router-dom['"])/, (imp) => imp
        .replace(/\bBrowserRouter\s+as\s+Router\b\s*/g, '')
        .replace(/\bBrowserRouter\b\s*/g, '')
        .replace(/{\s*,/, '{ ')
        .replace(/,\s*,/g, ',')
        .replace(/,\s*}/, ' }'))
      .replace(/<\s*(BrowserRouter|Router)(\s[^>]*)?>/g, '<>')
      .replace(/<\/\s*(BrowserRouter|Router)\s*>/g, '</>')
    await log('🧹 Removed nested <Router> from App.jsx — main.jsx already provides BrowserRouter')
  }
  // Wire the always-on admin panel into App.jsx as a BARE route — reachable
  // only by visiting /admin, never added to the public header nav.
  if (appEntry) {
    let a = appEntry.content
    if (!/pages\/Admin/.test(a)) {
      a = a.replace(
        /(import[^\n]*\bfrom\b[^\n]*\n)(?![\s\S]*?import[^\n]*\bfrom\b)/,
        `$1import Admin from './pages/Admin.jsx'\n`,
      )
    }
    if (!/path=["']\/admin["']/.test(a)) {
      a = a.replace(/<\/Routes>/, `        <Route path="/admin" element={<Admin />} />\n      </Routes>`)
    }
    appEntry.content = a
    await log('🔐 Wired hidden /admin panel into App.jsx (reachable only at /admin)')
  }
  const appJsx = appEntry?.content ?? ''

  // ── Pages ──
  for (const p of plan.pages) {
    await log(`📄 Generating ${p.file}…`, Math.min(70, (pct += 5)))
    await sleep(1500)
    const isLanding = p.route === '/'
    const richness = isLanding
      ? `This is the LANDING page — make it LONG and impressive, like a real product homepage. ⚠️ THIS IS REACT JSX — use className= everywhere, NEVER class=. Include, IN ORDER: (1) a full hero (eyebrow + big headline with a <span className="gradient-text"> accent + subhead + two CTAs), then AT LEAST SIX more full <section className="section"> blocks chosen to fit the product — e.g. a feature grid (grid-3 of feature-card with feature-icon), a "how it works" steps row (step + step-num), a stats band (stat-value/stat-label), a showcase/gallery, a testimonials grid (testimonial), a pricing/plans row, an FAQ, and a final cta-section — and a rich footer. Every section wrapped in <div className="container">, with a section-head (eyebrow + h2 + intro). Make it feel alive with entrance animations (className="animate-in") and hover micro-interactions. Populate sections with several images (https://picsum.photos/seed/{seed}/{w}/{h} URLs that always load + pravatar avatars for people).`
      : `Give it a compact page hero (h1 + one line), then AT LEAST THREE substantial <section className="section"> blocks of real content (not one thin block). ⚠️ REACT JSX: always className= never class=.`
    await gen(
      `${briefBlock}${contract}\n\nApp.jsx for reference:\n\`\`\`jsx\n${appJsx.slice(0, 3000)}\n\`\`\`\n\nGenerate client/src/pages/${p.file} — ${p.purpose}. Original request: ${prompt.slice(0, 300)}.\n\n${richness}\n\nWrite REAL, specific, on-brand copy — never lorem, never "..." or TODO. If the page fetches data (GET), show a loading skeleton or spinner while loading, then render the data. FORMS: if this page has any form, you MUST implement: (1) const [loading, setLoading] = useState(false) — disable submit button and show "Submitting…" text while true, (2) const [success, setSuccess] = useState(false) — when true, hide the form and show a large green success message (e.g. "✓ Your application was received! We'll be in touch within 48 hours."), (3) const [error, setError] = useState('') — show it in red below the form if the request fails. Always reset the form fields on success. CRITICAL: this is a PUBLIC page — never make POST, PUT, or DELETE requests from it EXCEPT for user submissions (forms, bookings, applications, registrations, contact, orders). Never make admin-style writes. Export default the component. Do NOT import any CSS file — styling is global via index.css, which main.jsx already imports.`,
      `client/src/pages/${p.file}`,
    )
  }

  // ── Hidden admin panel ── code-generated CRUD over every model, wired to the
  // /api endpoints. Pushed here (before the CSS passes) so its classes get styled
  // and before the import sanity pass so App.jsx's Admin import resolves.
  files.push(mernAdminPage(plan, files, adminPassword))

  // Self-heal: any /api/<x> the client calls but the server never mounted gets a
  // flexible model + CRUD route generated and mounted, so pages never 404.
  await healMissingApiEndpoints(files, log)

  // Deterministic route audit: strip requireAdmin from any POST endpoint that
  // a public page calls. Runs after all route files are finalized so it catches
  // both AI-generated and heal-generated routes. No AI, no prompts — pure scan.
  auditMongooseModels(files)
  auditPublicPostRoutes(files)
  auditFrontendJsx(files)
  fixCssImportOrder(files)
  stripHallucinatedPackageImports(files)

  // ── Import sanity pass ──
  // Vite fails the ENTIRE build on one unresolvable import. Strip imports of
  // CSS files that were never generated (styling is global in index.css) and
  // generate any missing component a page references.
  const resolves = (fromPath: string, spec: string): boolean => {
    const dir = path.posix.dirname(fromPath.replace(/\\/g, '/'))
    const base = path.posix.normalize(path.posix.join(dir, spec))
    return [base, `${base}.jsx`, `${base}.js`, `${base}/index.jsx`]
      .some((c) => files.some((f) => f.path.replace(/\\/g, '/') === c))
  }
  const missingModules: { from: string; spec: string; resolved: string }[] = []
  for (const f of files.filter((x) => x.path.endsWith('.jsx'))) {
    const lines = f.content.split('\n')
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*import\b[^'"]*['"](\.{1,2}\/[^'"]+)['"]/.exec(lines[i])
      if (!m || resolves(f.path, m[1])) continue
      if (m[1].endsWith('.css')) {
        lines[i] = ''
        changed = true
        await log(`🧹 Removed import of missing ${m[1]} from ${f.path} — styling is global in index.css`)
      } else {
        const dir = path.posix.dirname(f.path.replace(/\\/g, '/'))
        const resolved = path.posix.normalize(path.posix.join(dir, m[1]))
        missingModules.push({
          from: f.path,
          spec: m[1],
          resolved: /\.(jsx|js)$/.test(resolved) ? resolved : `${resolved}.jsx`,
        })
      }
    }
    if (changed) f.content = lines.join('\n')
  }
  for (const miss of missingModules) {
    await log(`🧩 ${miss.from} imports missing ${miss.spec} — generating it…`)
    await sleep(1500)
    const importer = files.find((f) => f.path === miss.from)
    const ok = await gen(
      `${contract}\n\nThe component below imports "${miss.spec}", which does not exist yet. Importer ${miss.from}:\n\`\`\`jsx\n${importer?.content.slice(0, 3000) ?? ''}\n\`\`\`\n\nGenerate the COMPLETE ${miss.resolved} module it expects (default export, matching exactly how the importer uses it). PUBLIC page rules: only axios GET calls allowed — never POST/PUT/DELETE (those belong in /admin only). Do NOT import any CSS file.`,
      miss.resolved,
    )
    if (!ok && !files.some((f) => f.path === miss.resolved)) {
      // Gemini failed — try Claude as a fallback generator before stubbing
      const enhancer = createEnhancer()
      if (enhancer) {
        await log(`🤖 Gemini failed on ${miss.resolved} — asking Claude to generate it…`)
        try {
          const resp = await enhancer.chat(
            [{ role: 'user', content: `${contract}\n\nGenerate the COMPLETE ${miss.resolved} React component (default export). It is imported by ${miss.from}:\n\`\`\`jsx\n${importer?.content.slice(0, 3000) ?? ''}\n\`\`\`\nMatch exactly how the importer uses it. PUBLIC page rules: only axios GET calls — never POST/PUT/DELETE (those belong in /admin only). Do NOT import any CSS file. Reply with only the file content, no markdown fences.` }],
          )
          files.push({ path: miss.resolved, content: resp.content })
          await log(`✅ Claude generated ${miss.resolved}`)
        } catch {
          // Claude also failed — stub it
          const name = path.posix.basename(miss.resolved, '.jsx').replace(/[^a-zA-Z0-9]/g, '')
          files.push({
            path: miss.resolved,
            content: `export default function ${name || 'Page'}() {\n  return (\n    <div className="section">\n      <div className="container">\n        <h1 className="gradient-text">${name}</h1>\n        <p>Coming soon.</p>\n      </div>\n    </div>\n  )\n}\n`,
          })
          await log(`⚠️ Could not generate ${miss.resolved} — inserted placeholder so the build succeeds`)
        }
      } else {
        const name = path.posix.basename(miss.resolved, '.jsx').replace(/[^a-zA-Z0-9]/g, '')
        files.push({
          path: miss.resolved,
          content: `export default function ${name || 'Page'}() {\n  return (\n    <div className="section">\n      <div className="container">\n        <h1 className="gradient-text">${name}</h1>\n        <p>Coming soon.</p>\n      </div>\n    </div>\n  )\n}\n`,
        })
        await log(`⚠️ Could not generate ${miss.resolved} — inserted placeholder so the build succeeds`)
      }
    }
  }

  // ── Stylesheet LAST — after every component exists ──
  // Built in CHUNKS: output caps mean a one-shot stylesheet covers only a
  // fraction of the classes across several pages. Order: deterministic
  // element baseline (nothing ever renders with raw browser defaults) →
  // AI theme + shell → per-page rules → batched safety-net pass.
  // Pack CSS is the deterministic foundation; BASE_CSS element baseline follows;
  // AI theme and per-page rules are appended on top of both.
  const cssEntry: ParsedChange = { path: 'client/src/index.css', content: packCss + '\n' + getReactPackCss() + '\n' + BASE_CSS }
  files.push(cssEntry)
  for (const f of getReactPackFiles()) files.push(f)

  // Strip @import rules from AI CSS chunks — the pack CSS already loads fonts,
  // and mid-file @imports from per-chunk AI output cause Vite build failures.
  // We collect them and prepend them to cssEntry at the end instead.
  const cssImportsCollected: string[] = []
  const stripAndCollectImports = (css: string): string => {
    const lines = css.split('\n')
    const imports = lines.filter((l) => /^\s*@import\b/.test(l))
    const rest = lines.filter((l) => !/^\s*@import\b/.test(l))
    for (const imp of imports) {
      if (!cssImportsCollected.includes(imp.trim())) cssImportsCollected.push(imp.trim())
    }
    return rest.join('\n')
  }

  const askCss = async (instruction: string): Promise<string> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await safeChat(provider, briefBlock + instruction, MERN_SYSTEM_PROMPT)
      if (!res) { await sleep(2000); continue }
      const file = parseAIChanges(res.content)[0]
      if (file?.content?.trim()) return stripAndCollectImports(stripCodeFence(file.content.trim()))
      await sleep(2000)
    }
    return ''
  }

  await log('🎨 Generating the theme and app shell styles…', 72)
  await sleep(1500)
  const appShellJsx = files.find((f) => f.path === 'client/src/App.jsx')?.content ?? ''
  const themeCss = await askCss(
    `App.jsx — the shared shell (header/nav/footer):\n\`\`\`jsx\n${appShellJsx.slice(0, 5000)}\n\`\`\`\n\nOriginal request: ${prompt.slice(0, 300)}\n\nA complete DESIGN-SYSTEM stylesheet is ALREADY loaded — it fully styles the header/nav, hero, cards, buttons, grids, stats, forms, and footer from CSS variables. Your ONE job now is a killer :root theme that drives it, applying the DESIGN BRIEF EXACTLY. Output client/src/index.css containing:\n1. A :root block that DEFINES ALL of these (components read them by these EXACT names): --bg, --surface, --surface-2, --text, --muted, --on-primary, --primary, --primary-hover, --secondary, --accent, --border, --radius, --radius-sm, and the type scale --h1 --h2 --h3 (the brief's fluid clamp() sizes — a big confident --h1). Set --font-heading and --font-body from the brief's pairing (already-linked Google Fonts: Space Grotesk, Sora, Inter, Poppins, Playfair Display, DM Sans). Use the brief's EXACT palette; CONTRAST between --text and --bg/--surface is non-negotiable.\n2. OPTIONALLY a few small brand-accent rules ONLY for App.jsx classNames that need a bespoke touch beyond the system (e.g. a logo mark). Do NOT re-implement the header/nav/footer layout — the system already handles it; just theme it. Never reference a var you don't define.\nOutput as <file path="client/src/index.css">.`,
  )
  if (themeCss) cssEntry.content += `\n/* ── Theme & shell ── */\n${themeCss}\n`

  const classesIn = (content: string): string[] => {
    const out = new Set<string>()
    for (const m of content.matchAll(/class(?:Name)?="([^"]+)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c) out.add(c)
    }
    return [...out]
  }
  const isStyled = (cls: string) =>
    new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(cssEntry.content)

  for (const pageFile of files.filter((f) => /^client\/src\/(pages\/.+|App)\.jsx$/.test(f.path.replace(/\\/g, '/')))) {
    const need = classesIn(pageFile.content).filter((c) => !isStyled(c))
    if (!need.length) continue
    const pageName = pageFile.path.split('/').pop()
    await log(`🎨 Styling ${pageName} (${need.length} classes)…`, Math.min(85, (pct += 3)))
    await sleep(1500)
    const chunk = await askCss(
      `The stylesheet's CSS variables:\n\`\`\`css\n${cssEntry.content.match(/:root\s*{[^}]*}/)?.[0] ?? ''}\n\`\`\`\n\nComponent ${pageFile.path}:\n\`\`\`jsx\n${pageFile.content.slice(0, 8000)}\n\`\`\`\n\nWrite polished CSS rules for EXACTLY these classes (everything else is already styled):\n${need.slice(0, 150).map((c) => `.${c}`).join('\n')}\n\nReuse the CSS variables above so the design stays cohesive. Include hover/focus states and responsive breakpoints where relevant. Output ONLY the new rules as <file path="additions.css">.`,
    )
    if (chunk) cssEntry.content += `\n/* ── ${pageName} ── */\n${chunk}\n`
  }

  sanitizeCss(files, 'client/src/index.css')
  await appendMissingStyles(provider, files, 'client/src/index.css', ['.jsx'], MERN_SYSTEM_PROMPT,
    (n) => log(`🎨 ${n} class(es) missing styles — extending index.css…`, 80))
  sanitizeCss(files, 'client/src/index.css')
  fixBlurNavBackground(files, 'client/src/index.css')
  // Final deterministic fixes appended LAST so they win over any generated CSS
  // (e.g. a broken .gradient-text rendering as a solid rectangle).
  cssEntry.content += `\n${FINAL_FIXES_CSS}`

  // Guarantee @imports are at the very top of the assembled CSS.
  // Strategy: extract ALL @import lines from the full file (pack + AI chunks),
  // deduplicate, and PREPEND them before all other content. This is more
  // reliable than reordering after the fact because appendMissingStyles can
  // add AI chunks with @imports, and askCss stripAndCollectImports already
  // removed @imports from those chunks — but packCss may have its own @imports.
  {
    const allLines = cssEntry.content.split('\n')
    const topImports = allLines.filter((l) => /^\s*@import\b/.test(l))
    const nonImportLines = allLines.filter((l) => !/^\s*@import\b/.test(l))
    // Merge pack @imports with AI-collected @imports, deduplicate
    const mergedImports = [...new Set([...topImports.map((l) => l.trim()), ...cssImportsCollected])]
      .filter(Boolean)
      .map((l) => l.trim())
    if (mergedImports.length) {
      cssEntry.content = mergedImports.join('\n') + '\n\n' + nonImportLines.join('\n')
      console.log(`[css] pinned ${mergedImports.length} @import(s) to top of index.css`)
    }
  }

  // Vite only bundles CSS that is IMPORTED. The missing-import sanitizer runs
  // before index.css exists and may have stripped the import from main.jsx —
  // now that the stylesheet is real, guarantee the import is present, or the
  // whole app ships completely unstyled.
  const mainJsx = files.find((f) => f.path.replace(/\\/g, '/') === 'client/src/main.jsx')
  if (mainJsx && !/import\s+['"][^'"]*index\.css['"]/.test(mainJsx.content)) {
    mainJsx.content = `import './index.css'\n${mainJsx.content}`
    await log('🎨 Linked index.css into client/src/main.jsx so Vite bundles the styles')
  }

  // ── Seed data ── generate realistic starter records so the site never
  // launches with empty pages. Uses the already-generated model schemas.
  // Only seeds CONTENT models (things visitors browse), not submission models.
  await log('🌱 Generating seed data so the site launches with real content…', 95)
  try {
    const contentModels = plan.models.filter((m) => {
      const lower = m.name.toLowerCase()
      // Skip submission/log models — seeding these would look fake to real users
      return !/^(contact|message|inquiry|submission|order|booking|payment|log|notification|application|lead|review|rsvp|attendee|ticket|signup|registration)s?$/.test(lower)
    })
    if (contentModels.length > 0) {
      const modelSchemas = contentModels.map((m) => {
        const src = files.find((f) => f.path === `server/models/${m.name}.js`)?.content ?? ''
        return `${m.name}: ${src.slice(0, 600)}`
      }).join('\n\n')
      const seedResp = await safeChat(provider,
        `${briefBlock}You are seeding a MongoDB database for "${siteName}" (${prompt.slice(0, 200)}).\n\nGenerate realistic, on-brand seed data. Output a single server/seed.js file (CommonJS) that:\n1. requires mongoose and each model from ./models/ModelName (NOT ../models — it runs from the server/ directory)\n2. For each model below, inserts records using Model.insertMany([...]) BUT ONLY IF the collection is empty (check with Model.countDocuments() first)\n3. CRITICAL: Do NOT call mongoose.connect() or mongoose.disconnect() — the server already manages the connection. The seed runs inside the server process on the existing connection. Just require the models and insert data directly — no connection code at all.\n4. Export the seed logic as a default export or run it immediately as an async IIFE that does NOT manage the connection\n5. Has realistic, specific copy — real names, real prices, real descriptions — nothing lorem ipsum\n6. REAL DATA RULE — CRITICAL: Never invent or hardcode fake records for any domain that has a real authoritative data source. Use the best available source in this priority order:\n\n   TIER 1 — Free public REST APIs (use Node built-in https module, no extra deps):\n   - Quran/Islamic ayahs: https://api.alquran.cloud/v1/quran/quran-simple + /en.sahih — fetch ALL 6236 ayahs, insert in batches of 500\n   - Quran surahs: https://api.alquran.cloud/v1/surah — all 114\n   - Hadiths: https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/eng-bukhari.json\n   - Countries: https://restcountries.com/v3.1/all — all 195 countries with flags, capitals, currencies\n   - Recipes: https://www.themealdb.com/api/json/v1/1/search.php?s= (free, 300+ meals)\n   - Jokes: https://official-joke-api.appspot.com/jokes/ten\n   - Trivia/quiz: https://opentdb.com/api.php?amount=50&type=multiple\n   - Universities: http://universities.hipolabs.com/search?country=United+States\n   - Currencies/exchange: https://open.er-api.com/v6/latest/USD\n   - NASA APOD: https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&count=20\n   - Dog breeds: https://dog.ceo/api/breeds/list/all\n   - Pokemon: https://pokeapi.co/api/v2/pokemon?limit=151\n   - Books (Open Library): https://openlibrary.org/search.json?q=subject:fiction&limit=50\n   - Movies (no-key): https://api.tvmaze.com/shows?page=0\n\n   TIER 2 — npm data packages (add to server/package.json dependencies, then require):\n   - "quran-json": ^1.0.0  → const surahs = require("quran-json/data/surahs.json")\n   - "country-data": ^1.0.0 → const {countries} = require("country-data")\n   - "currency-codes": ^1.0.0 → const cc = require("currency-codes")\n   - "city-timezones": ^1.0.0 → city/timezone data\n   If you use an npm package, output BOTH server/seed.js AND an updated server/package.json with the package in "dependencies".\n\n   TIER 3 — Scraping with cheerio (only when Tier 1 and Tier 2 don't apply and the site has no key requirement):\n   Add "axios": "^1.6.0" and "cheerio": "^1.0.0" to server/package.json.\n   Write a fetchAndScrape(url) helper, parse the HTML, extract and clean the data.\n   Example use: scraping a public Wikipedia list, a government open-data page, or an official schedule.\n\n   TIER 4 — Hardcoded samples: ONLY for data that has no authoritative source (user reviews, admin comments, app-specific config).\n\nModels:\n${modelSchemas}\n\nOutput ONLY the file wrapped in <file path="server/seed.js">...</file>`,
        MERN_SYSTEM_PROMPT,
      )
      if (seedResp?.content) {
        const seedFile = parseAIChanges(seedResp.content)[0]
        if (seedFile?.content?.trim()) {
          // Strip any require('./models/X') for models that don't exist as generated files —
          // a hallucinated model name crashes the whole seed with "Cannot find module"
          const generatedModelNames = new Set(
            files
              .filter((f) => /^server\/models\/.+\.js$/.test(f.path.replace(/\\/g, '/')))
              .map((f) => f.path.replace(/\\/g, '/').replace('server/models/', '').replace('.js', ''))
          )
          let seedContent = seedFile.content
          seedContent = seedContent.replace(
            /^(const|let|var)\s+\w+\s*=\s*require\s*\(\s*['"]\.\/models\/(\w+)['"]\s*\)\s*;?\s*$/gm,
            (line: string, _decl: string, modelName: string) => {
              if (generatedModelNames.has(modelName)) return line
              console.warn(`[seed] removed require for missing model "${modelName}"`)
              return `// [ForgeAI] model ${modelName} not generated — skipped`
            },
          )
          // Also remove any seeding block that references a variable that was just commented out
          // (Simple heuristic: if the variable name never appears in a non-comment require, remove its insert block)
          files.push({ path: 'server/seed.js', content: seedContent })
          // Mount the seed runner in server/index.js so it auto-runs on startup
          const serverEntry = files.find((f) => f.path.replace(/\\/g, '/') === 'server/index.js')
          if (serverEntry && !serverEntry.content.includes('seed.js')) {
            // Run seed INSIDE the .then() block so it reuses the already-open
            // Mongoose connection. Running it before mongoose.connect() caused
            // seed.js to open its own connection, call mongoose.disconnect() at
            // the end, and silently kill the server's shared connection —
            // making every subsequent /api/* call return 503.
            serverEntry.content = serverEntry.content.replace(
              "    console.log('MongoDB connected')\n    app.listen",
              "    console.log('MongoDB connected')\n    // Run seed after DB connects. Awaits the promise so async API-fetch seeds complete before server starts.\n    ;(async function(){ var _d = mongoose.disconnect.bind(mongoose); mongoose.disconnect = function(){ return Promise.resolve(); }; try { var s = require('./seed'); if (s && typeof s.then === 'function') await s; else if (typeof s === 'function') await s(); } catch(e) { console.warn('Seed skipped:', e.message) } setTimeout(function(){ mongoose.disconnect = _d; }, 30000); })()\n    app.listen",
            )
          }
        }
      }
    }
  } catch (e) {
    // Seed failure never blocks the build
    console.warn('[seed] seed data generation failed (non-fatal):', e)
  }

  return { files, summary: plan.summary, adminPassword, plan }
}

// ═══ CLAUDE QA / ENHANCEMENT PASS ═════════════════════════════
// The free stack (GPT + Gemini) generates the structure; Claude then runs a
// TARGETED pass over every high-leverage file — Mongoose models, server entry
// wiring, every page component, all API route files, and CSS polish.
// Best-effort: a missing key, no credit, or a junk reply leaves the
// free-stack file untouched, so a build never fails because the enhancer
// was unavailable.

const QA_SYSTEM_PROMPT = `You are a senior full-stack engineer doing a focused QA pass on freshly generated code. Fix real bugs, wiring, routing, and data-layer issues while PRESERVING all working behaviour and every existing feature. Do not rewrite working code for style. Output the COMPLETE corrected file inside a single <file path="..."> tag and nothing else. If the file is already correct, return it unchanged.`

/** The QA/enhancement provider (Claude), or null when its key isn't configured
 *  — in which case the QA pass is skipped and the free-stack build ships as-is. */
function createEnhancer(): AIProvider | null {
  const name = process.env.ENHANCER_AI_PROVIDER
  if (!name) return null
  try {
    // resolveProvider returns the requested name only when its key is actually
    // set (placeholders like "sk-ant-..." don't count); otherwise it falls back.
    if (resolveProvider(name) !== name) return null
    return createProvider(name as ProviderName)
  } catch {
    return null
  }
}

/** Claude-for-styling on rebuild/enhance flows. When rebuilding or enhancing
 *  an imported site the styling is the whole product, so route styles.css to
 *  Claude for a boomabastic pass. Silent fallback to the main provider when
 *  ANTHROPIC_API_KEY is missing or Claude blows up — a rebuild never fails
 *  because the stylist was unavailable. */
function createStylist(fallback: AIProvider): AIProvider {
  if (resolveProvider('claude') !== 'claude') return fallback
  try {
    return createProvider('claude')
  } catch {
    return fallback
  }
}

/** Random admin password — alphanumeric, no ambiguous chars (0/O/1/l/I). */
function generateAdminPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/** Ask the enhancer to return a corrected full file. Guarded: an empty or
 *  truncated reply never overwrites the working file. Returns true if changed. */
async function claudeFix(
  enhancer: AIProvider,
  file: ParsedChange,
  instruction: string,
  context = '',
): Promise<boolean> {
  const res = await safeChat(
    enhancer,
    `${context ? context + '\n\n' : ''}Here is ${file.path}:\n\`\`\`\n${file.content}\n\`\`\`\n\n${instruction}`,
    QA_SYSTEM_PROMPT,
  )
  if (!res) return false
  const parsed = parseAIChanges(res.content)
  const fixed = parsed.find(
    (f) => f.path.replace(/\\/g, '/').toLowerCase() === file.path.replace(/\\/g, '/').toLowerCase(),
  ) ?? parsed[0]
  // Never trade a working file for an empty/truncated reply.
  if (fixed?.content && fixed.content.trim().length > Math.max(80, file.content.length * 0.5)) {
    file.content = file.path.endsWith('.jsx') ? sanitizeJsx(fixed.content) : fixed.content
    return true
  }
  return false
}

/** Send multiple files in ONE Claude call and patch back every file it returns.
 *  Far cheaper than one call per file: shared system-prompt overhead, and Claude
 *  has cross-file context so it catches consistency bugs (model vs route mismatches).
 *  Returns the count of files actually changed. */
async function claudeFixBatch(
  enhancer: AIProvider,
  files: ParsedChange[],
  instruction: string,
  context = '',
): Promise<number> {
  if (files.length === 0) return 0
  const fileBlocks = files.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join('\n\n')
  const res = await safeChat(
    enhancer,
    `${context ? context + '\n\n' : ''}${fileBlocks}\n\n${instruction}`,
    QA_SYSTEM_PROMPT,
  )
  if (!res) return 0
  const parsed = parseAIChanges(res.content)
  let changed = 0
  for (const fix of parsed) {
    const target = files.find(
      (f) => f.path.replace(/\\/g, '/').toLowerCase() === fix.path.replace(/\\/g, '/').toLowerCase(),
    )
    if (target && fix.content && fix.content.trim().length > Math.max(80, target.content.length * 0.5)) {
      target.content = fix.content
      changed++
    }
  }
  return changed
}

/** Append-only UI polish: asks for a small block of extra CSS rules (reusing
 *  the existing :root variables) and appends them — never a full rewrite. */
async function claudePolishCss(
  enhancer: AIProvider,
  files: ParsedChange[],
  cssPath: string,
  extraClasses: string,
  log: (message: string) => Promise<unknown>,
): Promise<void> {
  const css = files.find((f) => f.path.replace(/\\/g, '/') === cssPath)
  if (!css) return
  const root = css.content.match(/:root\s*{[^}]*}/)?.[0] ?? ''
  const res = await safeChat(
    enhancer,
    `This site is already fully styled from CSS variables. Its theme:\n\`\`\`css\n${root}\n\`\`\`\n\nWrite a SMALL set of ADDITIONAL CSS rules that raise visual polish — refined shadows, spacing rhythm, hover/focus transitions, responsive tweaks${extraClasses ? `, and clean styling for these classes: ${extraClasses}` : ''}. Reuse the existing CSS variables. Do NOT restyle or remove anything that already exists. Output ONLY the additional rules as <file path="additions.css">.`,
    QA_SYSTEM_PROMPT,
  )
  const add = res ? parseAIChanges(res.content)[0]?.content : undefined
  if (add && add.trim().length > 40) {
    const addStripped = stripCodeFence(add.trim()).split('\n').filter((l) => !/^\s*@import\b/.test(l)).join('\n')
    css.content += `\n/* ── Claude QA polish ── */\n${addStripped}\n`
    sanitizeCss(files, cssPath)
    await log('🎨 Claude QA — appended UI polish')
  }
}

async function runMernQA(
  enhancer: AIProvider,
  files: ParsedChange[],
  log: (message: string) => Promise<unknown>,
): Promise<void> {
  const norm = (p: string) => p.replace(/\\/g, '/')

  // ── Pass 1: entire backend in ONE call ───────────────────────────────────────
  // Sending all server files together costs far fewer tokens than N individual
  // calls and gives Claude cross-file context to catch model↔route mismatches.
  const backendFiles = files.filter((f) => /^server\//.test(norm(f.path)))
  if (backendFiles.length > 0) {
    await log(`🔍 Claude QA — reviewing ${backendFiles.length} backend files together…`)
    const n = await claudeFixBatch(
      enhancer,
      backendFiles,
      `Review these backend files as a connected system. Return <file path="...">...</file> ONLY for files you actually change — omit any file that is already correct.

MONGOOSE MODELS — fix only real bugs:
• Multi-value fields (options, items, tags, choices, images) MUST be [String] or [{…}], never plain String
• strict:false schemas with no real fields: replace with properly typed fields inferred from the model name
• Missing required:true on essential fields (name, text, title, question, email, price…)
• Date defaults: { default: Date.now } — never { default: Date.now() } (that freezes at boot)

SERVER ENTRY (server/index.js):
• express.json() must come BEFORE all route mounts
• Every *.routes.js in server/routes/ must be mounted under /api/<plural>
• MONGODB_URI and PORT from process.env with sensible fallbacks
• Static client/dist served; all non-/api/* GET routes fall back to client/dist/index.html
• Admin login route (/api/admin/login POST) must be mounted BEFORE the requireAdmin middleware

ROUTES (*.routes.js) — full CRUD only, CommonJS, module.exports router:
• GET / list, GET /:id, POST /, PUT /:id, DELETE /:id with correct Mongoose calls
• Status codes: 201 create, 400 validation, 404 not found, 500 server error
• PUT /:id and DELETE /:id must call requireAdmin — return 401 if no valid token
• POST / must ALWAYS be PUBLIC — no requireAdmin on POST, ever. Admins use the same public endpoint from the admin panel. Only PUT /:id and DELETE /:id use requireAdmin
• GET routes remain fully public (no auth)`,
    )
    await log(`✅ Backend QA — ${n} file(s) improved`)
  }

  // ── Pass 2: entire frontend in ONE call ──────────────────────────────────────
  const frontendFiles = files.filter(
    (f) => /^client\/src\//.test(norm(f.path))
      && norm(f.path) !== 'client/src/pages/Admin.jsx'
      && norm(f.path) !== 'client/src/components/ui.jsx'
      && !norm(f.path).endsWith('.css'),
  )
  if (frontendFiles.length > 0) {
    await log(`🔍 Claude QA — reviewing ${frontendFiles.length} frontend files together…`)
    const n = await claudeFixBatch(
      enhancer,
      frontendFiles,
      `Review these frontend files as a connected system. Return <file path="...">...</file> ONLY for files you actually change — omit any file that is already correct.

APP.JSX:
• Every planned page has a matching import and <Route> inside <Routes>
• /admin route must exist but must NOT appear in any <nav>, header link, or menu
• main.jsx already provides <BrowserRouter> — App.jsx must NOT wrap its own Router

PAGES — fix real bugs only, do NOT touch working UI/layout/styling:
• Remove ALL hardcoded placeholder values: "Anonymous Student", "Test User", fake IDs, fake emails, fake scores, hardcoded numbers that should come from the server
• API payloads must include every field the backend requires — if a form collects name/phone/answers, all must be in the POST body
• Never call JSON.parse() on data that already arrives from axios as a JS value (array or object)
• SECURITY — this is critical: public-facing pages (Home, Browse, Products, etc.) must NOT contain Create, Edit, or Delete buttons, admin forms, or any data-write controls. Those belong exclusively in Admin.jsx. If you find a delete button or create form on a public page, remove it — public users should only read data
• Scoring/results: send raw answers to the backend and use the server's response for the score; never calculate a score or grade client-side
• Fix broken imports; useState initial values must match data shape ([] lists, {} objects, null/'' scalars)`,
    )
    await log(`✅ Frontend QA — ${n} file(s) improved`)
  }

  // ── Pass 3: CSS polish (small append-only, unchanged) ───────────────────────
  await claudePolishCss(
    enhancer, files, 'client/src/index.css',
    '.admin, .admin-model, .admin-form, .admin-field, .admin-input, .admin-table, .admin-actions, .admin-error, .admin-row-actions',
    log,
  )
}

async function runStaticQA(
  enhancer: AIProvider,
  files: ParsedChange[],
  log: (message: string) => Promise<unknown>,
): Promise<void> {
  const norm = (p: string) => p.replace(/\\/g, '/')
  const index = files.find((f) => norm(f.path) === 'index.html')
  if (index) {
    await log('🔍 Claude QA — checking index.html structure & links…')
    await claudeFix(
      enhancer, index,
      'Fix broken internal links, malformed HTML, and obvious accessibility gaps (missing alt/aria/labels). Ensure it links styles.css and script.js. Keep all existing content and structure; only fix real issues.',
    )
  }
  await claudePolishCss(enhancer, files, 'styles.css', '', log)
}

// ═══ BUILD-TIME SELF-CHECK ════════════════════════════════════
// Deterministic guard: parse every generated JS/JSX file and auto-fix syntax
// errors BEFORE the site ships, so a broken build never reaches a user. Uses the
// already-installed TypeScript compiler as a fast JSX-aware parser (no new deps);
// if it isn't available for any reason, validation is skipped gracefully.
let _tsMod: any
function getTs(): any {
  if (_tsMod !== undefined) return _tsMod
  try { _tsMod = require('typescript') } catch { _tsMod = null }
  return _tsMod
}

/** Syntax (not type) errors in a JS/JSX source; [] if clean or parser absent. */
function jsSyntaxErrors(code: string): string[] {
  const ts = getTs()
  if (!ts) return []
  try {
    const out = ts.transpileModule(code, {
      reportDiagnostics: true,
      compilerOptions: {
        jsx: ts.JsxEmit.Preserve, allowJs: true, isolatedModules: true,
        target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
      },
    })
    return (out.diagnostics ?? [])
      .filter((d: any) => d.category === ts.DiagnosticCategory.Error)
      .map((d: any) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
  } catch { return [] }
}

/** Parse every generated JS/JSX file and auto-fix any with syntax errors —
 *  guarded so a fix is kept ONLY if it reduces the error count, and runs on the
 *  free provider so it works with no paid key. Best-effort; never throws. */
async function validateAndHeal(
  provider: AIProvider,
  files: ParsedChange[],
  log: (message: string) => Promise<unknown>,
): Promise<void> {
  for (const f of files.filter((x) => /\.(jsx|js)$/.test(x.path.replace(/\\/g, '/')))) {
    let errs = jsSyntaxErrors(f.content)
    if (!errs.length) continue
    await log(`🧪 Syntax error in ${f.path} — auto-fixing…`)
    for (let attempt = 0; attempt < 2 && errs.length; attempt++) {
      const res = await safeChat(
        provider,
        `This file has a JavaScript/JSX SYNTAX error and will not build. Errors:\n${errs.slice(0, 6).join('\n')}\n\nHere is ${f.path}:\n\`\`\`\n${f.content}\n\`\`\`\n\nReturn the COMPLETE corrected file — same functionality, valid syntax that builds — as <file path="${f.path}">…</file>.`,
        'You are a senior engineer fixing a build-breaking syntax error. Return only the complete corrected file, nothing else.',
      )
      const fixed = res
        ? (parseAIChanges(res.content).find(
            (x) => x.path.replace(/\\/g, '/').toLowerCase() === f.path.replace(/\\/g, '/').toLowerCase(),
          ) ?? parseAIChanges(res.content)[0])
        : undefined
      if (!fixed?.content || fixed.content.trim().length < 40) break
      const newErrs = jsSyntaxErrors(fixed.content)
      if (newErrs.length < errs.length) { f.content = fixed.content; errs = newErrs } else break
    }
    await log(errs.length ? `⚠️ ${f.path} may still have a syntax issue` : `✅ Auto-fixed ${f.path}`)
  }
}

async function buildSite(job: Job) {
  const { taskId, repositoryId, userId, siteName, aiProvider, stack, mongoUri, style, paletteId, importUrl, mode } = job.data
  let { prompt } = job.data
  const task = await Task.findById(taskId)
  if (!task) throw new Error('Task not found')
  const repo = await Repository.findById(repositoryId)
  if (!repo) throw new Error('Repository not found')

  const fail = async (message: string) => {
    await Repository.findByIdAndUpdate(repo._id, { status: 'error', errorMessage: message })
    await Task.findByIdAndUpdate(task._id, { status: 'failed', error: message })
    task.status = 'failed'
    task.error = message
    emitTaskUpdate(taskId, task.toObject())
  }

  try {
    await updateTask(task, { status: 'running', progress: 5 }, `🏗️ Building "${siteName}" from your description…`)

    // ── Workspace folder ──
    const sitePath = path.join(REPOS_DIR, userId, siteName)
    if (fs.existsSync(sitePath)) fs.rmSync(sitePath, { recursive: true, force: true })
    fs.mkdirSync(sitePath, { recursive: true })

    // ── Generate the site, ONE FILE PER REQUEST ──
    // Free-tier models cap output at ~8k tokens: asking for the whole site in
    // one reply truncates mid-CSS. Per-file requests keep every reply inside
    // the limit, and chatWithContinuation stitches any that still overflow.
    // The builder prefers a premium engine (BUILDER_AI_PROVIDER, e.g. kimi) when
    // its key is set, else falls back to the user's provider / the free stack.
    const provider = createProvider(
      resolveProvider(process.env.BUILDER_AI_PROVIDER ?? aiProvider),
      process.env.AGENT_AI_MODEL,
    )
    const generated: ParsedChange[] = []
    let summaryLine: string | undefined

    // Art-direct ONE distinctive identity first, reused across every file so the
    // whole site looks designed — not a per-file guess that lands on generic.
    // ── Import the brand's existing website (optional) ──
    // Rebuild from their REAL content — services, copy, contact details, colors,
    // photos — instead of AI-invented filler. Best-effort: a failed import just
    // falls back to a normal build.
    let brandBlock = ''
    let sourceProfile: Awaited<ReturnType<typeof importBrandSite>> = null
    // Set only when we actually attempted to download brand assets to disk.
    // The post-build sanity check uses this to decide whether an empty
    // `assets/` folder should fail the build — without it we would falsely
    // fail every build where the import step could not reach the source site.
    let expectedAssetsDir: string | null = null
    if (importUrl) {
      await updateTask(task, { progress: 6 }, `🔎 Reading the existing site ${importUrl}…`)
      const profile = await importBrandSite(String(importUrl))
      sourceProfile = profile
      if (profile) {
        // Download their photos INTO the repo so the finished site is
        // self-contained — it keeps working after their old host goes away.
        // (Enhance mode does its own position-preserving download later.)
        if (profile.images.length && mode !== 'enhance') {
          const isMern = stack === 'mern'
          const destDir = isMern
            ? path.join(sitePath, 'client', 'public', 'assets')
            : path.join(sitePath, 'assets')
          expectedAssetsDir = destDir
          const local = await downloadBrandImagesWithSource(profile.images, destDir, isMern ? '/assets/' : 'assets/')
          if (local.length) {
            // Rebuild images + imageMeta in lockstep so each caption/context
            // still describes the correct saved photo after downloadBrand's
            // size-based reordering. Missing meta falls back to a neutral tag.
            const sourceMetaByUrl = new Map<string, { alt: string; context: string }>()
            profile.images.forEach((u, i) => sourceMetaByUrl.set(u, profile.imageMeta[i] ?? { alt: '', context: 'content' }))
            profile.images = local.map((r) => r.localPath)
            profile.imageMeta = local.map((r) => sourceMetaByUrl.get(r.sourceUrl) ?? { alt: '', context: 'content' })
            await updateTask(task, {}, `🖼️ Saved ${local.length} of their photos into the site (self-hosted, with original section context preserved so photos land in the right place)`)
          }
        }
        brandBlock = brandProfileBlock(profile)
        prompt = `${prompt}\n\nThis is a REBUILD of an existing brand website — use the brand's real content below.\n${brandBlock}`
        await updateTask(task, {}, `✅ Imported "${profile.siteName ?? importUrl}" — ${profile.headings.length} headings, ${profile.paragraphs.length} copy blocks, ${profile.images.length} images, ${profile.colors.length} brand colors`)
        if (profile.originalCss) {
          await updateTask(task, {}, `🎯 Captured ${(profile.originalCss.length / 1000).toFixed(1)}KB of their original CSS — Claude will be told to beat it by 100%`)
        }
      } else {
        await updateTask(task, {}, `⚠️ Could not read ${importUrl} (blocked, slow, or JavaScript-only) — building from your description instead`, 'warn')
      }
    }

    await updateTask(task, { progress: 7 }, '🎨 Art-directing a visual identity…')
    // Visual direction is a planning task — Claude runs it so the identity is
    // specific and intentional, not a generic Gemini first-guess.
    const visualDirector = createEnhancer() ?? provider
    let designBrief = await buildDesignBrief(visualDirector, prompt, siteName, style)

    // ── User-chosen palette override ──
    // If the client picked a preset palette, replace the AI-generated PALETTE
    // line so colors are deterministic. VIBE, fonts, and motifs stay AI-generated.
    if (paletteId && PALETTE_PRESETS[paletteId]) {
      const preset = PALETTE_PRESETS[paletteId]
      const paletteLine = `PALETTE: ${preset.cssVars}`
      if (/^PALETTE:/m.test(designBrief)) {
        designBrief = designBrief.replace(/^PALETTE:.*$/m, paletteLine)
      } else {
        designBrief += `\n${paletteLine}`
      }
      await updateTask(task, {}, `🎨 Using "${preset.name}" color palette`)
    }

    // The brand's real facts ride in the design brief, which is injected verbatim
    // into every file generation — so every page uses their true content.
    if (brandBlock) designBrief += `\n\n${brandBlock}`

    // ── Rebuild professional-register override ──
    // For rebuilds of REAL brands, prepend an anti-flashy directive so the
    // generator doesn't default to dark themes, gradient text, glowing pills,
    // or startup-showcase treatment. Real businesses want to look like their
    // industry's best examples — a recruitment agency looks corporate,
    // a law firm looks conservative, a clinic looks reassuring. Restraint
    // reads as premium; ornament reads as amateur.
    if (importUrl) {
      designBrief = `PROFESSIONAL REGISTER — this is a REAL working business, not a startup demo:\n- Match the register of best-in-class REAL sites in this brand's category (recruitment/legal/consulting/clinic → LIGHT theme, muted professional palette, no gradient text on headings, no glowing pills, no dark cards; ecommerce/SaaS → clean and modular; only genuine luxury consumer brands get dramatic dark treatment).\n- Solid brand-color headings, NOT gradient rainbow text.\n- Subtle depth: 1px borders, soft low-opacity shadows, rounded corners 8-12px. NOT neon glow, NOT heavy gradients, NOT mesh backdrops unless the brand is deliberately artsy.\n- Copy quality is critical: use the brand's REAL copy from the SOURCE below verbatim wherever it fits, never lorem ipsum or generic AI filler. Every service, capability and claim on their current site must appear on the new one — losing content is a downgrade.\n- Every page must have SUBSTANTIAL, on-brand content — not empty sections or "coming soon" placeholders. Rich body copy, real testimonials (from source if available, or specific-sounding invented ones tied to the brand's category — never "John Doe / CEO"), meaningful section headings.\n\n${designBrief}`
    }

    // Topical, always-loading photos from Unsplash (when UNSPLASH_ACCESS_KEY is
    // set) — makes brand imagery relevant instead of generic. Falls back to
    // picsum silently when there's no key or the fetch fails.
    const photoSubjects = (designBrief.match(/PHOTO SUBJECTS:\s*(.+)/i)?.[1] ?? '')
      .split(',').map((s) => s.trim().replace(/["'.]/g, '')).filter(Boolean).slice(0, 4)
    const imagePool = await fetchImagePool(photoSubjects.length ? photoSubjects : [prompt.split(/[.,\n]/)[0].slice(0, 60)])
    if (imagePool.length) {
      designBrief += `\n\nPHOTO LIBRARY — use THESE EXACT topical photo URLs for the <img> src of every real photo on the site (pick fitting ones per section; reuse across pages as needed). They are high-res and ALWAYS load. Do NOT use picsum while this library is present:\n${imagePool.map((u, i) => `${i + 1}. ${u}`).join('\n')}`
      await updateTask(task, {}, `🖼️ Loaded ${imagePool.length} topical web photos (${photoSubjects.join(', ') || 'site topic'})`)
    }

    // ── PRD: Claude writes the content blueprint before any coding starts ──
    // Phase 1 (above): visual identity via buildDesignBrief (Gemini).
    // Phase 2 (here): page-by-page content plan with real copy via Claude.
    // This separation is what prevents "vibe-coded" generic output — Gemini
    // follows a precise script instead of inventing content from scratch.
    // Snapshot the visual design brief before PRD is appended (used in build report)
    const visualDesignBrief = designBrief

    if (!importUrl) {
      await updateTask(task, { progress: 9 }, '📋 Claude is writing the content blueprint (pages, copy, data models)…')
      const enhancer = createEnhancer()
      const contentPRD = await generateContentPRD(enhancer, provider, prompt, siteName, stack, designBrief)
      if (contentPRD) {
        designBrief += `\n\n═══ CONTENT PRD — FOLLOW THIS BLUEPRINT EXACTLY ═══\n${contentPRD}\n══════════════════════════════════════════════════`
        await updateTask(task, {}, '✅ Content blueprint ready — coding now begins')
        // Save PRD to metadata for the Build Report feature
        task.metadata = {
          ...task.metadata,
          buildReport: { ...((task.metadata as any)?.buildReport ?? {}), prd: contentPRD, designBrief: visualDesignBrief, prompt, siteName, stack },
        }
        task.markModified('metadata')
        await task.save()
      }
    }

    // When an existing site is imported (rebuild or enhance), route CSS through
    // Claude for a premium styling pass. Silent fallback to `provider` if the
    // Anthropic key is missing or Claude fails — normal generation (no
    // importUrl) is unaffected.
    const stylist = importUrl ? createStylist(provider) : undefined
    if (importUrl && stylist !== provider) {
      await updateTask(task, {}, '🎨 Claude will handle the styling on this build')
    }

    let mernAdminPwd = ''
    if (stack === 'mern') {
      await updateTask(task, { progress: 10 }, '🧱 Building a full-stack MERN app…')
      const result = await generateMernSite(provider, prompt, siteName, designBrief, (message, progress) =>
        updateTask(task, progress ? { progress } : {}, message))
      if (!result.files.some((f) => f.path === 'client/src/App.jsx')) {
        return await fail('The AI could not generate the React app shell — please try again (rephrase the description slightly).')
      }
      generated.push(...result.files)
      summaryLine = result.summary
      mernAdminPwd = result.adminPassword
      if (result.plan) {
        task.metadata = {
          ...task.metadata,
          buildReport: {
            ...((task.metadata as any)?.buildReport ?? {}),
            plan: { summary: result.plan.summary, models: result.plan.models, pages: result.plan.pages },
          },
        }
        task.markModified('metadata')
        await task.save()
      }
    } else {
      // A rebuild must out-do the site it replaces, so the generator is told
      // exactly how rich the original is (pages, imagery, its own sections).
      const result = await generateStaticSite(
        provider, prompt, siteName, designBrief, task,
        sourceProfile
          ? {
              pages: sourceProfile.pagesRead.length,
              images: sourceProfile.images.length,
              sections: sourceProfile.headings.slice(0, 12),
            }
          : undefined,
        stylist,
        sourceProfile?.originalCss,
      )
      if (!result) {
        return await fail('The AI did not produce an index.html — please try again (rephrase the description slightly).')
      }
      generated.push(...result.files)
      summaryLine = result.summary
    }

    // ── Deterministic self-check ── parse every JS/JSX file and auto-fix syntax
    // errors so a broken build never ships (runs on the free stack, always on).
    await validateAndHeal(provider, generated, (m) => updateTask(task, {}, m))

    // ── Claude QA / enhancement pass (targeted, best-effort) ──
    const enhancer = createEnhancer()
    if (enhancer) {
      await updateTask(task, {}, '✨ Claude QA pass — reviewing models, server wiring, every page, routes & database…')
      if (stack === 'mern') await runMernQA(enhancer, generated, (m) => updateTask(task, {}, m))
      else await runStaticQA(enhancer, generated, (m) => updateTask(task, {}, m))
      await updateTask(task, {}, '✅ Claude QA pass complete')
    } else {
      await updateTask(task, {}, 'ℹ️ Claude QA pass skipped (enhancer key not configured) — shipping the free-stack build')
    }

    // ── Post-QA hardening ── runs after ALL AI passes so nothing can reintroduce
    // the two most common deploy-breaking bugs: @import mid-file and a broken ui.jsx
    if (stack === 'mern') {
      // 1. @imports must be at the very top of index.css — claudePolishCss strips
      //    them from its own chunk, but run fixCssImportOrder as a final guarantee.
      fixCssImportOrder(generated)
      // 2. ui.jsx must match the deterministic scaffold — Claude QA never sees it
      //    (excluded above), but de-dupe any duplicate entries and ensure the last
      //    written copy is the scaffold's exact content.
      const uiPath = 'client/src/components/ui.jsx'
      const uiEntries = generated.filter((f) => f.path.replace(/\\/g, '/') === uiPath)
      if (uiEntries.length > 1) {
        // Multiple entries: keep only the scaffold one (first pushed)
        for (let i = generated.length - 1; i >= 0; i--) {
          if (generated[i].path.replace(/\\/g, '/') === uiPath && generated[i] !== uiEntries[0]) {
            generated.splice(i, 1)
          }
        }
      }
    }

    // ── Write everything to disk ──
    const allChanges: IFileChange[] = []
    for (const file of generated) {
      const abs = path.join(sitePath, file.path)
      if (!path.resolve(abs).startsWith(path.resolve(sitePath))) continue
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, file.content, 'utf-8')
      allChanges.push({ path: file.path, before: '', after: file.content, ...diffStats('', file.content) })
      await updateTask(task, {}, `✨ Created ${file.path} (${file.content.length} chars)`)
    }

    // ── SEO injection (static sites only) ──
    if (stack !== 'mern') {
      const htmlFiles = generated.filter((f) => f.path.endsWith('.html'))
      for (const f of htmlFiles) {
        const abs = path.join(sitePath, f.path)
        if (!fs.existsSync(abs)) continue
        let html = fs.readFileSync(abs, 'utf-8')
        const isIndex = f.path === 'index.html'

        // Canonical URL (use deploy URL if known, else relative root)
        const canonical = isIndex ? '/' : `/${f.path}`

        // Only inject if head exists and tags are missing
        if (/<head[\s>]/i.test(html) && !/<meta\s+name="description"/i.test(html)) {
          const seoTitle = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.trim()
            ?? siteName.replace(/-/g, ' ')
          const desc = `${seoTitle} — built with ForgeAI`
          const ogImage = `https://og-image.vercel.app/${encodeURIComponent(seoTitle)}.png`
          const seoBlock = `
  <!-- SEO — injected by ForgeAI -->
  <meta name="description" content="${desc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonical}">
  <!-- Open Graph -->
  <meta property="og:title" content="${seoTitle}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${ogImage}">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${seoTitle}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${ogImage}">
  <!-- JSON-LD -->
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"${seoTitle}","description":"${desc}"}</script>`
          html = html.replace(/<\/head>/i, `${seoBlock}\n</head>`)
          fs.writeFileSync(abs, html, 'utf-8')
          f.content = html
        }

        // Analytics snippet
        const analyticsProvider = (job as any).analyticsProvider
        const analyticsId = (job as any).analyticsId
        if (analyticsProvider && analyticsId && !/<\/body>/i.test(html) === false) {
          let snippet = ''
          if (analyticsProvider === 'ga') {
            snippet = `\n<!-- Google Analytics -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=${analyticsId}"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${analyticsId}');</script>`
          } else if (analyticsProvider === 'plausible') {
            snippet = `\n<!-- Plausible Analytics -->\n<script defer data-domain="${analyticsId}" src="https://plausible.io/js/script.js"></script>`
          }
          if (snippet) {
            html = html.replace(/<\/body>/i, `${snippet}\n</body>`)
            fs.writeFileSync(abs, html, 'utf-8')
            f.content = html
          }
        }
      }

      // sitemap.xml
      const pages = generated.filter((f) => f.path.endsWith('.html')).map((f) => `/${f.path}`)
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${p}</loc></url>`).join('\n')}\n</urlset>`
      fs.writeFileSync(path.join(sitePath, 'sitemap.xml'), sitemapXml, 'utf-8')
      allChanges.push({ path: 'sitemap.xml', before: '', after: sitemapXml, ...diffStats('', sitemapXml) })

      // robots.txt
      const robotsTxt = `User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n`
      fs.writeFileSync(path.join(sitePath, 'robots.txt'), robotsTxt, 'utf-8')
      allChanges.push({ path: 'robots.txt', before: '', after: robotsTxt, ...diffStats('', robotsTxt) })
    }

    // MERN: write a local .env (gitignored — never pushed to GitHub, never
    // shown in the task diff) with the connection string AND admin password.
    if (stack === 'mern') {
      const envLines = ['PORT=4000']
      if (mongoUri) envLines.push(`MONGODB_URI=${mongoUri}`)
      if (mernAdminPwd) {
        envLines.push(`ADMIN_PASSWORD=${mernAdminPwd}`)
        envLines.push(`ADMIN_JWT_SECRET=${generateAdminPassword()}${generateAdminPassword()}`) // 20-char secret
      }
      fs.writeFileSync(path.join(sitePath, '.env'), envLines.join('\n') + '\n', 'utf-8')
      const envSaved: Record<string, string> = {}
      if (mongoUri) envSaved.MONGODB_URI = mongoUri
      if (mernAdminPwd) envSaved.ADMIN_PASSWORD = mernAdminPwd
      repo.set('builderEnv', envSaved)
      if (mongoUri) await updateTask(task, {}, '🔐 MongoDB connection string saved to .env (kept out of git)')
      if (mernAdminPwd) {
        await updateTask(task, {}, `🔑 Admin panel password: ${mernAdminPwd}  ← save this, it is shown only once. Access /admin directly (not linked from the public site).`)
      }
    }

    // ── Deploy safety-net ── every file that appeared in `generated` must
    // still be on disk here, and if enhance mode ran, the assets/ folder it
    // wrote directly (their downloaded scripts/stylesheets) has to be there
    // too. Silent misses are what shipped a site with a 404 styles.css and no
    // assets/ — one blank page on mobile. Fail LOUDLY instead so the next
    // build tells us straight away rather than after a Render deploy.
    const missing: string[] = []
    for (const file of generated) {
      const abs = path.join(sitePath, file.path)
      if (!fs.existsSync(abs)) missing.push(file.path)
    }
    // Only fail on an empty assets/ when we ACTUALLY tried to populate it —
    // i.e. the source site was reachable AND had images to save. A blocked/
    // JavaScript-only source (importBrandSite → null) means we fell back to
    // description-mode and nothing was ever supposed to land in assets/.
    if (expectedAssetsDir && (!fs.existsSync(expectedAssetsDir) || fs.readdirSync(expectedAssetsDir).length === 0)) {
      const rel = path.relative(sitePath, expectedAssetsDir).replace(/\\/g, '/') || 'assets'
      missing.push(`${rel}/ (empty or missing — downloaded scripts/stylesheets never landed)`)
    }
    if (missing.length) {
      await updateTask(task, {}, `❌ Deploy would ship broken — missing files: ${missing.join(', ')}`, 'error')
      return await fail(`Build wrote files that vanished before commit: ${missing.join(', ')}. This is a ForgeAI bug, not your input — please try again.`)
    }

    // ── Local git history ──
    await updateTask(task, { progress: 55 }, '📦 Initializing git repository…')
    const git = simpleGit(sitePath).env(gitEnv())
    await git.init()
    await git.addConfig('user.name', 'ForgeAI')
    await git.addConfig('user.email', 'bot@forgeai.dev')
    await git.checkout(['-B', 'main'])
    // Belt-and-suspenders: force-add so ANY parent .gitignore in REPOS_DIR
    // (e.g. a user's global "assets/") cannot silently skip files.
    await git.add(['-A', '-f', '.'])
    // Verify styles.css and index.html actually landed in the index, not just
    // on disk. If they're missing here, git has ignored them for some reason
    // and the deploy would 404 — fail loud instead of pushing a broken repo.
    const staged = (await git.raw(['ls-files']).catch(() => '')).split(/\r?\n/).filter(Boolean)
    const critical = generated.map((f) => f.path.replace(/\\/g, '/'))
    const notStaged = critical.filter((p) => !staged.includes(p))
    if (notStaged.length) {
      await updateTask(task, {}, `❌ Git did not stage: ${notStaged.join(', ')} — probably ignored by a .gitignore`, 'error')
      return await fail(`Git refused to stage: ${notStaged.join(', ')}. Check for a .gitignore excluding these paths.`)
    }
    await git.commit(`ForgeAI Builder: ${siteName} — initial site`)

    repo.localPath = sitePath
    repo.defaultBranch = 'main'
    await repo.save()

    // ── Create the GitHub repo and push ──
    let pushedFullName: string | null = null
    const fullUser = await User.findById(userId).select('+githubAccessToken')
    if (fullUser?.githubAccessToken) {
      await updateTask(task, { progress: 70 }, '🐙 Creating GitHub repository…')
      const headers = { Authorization: `token ${fullUser.githubAccessToken}`, Accept: 'application/vnd.github+json' }
      let ghRepo: any
      let githubAuthFailed = false
      const baseSlug = siteName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site'
      // Second attempt uses a completely fresh prefix so it never collides even if baseSlug is reserved/deleted on GitHub
      const uniqueFallback = `fg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const namesToTry = [baseSlug, uniqueFallback]
      for (const name of namesToTry) {
        try {
          const { data } = await axios.post('https://api.github.com/user/repos', {
            name,
            description: `Built with ForgeAI Builder: ${String(prompt).slice(0, 120)}`,
            private: false,
            auto_init: false,
          }, { headers })
          ghRepo = data
          break
        } catch (err: any) {
          const status = err.response?.status
          if (status === 401 || status === 403) { githubAuthFailed = true; break }
          if (status !== 422) throw err
          const ghMsg = err.response?.data?.message ?? 'name conflict'
          await updateTask(task, {}, `Repository name "${name}" unavailable (${ghMsg}) — trying with unique name…`, 'warn')
        }
      }

      if (githubAuthFailed) {
        await updateTask(task, {}, 'GitHub token has expired or lacks repo permissions — site generated locally. Reconnect GitHub in Settings → GitHub to push it.', 'warn')
      } else if (!ghRepo) {
        // All 10 attempts failed — warn and continue (don't kill the whole build)
        await updateTask(task, {}, '⚠️ Could not create a GitHub repo (all name attempts taken). Site is saved locally — use Deploy to push it, or regenerate with a different name.', 'warn')
      } else if (!ghRepo.full_name?.includes('/')) {
        await updateTask(task, {}, `GitHub returned an unexpected repo structure (full_name="${ghRepo.full_name}") — site saved locally only.`, 'warn')
      } else {
        await updateTask(task, { progress: 82 }, `⬆️ Pushing code to ${ghRepo.full_name}…`)
        // Store the token-authenticated remote but never expose it in task logs
        const authRemote = `https://${fullUser.githubAccessToken}@github.com/${ghRepo.full_name}.git`
        try {
          await git.push([authRemote, 'main:main'])
          // Store origin WITHOUT the token so the URL is safe to display
          await git.addRemote('origin', `https://github.com/${ghRepo.full_name}.git`).catch(() => {})
          pushedFullName = ghRepo.full_name
          repo.githubId = ghRepo.id
          repo.fullName = ghRepo.full_name
          repo.name = ghRepo.name
          repo.cloneUrl = ghRepo.clone_url
          repo.private = false
          await repo.save()
          await updateTask(task, {}, `✅ Live on GitHub: https://github.com/${ghRepo.full_name}`)
        } catch (pushErr: any) {
          // Push failed — delete the empty GitHub repo so it doesn't block future attempts
          await axios.delete(`https://api.github.com/repos/${ghRepo.full_name}`, { headers }).catch(() => {})
          await updateTask(task, {}, `GitHub push failed: ${pushErr.message.replace(/https?:\/\/[^@]+@/g, 'https://')} — empty GitHub repo cleaned up. Site saved locally.`, 'warn')
        }
      }
    } else {
      await updateTask(task, {}, 'GitHub token missing — site generated locally but not pushed. Sign in with GitHub to enable pushing.', 'warn')
    }

    await Repository.findByIdAndUpdate(repo._id, { status: 'ready' })

    task.changes = allChanges
    task.status = 'completed'
    task.progress = 100
    task.summary = [
      `## 🎉 Your website is ready`,
      '',
      summaryLine ? `${summaryLine}` : `Generated ${allChanges.length} file(s) for "${siteName}".`,
      '',
      pushedFullName ? `**GitHub repo:** [${pushedFullName}](https://github.com/${pushedFullName}) (public)` : '_Not pushed to GitHub (no token on file)._',
      ...(stack === 'mern'
        ? ['', mongoUri
            ? '**Run locally:** `npm install && npm run build && npm start` (see README.md). Your MongoDB connection string is already wired into `.env` and will be applied on deploy.'
            : '**Run locally:** `npm install && npm run build && npm start` (see README.md). The site works as-is; to enable the API, set `MONGODB_URI` in `.env` — a free MongoDB Atlas cluster works.']
        : []),
      '',
      `Next: open the workspace to refine it with the Agent, or hit **Deploy** to put it live.`,
    ].join('\n')
    await task.save()
    emitTaskUpdate(taskId, task.toObject())
  } catch (err: any) {
    console.error('[builder]', err.response?.data ?? err.message)
    await fail(`Build failed: ${providerErrorMessage(err)}`)
  }
}
