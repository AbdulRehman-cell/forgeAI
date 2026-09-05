import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { resolveTeamOwner, getEffectiveUserId } from '../../middleware/teamContext.middleware'
import { Repository } from './repository.model'
import { Task } from '../tasks/task.model'
import { enqueueJob } from '../../lib/workers'
import axios from 'axios'
import path from 'path'
import fs from 'fs'

const router = Router()
router.use(requireAuth)
router.use(resolveTeamOwner)


// ─── Import ───────────────────────────────────────────────
router.post('/import', async (req, res) => {
  const user = req.user as any
  const { githubId, fullName, name, description, language, private: isPrivate, defaultBranch, cloneUrl } = req.body

  const existing = await Repository.findOne({ userId: getEffectiveUserId(req), githubId })
  if (existing) return res.status(409).json({ message: 'Repository already imported' })

  const repo = await Repository.create({
    userId: getEffectiveUserId(req), githubId, fullName, name, description,
    language, private: isPrivate, defaultBranch, cloneUrl, status: 'cloning',
  })

  await enqueueJob('clone-repo', {
    repositoryId: repo._id.toString(),
    userId: getEffectiveUserId(req).toString(),
    cloneUrl,
    type: 'clone_repo',
  })

  res.status(201).json({ repository: repo })
})


const REPOS_DIR = process.env.REPOS_DIR ?? path.join(process.cwd(), 'repos')
const IGNORE_DIRS = new Set(['node_modules', '.git', '__pycache__', 'dist', 'build', '.next', 'venv', '.venv', 'coverage', '.turbo'])

// ─── List ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const ownerId = getEffectiveUserId(req)
  console.log('[repository] List repositories for user:', ownerId)
  const repositories = await Repository.find({ userId: ownerId }).sort({ updatedAt: -1 })
  res.json({ repositories })
})

// ─── Get one ──────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const ownerId = getEffectiveUserId(req)
  const repository = await Repository.findOne({ _id: req.params.id, userId: ownerId })
  if (!repository) return res.status(404).json({ message: 'Not found' })
  res.json({ repository })
})

// ─── File tree — Python service with local fs fallback ────
router.get('/:id/tree', async (req, res) => {
  const repo = await Repository.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo || !repo.localPath) return res.status(404).json({ message: 'Not found or not cloned' })

  // Try Python service first
  try {
    const { data } = await axios.get(`${process.env.PYTHON_SERVICE_URL}/repo/tree`, {
      params: { path: repo.localPath },
      timeout: 4000,
    })
    return res.json(data)
  } catch {
    // Fall through to local scan
  }

  // Local fs fallback — works without Python service
  function scanDir(dir: string, root: string, depth = 0): any[] {
    if (depth > 8) return []
    let items: fs.Dirent[]
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }

    const sorted = items.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    const entries: any[] = []
    for (const item of sorted) {
      if (item.name.startsWith('.') && item.name !== '.env.example') continue
      if (IGNORE_DIRS.has(item.name)) continue
      const fullPath = path.join(dir, item.name)
      const relPath = path.relative(root, fullPath)
      if (item.isDirectory()) {
        entries.push({
          name: item.name, path: relPath, type: 'directory',
          children: scanDir(fullPath, root, depth + 1),
        })
      } else {
        let size = 0
        try { size = fs.statSync(fullPath).size } catch {}
        entries.push({ name: item.name, path: relPath, type: 'file', size })
      }
    }
    return entries
  }

  const tree = scanDir(repo.localPath, repo.localPath)
  res.json({ tree })
})

// ─── File content ─────────────────────────────────────────
router.get('/:id/file', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo || !repo.localPath) return res.status(404).json({ message: 'Not found' })

  const requestedPath = (req.query.path as string) ?? ''
  if (!requestedPath) return res.status(400).json({ message: 'path query param required' })

  const filePath = path.resolve(repo.localPath, requestedPath)

  // Security: prevent path traversal
  if (!filePath.startsWith(path.resolve(repo.localPath))) {
    return res.status(403).json({ message: 'Forbidden' })
  }

  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found' })

  const stat = fs.statSync(filePath)
  if (stat.size > 2_000_000) return res.status(413).json({ message: 'File too large to display (>2MB)' })

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    res.json({ content })
  } catch {
    res.status(500).json({ message: 'Could not read file' })
  }
})

// ─── Dependency graph ─────────────────────────────────────
router.get('/:id/graph', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo || !repo.localPath) return res.status(404).json({ message: 'Not found or not cloned' })
  try {
    const { data } = await axios.post(`${process.env.PYTHON_SERVICE_URL ?? 'http://localhost:5001'}/repo/dependencies`, {
      path: repo.localPath,
    }, { timeout: 30_000 })
    return res.json(data)
  } catch (err: any) {
    return res.status(503).json({ message: 'Graph service unavailable', detail: err.message })
  }
})

// ─── Impact analysis ──────────────────────────────────────
router.get('/:id/impact', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo || !repo.localPath) return res.status(404).json({ message: 'Not found or not cloned' })
  const targetFile = req.query.file as string
  if (!targetFile) return res.status(400).json({ message: 'file query param required' })
  try {
    const { data } = await axios.post(`${process.env.PYTHON_SERVICE_URL ?? 'http://localhost:5001'}/repo/impact`, {
      path: repo.localPath,
      file: targetFile,
    }, { timeout: 30_000 })
    return res.json(data)
  } catch (err: any) {
    return res.status(503).json({ message: 'Impact service unavailable', detail: err.message })
  }
})

// ─── Cross-repo code search ───────────────────────────────
router.get('/search/code', async (req, res) => {
  const user = req.user as any
  const query = (req.query.q as string ?? '').trim()
  if (!query || query.length < 2) return res.status(400).json({ message: 'q must be >= 2 chars' })

  const repos = await Repository.find({ userId: getEffectiveUserId(req), status: 'ready' }).lean()
  const allResults: any[] = []

  await Promise.all(
    repos.filter((r) => r.localPath).slice(0, 10).map(async (repo) => {
      try {
        const { data } = await axios.post(
          `${process.env.PYTHON_SERVICE_URL ?? 'http://localhost:5001'}/repo/search`,
          { path: repo.localPath, query },
          { timeout: 10_000 },
        )
        for (const hit of data.results ?? []) {
          allResults.push({ ...hit, repoId: repo._id, repoName: repo.name, repoFullName: repo.fullName })
        }
      } catch { /* skip unreachable repos */ }
    }),
  )

  res.json({ results: allResults.slice(0, 120), query })
})

// ─── Generate / get shareable report token ───────────────
router.post('/:id/share', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Not found' })

  if (!repo.shareToken) {
    repo.shareToken = require('crypto').randomUUID()
    await repo.save()
  }

  const shareUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/share/${repo.shareToken}`
  res.json({ token: repo.shareToken, shareUrl })
})

// ─── Client Approval Workflow ─────────────────────────────
/** Generate (or re-send) an approval link for the client */
router.post('/:id/approval', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Not found' })

  if (!repo.approvalToken) {
    repo.approvalToken = require('crypto').randomUUID()
  }
  repo.approvalStatus = 'pending'
  await repo.save()

  const approvalUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/approve/${repo.approvalToken}`
  res.json({ token: repo.approvalToken, approvalUrl, status: repo.approvalStatus })
})

/** Get approval status */
router.get('/:id/approval', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Not found' })
  res.json({
    status: repo.approvalStatus ?? null,
    token: repo.approvalToken ?? null,
    approvedAt: repo.approvedAt ?? null,
    note: repo.approvalNote ?? null,
    approvalUrl: repo.approvalToken
      ? `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/approve/${repo.approvalToken}`
      : null,
  })
})

// ─── Maintenance Mode Toggle ──────────────────────────────
router.post('/:id/maintenance', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Not found' })

  const { enabled } = req.body
  repo.maintenanceMode = Boolean(enabled)

  // Inject / remove the coming-soon page in the repo folder
  if (repo.localPath && fs.existsSync(repo.localPath)) {
    const csPath = path.join(repo.localPath, '_maintenance.html')
    if (repo.maintenanceMode) {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Coming Soon</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#0f0f13;font-family:'Inter',sans-serif;color:#fff}
    .card{text-align:center;padding:3rem 2rem;max-width:480px}
    h1{font-size:2.5rem;font-weight:700;background:linear-gradient(135deg,#6366f1,#8b5cf6);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:1rem}
    p{color:#a1a1aa;line-height:1.7;font-size:1.05rem}
    .dot{display:inline-block;width:8px;height:8px;border-radius:50%;
      background:#6366f1;animation:pulse 1.5s ease-in-out infinite}
    .dot:nth-child(2){animation-delay:.3s}.dot:nth-child(3){animation-delay:.6s}
    .dots{margin-top:2rem;display:flex;justify-content:center;gap:8px}
    @keyframes pulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
  </style>
</head>
<body>
  <div class="card">
    <h1>Coming Soon</h1>
    <p>We're working on something great. Check back shortly.</p>
    <div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
  </div>
</body>
</html>`
      fs.writeFileSync(csPath, html, 'utf-8')
    } else {
      if (fs.existsSync(csPath)) fs.unlinkSync(csPath)
    }
  }

  await repo.save()
  res.json({ maintenanceMode: repo.maintenanceMode })
})

// ─── Page Speed Score (Google PageSpeed Insights) ─────────
router.get('/:id/speed-score', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Not found' })

  const deployUrl = (repo as any).deployState?.render?.url
  const importUrl = req.query.importUrl as string | undefined

  const scoreUrl = async (url: string) => {
    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=seo&category=accessibility`
    try {
      const { data } = await axios.get(endpoint, { timeout: 30_000 })
      const cats = data.lighthouseResult?.categories ?? {}
      return {
        performance: Math.round((cats.performance?.score ?? 0) * 100),
        seo: Math.round((cats.seo?.score ?? 0) * 100),
        accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
        lcp: data.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue,
        fcp: data.lighthouseResult?.audits?.['first-contentful-paint']?.displayValue,
        cls: data.lighthouseResult?.audits?.['cumulative-layout-shift']?.displayValue,
      }
    } catch {
      return null
    }
  }

  const [before, after] = await Promise.all([
    importUrl ? scoreUrl(importUrl) : Promise.resolve(null),
    deployUrl ? scoreUrl(deployUrl) : Promise.resolve(null),
  ])

  res.json({ before, after, deployUrl, importUrl })
})

// ─── Maintenance Plan ─────────────────────────────────────
router.post('/:id/maintenance-plan', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Not found' })
  if (!['pro', 'team'].includes((await import('../users/user.model')).User.prototype.plan)) {
    // re-fetch user plan
  }

  const { active } = req.body
  if (!repo.maintenancePlan) repo.maintenancePlan = { active: false }
  repo.maintenancePlan.active = Boolean(active)
  if (active) {
    // Schedule next run 30 days from now
    const next = new Date()
    next.setDate(next.getDate() + 30)
    repo.maintenancePlan.nextRunAt = next
  } else {
    repo.maintenancePlan.nextRunAt = undefined
  }
  await repo.save()
  res.json({ maintenancePlan: repo.maintenancePlan })
})

// ─── Env vars (saved to builderEnv, applied on next Blitz Deploy) ────────────
router.put('/:id/env-vars', async (req, res) => {
  const { raw } = req.body
  if (typeof raw !== 'string') return res.status(400).json({ message: 'raw (string) is required' })

  const parsed: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key) parsed[key] = val
  }

  const repo = await Repository.findOne({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })

  await Repository.findByIdAndUpdate(repo._id, { builderEnv: parsed })
  res.json({ savedKeys: Object.keys(parsed) })
})

// ─── Delete ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOneAndDelete({ _id: req.params.id, userId: getEffectiveUserId(req) })
  if (!repo) return res.status(404).json({ message: 'Not found' })

  // Clean up local clone — NEVER for local workspaces: localPath is the
  // user's actual project folder, not a clone we own
  if (repo.source !== 'local' && repo.localPath && fs.existsSync(repo.localPath)) {
    try { fs.rmSync(repo.localPath, { recursive: true, force: true }) } catch {}
  }

  // Drop the repo's task history so it doesn't show up orphaned
  await Task.deleteMany({ repositoryId: repo._id, userId: getEffectiveUserId(req) }).catch(() => {})

  res.json({ message: 'Deleted' })
})

export default router