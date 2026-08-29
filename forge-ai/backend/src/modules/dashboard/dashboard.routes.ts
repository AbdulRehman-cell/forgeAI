import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../../middleware/auth.middleware'
import { UPLOADS_DIR } from '../uploads/upload.routes'
import { Task } from '../tasks/task.model'
import { Repository } from '../repository/repository.model'
import { enqueueJob } from '../../lib/workers'
import { ingest } from './ingest'
import { buildSchemaReport } from './profile/schemaReport'
import { cleanTable, type CleaningConfig } from './clean'
import { computeMetrics, type MetricsConfig } from './metrics'
import { createProvider, resolveProvider, geminiKey } from '../ai/ai.factory'
import { extractSpreadsheetId } from './sources/googleSheets'
import oauthRoutes from './sources/oauth.routes'
import { validateCron } from './refresh/scheduler'
import { VERTICALS } from './verticals'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const ALLOWED_MIMES = new Set([
  'text/csv', 'application/csv', 'text/plain', 'text/x-csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/octet-stream',
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
    if (ALLOWED_MIMES.has(file.mimetype) || ext === 'csv' || ext === 'xlsx' || ext === 'xls') cb(null, true)
    else cb(new Error(`Unsupported file type: ${file.mimetype} (${file.originalname}). Upload a .csv or .xlsx.`))
  },
})

const router = Router()

// OAuth routes are unauthenticated on the callback side but authenticated on
// start — mount before requireAuth so /callback works for the popup.
router.use('/oauth', oauthRoutes)

// Public metadata — the frontend picker needs these before login sometimes.
router.get('/verticals', (_, res) => {
  res.json(VERTICALS.map((v) => ({ kind: v.kind, name: v.name, description: v.description, icon: v.icon, suggestedTheme: v.suggestedTheme })))
})

router.use(requireAuth)

// ─────────────────────────────────────────────────────────────
// Synchronous endpoints (no persistence) — for interactive preview
// ─────────────────────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ message: 'No file uploaded (field name: "file")' })
  try {
    const table = ingest(file.buffer, file.originalname, file.mimetype)
    res.status(200).json(buildSchemaReport(table))
  } catch (err: any) {
    res.status(400).json({ message: err?.message ?? 'Failed to profile the uploaded file' })
  }
})

router.post('/clean', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ message: 'No file uploaded' })
  const combined = parseConfig(req.body?.config)
  try {
    const table = ingest(file.buffer, file.originalname, file.mimetype)
    const schema = buildSchemaReport(table)
    const cleaning = cleanTable(table, schema, combined.cleaning ?? {})
    res.status(200).json({
      schema,
      cleaning: {
        changelog: cleaning.changelog,
        humanChangelog: cleaning.humanChangelog,
        currencyDecisions: cleaning.currencyDecisions,
        stats: cleaning.stats,
        previewRows: cleaning.cleanedRows.slice(0, 100),
        totalCleanedRows: cleaning.cleanedRows.length,
      },
    })
  } catch (err: any) { res.status(400).json({ message: err?.message ?? 'Failed to clean' }) }
})

router.post('/metrics', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ message: 'No file uploaded' })
  const combined = parseConfig(req.body?.config)
  try {
    const table = ingest(file.buffer, file.originalname, file.mimetype)
    const schema = buildSchemaReport(table)
    const cleaning = cleanTable(table, schema, combined.cleaning ?? {})
    let provider = null
    try {
      const name = resolveProvider(process.env.DEFAULT_AI_PROVIDER ?? (geminiKey() ? 'gemini' : 'github'))
      provider = createProvider(name)
    } catch { /* skipped */ }
    const result = await computeMetrics(schema, cleaning, provider, combined.metrics ?? {})
    res.status(200).json({
      schema,
      cleaning: {
        changelog: cleaning.changelog, humanChangelog: cleaning.humanChangelog,
        currencyDecisions: cleaning.currencyDecisions, stats: cleaning.stats,
      },
      metrics: result,
    })
  } catch (err: any) { res.status(400).json({ message: err?.message ?? 'Failed' }) }
})

// ─────────────────────────────────────────────────────────────
// Persistent builds — creates Task + Repository, returns 201
// ─────────────────────────────────────────────────────────────

/** POST /api/dashboard/build (file upload → dashboard). Accepts either
 *  `file` (single) or `files` (multiple). Multiple files with matching header
 *  sets are merged and get a _source_file marker column for grouping. */
router.post(
  '/build',
  (req, res, next) => {
    // Support BOTH single (`file`) and multi (`files[]`) field names in one endpoint.
    upload.any()(req, res, next)
  },
  async (req, res) => {
    const user = req.user as any
    const uploaded = (req.files as Express.Multer.File[] | undefined) ?? []
    if (!uploaded.length) return res.status(400).json({ message: 'No files uploaded (field name: "file" or "files")' })
    if (uploaded.length > 20) return res.status(400).json({ message: `Too many files (${uploaded.length}). Max 20 per dashboard.` })

    const dashboardName = normalizeName(req.body?.name)
    if (!dashboardName) return res.status(400).json({ message: 'Name must contain letters or numbers.' })
    const combined = parseConfig(req.body?.config)

    // Sanity-parse each file so a broken one gets caught synchronously.
    for (const f of uploaded) {
      try { ingest(f.buffer, f.originalname, f.mimetype) }
      catch (err: any) { return res.status(400).json({ message: `File "${f.originalname}": ${err?.message ?? 'could not read'}` }) }
    }

    // Stage every buffer to disk so the async job can re-read them.
    const stagedDir = path.join(UPLOADS_DIR, user._id.toString(), 'data')
    fs.mkdirSync(stagedDir, { recursive: true })
    const filesConfig = uploaded.map((f) => {
      const ext = (f.originalname.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'bin').toLowerCase()
      const uploadPath = path.join(stagedDir, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`)
      fs.writeFileSync(uploadPath, f.buffer)
      return { uploadPath, originalFilename: f.originalname, mimeType: f.mimetype }
    })

    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 2000) : undefined
    const vertical = typeof req.body?.vertical === 'string' ? req.body.vertical : undefined
    const repo = await createOrReuseRepo(user._id, dashboardName, {
      kind: 'upload',
      config: filesConfig.length === 1
        ? { uploadPath: filesConfig[0].uploadPath, originalFilename: filesConfig[0].originalFilename, mimeType: filesConfig[0].mimeType }
        : { files: filesConfig },
    }, prompt, vertical)
    const task = await createBuildTask(user._id, repo._id, dashboardName, {
      filenames: filesConfig.map((f) => f.originalFilename),
      totalBytes: uploaded.reduce((s, f) => s + f.size, 0),
      hasPrompt: !!prompt,
      fileCount: filesConfig.length,
    })

    await enqueueJob('build-dashboard', {
      taskId: task._id.toString(), repositoryId: repo._id.toString(),
      userId: user._id.toString(), dashboardName,
      cleaningConfig: combined.cleaning, metricsConfig: combined.metrics,
    })
    res.status(201).json({ taskId: task._id.toString(), repositoryId: repo._id.toString(), dashboardName, fileCount: filesConfig.length })
  },
)

/** POST /api/dashboard/build-from-sheet */
router.post('/build-from-sheet', async (req, res) => {
  const user = req.user as any
  const { url, spreadsheetId, sheetName, range, name, config } = req.body ?? {}
  const dashboardName = normalizeName(name)
  if (!dashboardName) return res.status(400).json({ message: 'name required' })
  const id = spreadsheetId ?? (url ? extractSpreadsheetId(String(url)) : null)
  if (!id) return res.status(400).json({ message: 'Provide a Google Sheets url or spreadsheetId' })
  const combined = parseConfig(config)

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 2000) : undefined
  const vertical = typeof req.body?.vertical === 'string' ? req.body.vertical : undefined
  const repo = await createOrReuseRepo(user._id, dashboardName, {
    kind: 'google_sheet',
    config: { spreadsheetId: id, sheetName, range, url },
  }, prompt, vertical)
  const task = await createBuildTask(user._id, repo._id, dashboardName, { source: 'google_sheet', spreadsheetId: id, hasPrompt: !!prompt })

  await enqueueJob('build-dashboard', {
    taskId: task._id.toString(), repositoryId: repo._id.toString(),
    userId: user._id.toString(), dashboardName,
    cleaningConfig: combined.cleaning, metricsConfig: combined.metrics,
  })
  res.status(201).json({ taskId: task._id.toString(), repositoryId: repo._id.toString(), dashboardName })
})

/** POST /api/dashboard/build-from-stripe */
router.post('/build-from-stripe', async (req, res) => {
  const user = req.user as any
  const { name, config, include, windowDays } = req.body ?? {}
  const dashboardName = normalizeName(name)
  if (!dashboardName) return res.status(400).json({ message: 'name required' })
  const combined = parseConfig(config)

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 2000) : undefined
  const vertical = typeof req.body?.vertical === 'string' ? req.body.vertical : undefined
  const repo = await createOrReuseRepo(user._id, dashboardName, {
    kind: 'stripe',
    config: { include: include ?? 'both', windowDays: windowDays ?? 90 },
  }, prompt, vertical)
  const task = await createBuildTask(user._id, repo._id, dashboardName, { source: 'stripe', hasPrompt: !!prompt })

  await enqueueJob('build-dashboard', {
    taskId: task._id.toString(), repositoryId: repo._id.toString(),
    userId: user._id.toString(), dashboardName,
    cleaningConfig: combined.cleaning, metricsConfig: combined.metrics,
  })
  res.status(201).json({ taskId: task._id.toString(), repositoryId: repo._id.toString(), dashboardName })
})

/** POST /api/dashboard/:repositoryId/refresh — manual re-fetch + rebuild. */
router.post('/:repositoryId/refresh', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.repositoryId, userId: user._id })
  if (!repo || repo.source !== 'data') return res.status(404).json({ message: 'Dashboard not found' })
  if (!repo.dashboardSource) return res.status(400).json({ message: 'No source configured' })

  const task = await createBuildTask(user._id, repo._id, repo.name, { source: repo.dashboardSource.kind, trigger: 'manual' })
  await enqueueJob('build-dashboard', {
    taskId: task._id.toString(), repositoryId: repo._id.toString(),
    userId: user._id.toString(), dashboardName: repo.name,
  })
  res.status(202).json({ taskId: task._id.toString() })
})

/** PATCH /api/dashboard/:repositoryId/schedule — set/clear refreshCron. */
router.patch('/:repositoryId/schedule', async (req, res) => {
  const user = req.user as any
  const { cron } = req.body ?? {}
  const cronValue: string | null = cron === null || cron === '' ? null : String(cron)
  if (cronValue && !validateCron(cronValue)) {
    return res.status(400).json({ message: `Invalid cron expression: "${cronValue}"` })
  }
  const repo = await Repository.findOne({ _id: req.params.repositoryId, userId: user._id })
  if (!repo || repo.source !== 'data' || !repo.dashboardSource) {
    return res.status(404).json({ message: 'Dashboard not found' })
  }
  repo.dashboardSource.refreshCron = cronValue
  await repo.save()
  res.json({ refreshCron: cronValue })
})

/** PATCH /api/dashboard/:repositoryId/theme — dark | exec. Refresh applies. */
router.patch('/:repositoryId/theme', async (req, res) => {
  const user = req.user as any
  const theme = req.body?.theme
  if (theme !== 'dark' && theme !== 'exec') return res.status(400).json({ message: 'theme must be "dark" or "exec"' })
  const repo = await Repository.findOne({ _id: req.params.repositoryId, userId: user._id })
  if (!repo || repo.source !== 'data' || !repo.dashboardSource) return res.status(404).json({ message: 'Dashboard not found' })
  repo.dashboardSource.theme = theme
  await repo.save()
  res.json({ theme })
})

/** PATCH /api/dashboard/:repositoryId/prompt — update the requirements text.
 *  Does NOT rebuild — the client must POST /refresh to apply the new prompt. */
router.patch('/:repositoryId/prompt', async (req, res) => {
  const user = req.user as any
  const promptRaw = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 2000) : ''
  const repo = await Repository.findOne({ _id: req.params.repositoryId, userId: user._id })
  if (!repo || repo.source !== 'data' || !repo.dashboardSource) {
    return res.status(404).json({ message: 'Dashboard not found' })
  }
  repo.dashboardSource.userPrompt = promptRaw || undefined
  await repo.save()
  res.json({ userPrompt: repo.dashboardSource.userPrompt })
})

/** GET /api/dashboard — list this user's dashboards */
router.get('/', async (req, res) => {
  const user = req.user as any
  const repos = await Repository.find({ userId: user._id, source: 'data' }).sort({ updatedAt: -1 }).lean()
  res.json(repos.map((r) => ({
    id: r._id, name: r.name, status: r.status, errorMessage: r.errorMessage,
    dashboardSource: r.dashboardSource ? { kind: r.dashboardSource.kind, refreshCron: r.dashboardSource.refreshCron, lastRefreshAt: r.dashboardSource.lastRefreshAt, lastBuild: r.dashboardSource.lastBuild, userPrompt: r.dashboardSource.userPrompt, theme: r.dashboardSource.theme ?? 'dark', vertical: r.dashboardSource.vertical ?? 'general' } : null,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
    hostedUrl: `/dashboards/${user._id.toString()}/${r.name}/index.html`,
  })))
})

/** GET /api/dashboard/:repositoryId */
router.get('/:repositoryId', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.repositoryId, userId: user._id, source: 'data' }).lean()
  if (!repo) return res.status(404).json({ message: 'Dashboard not found' })
  res.json({
    id: repo._id, name: repo.name, status: repo.status, errorMessage: repo.errorMessage,
    dashboardSource: repo.dashboardSource ? { kind: repo.dashboardSource.kind, refreshCron: repo.dashboardSource.refreshCron, lastRefreshAt: repo.dashboardSource.lastRefreshAt, lastBuild: repo.dashboardSource.lastBuild } : null,
    hostedUrl: `/dashboards/${user._id.toString()}/${repo.name}/index.html`,
  })
})

/** DELETE /api/dashboard/:repositoryId */
router.delete('/:repositoryId', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.repositoryId, userId: user._id, source: 'data' })
  if (!repo) return res.status(404).json({ message: 'Not found' })
  const REPOS_DIR = process.env.REPOS_DIR ?? path.join(process.cwd(), 'repos')
  const dir = path.join(REPOS_DIR, user._id.toString(), repo.name)
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* fine */ }
  await Repository.deleteOne({ _id: repo._id })
  res.json({ deleted: true })
})

// ─────────────────────────────────────────────────────────────

function parseConfig(raw: any): { cleaning?: CleaningConfig; metrics?: MetricsConfig } {
  if (raw && typeof raw === 'object') return raw
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return {}
}

function normalizeName(raw: any): string {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
  return s
}

async function createOrReuseRepo(
  userId: any,
  name: string,
  source: { kind: 'upload' | 'google_sheet' | 'stripe'; config: Record<string, any> },
  userPrompt?: string,
  vertical?: string,
) {
  const existing = await Repository.findOne({ userId, name, source: 'data' })
  if (existing) {
    existing.dashboardSource = {
      ...(existing.dashboardSource ?? {}),
      kind: source.kind,
      config: source.config,
      refreshCron: existing.dashboardSource?.refreshCron ?? null,
      userPrompt: userPrompt ?? existing.dashboardSource?.userPrompt,
      vertical: vertical ?? existing.dashboardSource?.vertical ?? 'general',
    }
    existing.status = 'cloning'
    existing.errorMessage = undefined
    await existing.save()
    return existing
  }
  return Repository.create({
    userId, name, fullName: `${userId.toString().slice(-6)}/${name}`,
    private: true, defaultBranch: 'main', source: 'data', status: 'cloning', indexed: false,
    dashboardSource: { kind: source.kind, config: source.config, refreshCron: null, userPrompt, vertical: vertical ?? 'general' },
  })
}

async function createBuildTask(userId: any, repositoryId: any, dashboardName: string, extras: Record<string, any> = {}) {
  return Task.create({
    userId, repositoryId, type: 'build_dashboard', status: 'pending',
    metadata: { dashboardName, ...extras },
  })
}

export default router
