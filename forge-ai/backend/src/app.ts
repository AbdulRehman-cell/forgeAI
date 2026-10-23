import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import passport from 'passport'

import { configurePassport } from './lib/passport'
import authRoutes from './modules/auth/auth.routes'
import repositoryRoutes from './modules/repository/repository.routes'
import githubRoutes from './modules/github/github.routes'
import aiRoutes from './modules/ai/ai.routes'
import taskRoutes from './modules/tasks/task.routes'
import settingsRoutes from './modules/settings/settings.routes'
import billingRoutes, { stripeWebhook } from './modules/billing/billing.routes'
import localRoutes from './modules/local/local.routes'
import path from 'path'
import fs from 'fs'
import uploadRoutes, { UPLOADS_DIR } from './modules/uploads/upload.routes'
import dashboardRoutes from './modules/dashboard/dashboard.routes'
import leadsRoutes from './modules/leads/leads.routes'
import outreachRoutes from './modules/outreach/outreach.routes'
import gmailRoutes from './modules/outreach/gmail.routes'
import whatsappRoutes from './modules/outreach/whatsapp.routes'
import auditRoutes from './modules/audit/audit.routes'
import teamsRoutes from './modules/teams/teams.routes'
import whiteLabelRoutes from './modules/settings/whitelabel.routes'
import hostingRoutes from './modules/hosting/hosting.routes'
import { SITES_DIR, checkR2Config } from './lib/selfHostedDeploy'
import { startBackend, getBackendPort } from './lib/processManager'
import http from 'http'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { Repository } from './modules/repository/repository.model'

const execFileAsync = promisify(execFile)
import { Task } from './modules/tasks/task.model'
import { startWAScheduler } from './lib/waScheduler'

const REPOS_DIR = process.env.REPOS_DIR ?? path.join(process.cwd(), 'repos')

// Ensure the sites directory exists at startup (used by local fallback)
if (!fs.existsSync(SITES_DIR)) fs.mkdirSync(SITES_DIR, { recursive: true })

// Warn early if R2 vars are only partially set
checkR2Config()

const app = express()

// Security
const FRONTEND_ORIGIN = process.env.FRONTEND_URL ?? 'http://localhost:5173'
app.use(helmet({
  // Allow the configured frontend origin (different port in dev) to embed any
  // backend response in an iframe. Helmet's default frame-ancestors 'self'
  // blocks cross-port embedding, which breaks dashboard iframes.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'", FRONTEND_ORIGIN],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      upgradeInsecureRequests: [],
    },
  },
  // frame-ancestors CSP is the modern standard; disable the legacy
  // X-Frame-Options header so it doesn't conflict.
  frameguard: false,
}))
// Deployed sites on R2/CDN call back to ForgeAI via /sites-api/* from a
// different origin — allow any origin for that path only. Everything else
// stays locked to the configured frontend origin.
app.use('/sites-api', cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }))
// General CORS — must skip /sites-api so the wildcard above is not overwritten
// by this more restrictive rule (cors() uses res.setHeader which overwrites).
app.use((req, res, next) => {
  if (req.path.startsWith('/sites-api')) return next()
  return cors({ origin: FRONTEND_ORIGIN, credentials: true })(req, res, next)
})
app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false }))

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhook)

// Parsing / logging
app.use(express.json({ limit: '10mb' }))
app.use(morgan('dev'))

// Passport
configurePassport()
app.use(passport.initialize())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/repositories', repositoryRoutes)
app.use('/api/github', githubRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/local', localRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/leads', leadsRoutes)
app.use('/api/outreach', outreachRoutes)
app.use('/api/gmail', gmailRoutes)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/audit', auditRoutes)  // public — no auth
app.use('/api/whitelabel', whiteLabelRoutes)
app.use('/api/hosting', hostingRoutes)

// ─── Proxy: managed MERN backends ─────────────────────────────────────────────
// When a MERN app is self-hosted, we spawn its server/ directory as a child
// process and proxy /sites-api/{slug}/* to it.

// Tracks the in-flight global restore so the proxy can await it before 503-ing.
let restorePromise: Promise<void> | null = null
let backendsRestored = false

// Write stored env vars to backendDir/.env
function writeEnvFile(backendDir: string, envVars: any) {
  const vars = envVars instanceof Map ? Object.fromEntries(envVars) : (envVars ?? {})
  if (!vars || Object.keys(vars).length === 0) return
  const envLines = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
  try { fs.writeFileSync(path.join(backendDir, '.env'), envLines, 'utf-8') } catch {}
}

// Re-extract workspace zip from MongoDB and npm install so the backend can start
// after Render wipes the ephemeral filesystem on every redeploy.
async function restoreWorkspace(repositoryId: string, backendDir: string): Promise<boolean> {
  try {
    const repoWithZip = await Repository.findById(repositoryId).select('+workspaceZip localPath cloneUrl').lean() as any
    const zipBuf: Buffer | undefined = repoWithZip?.workspaceZip?.buffer ?? repoWithZip?.workspaceZip
    const localPath: string | undefined = repoWithZip?.localPath

    if (zipBuf && zipBuf.length && localPath) {
      // Fast path: extract saved workspace zip
      const AdmZip = (await import('adm-zip')).default
      console.log(`[startup] Re-extracting workspace for repo ${repositoryId} → ${localPath}`)
      fs.mkdirSync(localPath, { recursive: true })
      const zip = new AdmZip(zipBuf)
      const entries = zip.getEntries()
      const topDirs = new Set<string>()
      entries.forEach((e: any) => { const parts = e.entryName.split('/'); if (parts.length > 1) topDirs.add(parts[0]) })
      const stripPrefix = topDirs.size === 1 ? `${[...topDirs][0]}/` : ''
      entries.forEach((entry: any) => {
        if (entry.isDirectory) return
        let relPath = entry.entryName
        if (stripPrefix && relPath.startsWith(stripPrefix)) relPath = relPath.slice(stripPrefix.length)
        if (!relPath) return
        const outPath = path.join(localPath, relPath)
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        fs.writeFileSync(outPath, entry.getData())
      })
    } else if (localPath && repoWithZip?.cloneUrl && repoWithZip.cloneUrl !== 'pending') {
      // Fallback: re-clone from GitHub (public repos only; no zip was saved yet)
      console.log(`[startup] No workspace zip — cloning ${repoWithZip.cloneUrl} → ${localPath}`)
      fs.mkdirSync(path.dirname(localPath), { recursive: true })
      await execFileAsync('git', ['clone', '--depth=1', repoWithZip.cloneUrl, localPath], {
        timeout: 120_000,
      }).catch((e: any) => console.warn(`[startup] git clone warning: ${e.message}`))
    } else {
      return false
    }

    if (fs.existsSync(path.join(backendDir, 'package.json'))) {
      console.log(`[startup] npm install in ${backendDir}…`)
      await execFileAsync('npm', ['install', '--legacy-peer-deps', '--prefer-offline', '--no-audit', '--no-fund'], {
        cwd: backendDir, timeout: 180_000,
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=256' },
      }).catch((e: any) => console.warn(`[startup] npm install warning: ${e.message}`))
    }
    return fs.existsSync(backendDir)
  } catch (e: any) {
    console.error(`[startup] restoreWorkspace failed: ${e.message}`)
    return false
  }
}

async function restoreBackendsOnce() {
  if (backendsRestored) return
  backendsRestored = true
  try {
    const { Deployment } = await import('./modules/hosting/deployment.model')
    const deploys = await Deployment.find({ backendDir: { $exists: true, $ne: null } }).lean()
    for (const d of deploys) {
      if (!d.backendDir) continue
      let ready = fs.existsSync(d.backendDir)
      // Ephemeral FS was wiped — try to restore from workspaceZip in MongoDB
      if (!ready && d.repositoryId) {
        ready = await restoreWorkspace(d.repositoryId.toString(), d.backendDir)
      }
      if (!ready) { console.warn(`[startup] backendDir missing for "${d.slug}", skipping`); continue }
      writeEnvFile(d.backendDir, d.envVars)
      console.log(`[startup] Starting backend for slug "${d.slug}"`)
      await startBackend(d.slug, d.backendDir).catch(e =>
        console.error(`[startup] Failed to start backend "${d.slug}": ${e.message}`)
      )
    }
  } catch (e: any) {
    console.error('[startup] Backend restore failed:', e.message)
  }
}

// Kick off restore lazily on first /sites-api hit (DB may not be ready at process start).
// Also exported so index.ts can trigger it eagerly once DB is connected.
export function triggerBackendRestore() {
  if (!restorePromise) restorePromise = restoreBackendsOnce()
}

app.use('/sites-api', (_req, _res, next) => {
  if (!restorePromise) restorePromise = restoreBackendsOnce()
  next()
})

// On-demand backend start: looks up backendDir from Deployment model and spawns it
async function ensureBackend(slug: string): Promise<number | null> {
  // 1. Already running?
  const running = getBackendPort(slug)
  if (running) return running

  // 2. Wait for the global restore to finish (it may have just been kicked off)
  if (restorePromise) await restorePromise

  const running2 = getBackendPort(slug)
  if (running2) return running2

  // 3. Still not running — look up backendDir in DB and start it now
  try {
    const { Deployment } = await import('./modules/hosting/deployment.model')
    const dep = await Deployment.findOne({ slug })
    if (dep?.backendDir) {
      let ready = fs.existsSync(dep.backendDir)
      if (!ready && dep.repositoryId) {
        ready = await restoreWorkspace(dep.repositoryId.toString(), dep.backendDir)
      }
      if (ready) {
        writeEnvFile(dep.backendDir, dep.envVars)
        console.log(`[proxy] Starting backend for "${slug}" on demand`)
        const { port } = await startBackend(slug, dep.backendDir)
        return port
      }
    }
  } catch (e: any) {
    console.error(`[proxy] On-demand start failed for "${slug}": ${e.message}`)
  }
  return null
}

app.use('/sites-api/:slug', async (req, res) => {
  const port = await ensureBackend(req.params.slug)
  if (!port) {
    return res.status(503).json({ message: `Backend for "${req.params.slug}" is not running. Redeploy to restart it.` })
  }
  const urlPath = req.url   // already stripped of /sites-api/:slug prefix by Express

  // express.json() already consumed the body stream — rebuild it from req.body.
  // Trying to re-read the stream with req.on('data') would hang because the
  // 'end' event already fired before this handler was reached.
  let body: Buffer
  if (req.body !== undefined && Object.keys(req.body).length > 0) {
    body = Buffer.from(JSON.stringify(req.body))
  } else {
    body = Buffer.alloc(0)
  }

  const proxyHeaders: Record<string, string | string[] | undefined> = {
    ...req.headers,
    host: `localhost:${port}`,
    'content-length': String(body.length),
  }
  if (body.length > 0) proxyHeaders['content-type'] = 'application/json'

  // AI-generated backends use requireAdmin on PUT/DELETE with a known default
  // secret. The proxy is the only entry point to these private services, so it
  // forwards the service credential so all CRUD operations work for visitors.
  if (['PUT', 'DELETE', 'PATCH'].includes(req.method) && !proxyHeaders['authorization']) {
    try {
      const jwt = await import('jsonwebtoken')
      const secret = process.env.ADMIN_JWT_SECRET ?? 'forgeai-admin-secret-change-me'
      const token = (jwt as any).sign({ admin: true }, secret, { expiresIn: '1h' })
      proxyHeaders['authorization'] = `Bearer ${token}`
    } catch { /* jwt unavailable — forward as-is */ }
  }

  function doProxy(attemptsLeft: number) {
    const proxyReq = http.request(
      { hostname: '127.0.0.1', port, path: urlPath || '/', method: req.method, headers: proxyHeaders },
      (proxyRes) => {
        if (res.headersSent) return
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
        proxyRes.pipe(res, { end: true })
      },
    )
    proxyReq.on('error', () => {
      if (attemptsLeft > 1) {
        setTimeout(() => doProxy(attemptsLeft - 1), 400)
      } else {
        if (!res.headersSent) res.status(502).json({ message: 'Backend unreachable' })
      }
    })
    proxyReq.end(body)
  }
  doProxy(3)
})

// Self-hosted sites — served as static files with relaxed CSP so user-generated
// HTML/JS/CSS can run. We disable helmet's opinionated headers for this path only.
const siteHeaders = (_req: any, res: any, next: any) => {
  res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:")
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('X-Frame-Options', 'ALLOWALL')
  next()
}
app.use('/sites', siteHeaders, express.static(SITES_DIR, {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}))
// SPA fallback — if a static file isn't found, serve the slug's index.html so
// React Router (hash or history mode) can handle the route client-side
app.get('/sites/:slug/*', siteHeaders, (req, res) => {
  const indexFile = path.join(SITES_DIR, req.params.slug, 'index.html')
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile)
  res.status(404).send('Site not found')
})

// Public team invite accept — must be registered BEFORE the auth-gated /api/teams mount
app.post('/api/teams/accept', async (req, res) => {
  const { token } = req.body
  if (!token) return res.status(400).json({ message: 'token is required' })
  const { User } = await import('./modules/users/user.model')
  const owner = await (User as any).findOne({ 'teamMembers.inviteToken': token }).select('+teamMembers.inviteToken')
  if (!owner) return res.status(404).json({ message: 'Invalid or expired invite link' })
  const member = owner.teamMembers?.find((m: any) => m.inviteToken === token)
  if (!member) return res.status(404).json({ message: 'Invalid or expired invite link' })
  member.accepted = true
  member.inviteToken = undefined
  const invitedUser = await (User as any).findOne({ email: member.email })
  if (invitedUser) {
    member.userId = invitedUser._id
    // Set team context on the member's account so they can access the owner's workspace
    await (User as any).findByIdAndUpdate(invitedUser._id, {
      teamOwnerId: owner._id,
      teamRole: member.role,
    })
  }
  await owner.save()
  res.json({ message: 'Invitation accepted', ownerName: owner.name, ownerEmail: owner.email })
})

app.use('/api/teams', teamsRoutes)

// Uploaded images — helmet's default CORP header would block the frontend
// (different port) from displaying them, so relax it for this path only
app.use('/uploads', express.static(UPLOADS_DIR, {
  setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
}))

// Built dashboards — served straight from disk so the frontend can iframe them.
// frame-ancestors and X-Frame-Options are already handled by Helmet globally above.
// CORP: cross-origin lets the frontend fetch these files across port boundaries.
// Cache-Control: no-store prevents stale JS/HTML from persisting after a rebuild.
app.use('/dashboards', express.static(REPOS_DIR, {
  setHeaders: (res, filePath) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store')
    }
  },
}))

// ─── Public: client approval ──────────────────────────────
app.get('/api/approve/:token', async (req, res) => {
  const repo = await (Repository as any).findOne({ approvalToken: req.params.token }).lean()
  if (!repo) return res.status(404).json({ message: 'Approval link not found or expired' })
  const deployUrl = repo.deployState?.render?.url ?? null
  res.json({
    siteName: repo.name,
    status: repo.approvalStatus ?? 'pending',
    approvedAt: repo.approvedAt ?? null,
    note: repo.approvalNote ?? null,
    previewUrl: deployUrl,
  })
})

app.post('/api/approve/:token', async (req, res) => {
  const { decision, note } = req.body
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: 'decision must be "approved" or "rejected"' })
  }
  const repo = await (Repository as any).findOne({ approvalToken: req.params.token })
  if (!repo) return res.status(404).json({ message: 'Approval link not found' })
  repo.approvalStatus = decision
  repo.approvalNote = note?.trim() || undefined
  if (decision === 'approved') repo.approvedAt = new Date()
  await repo.save()
  res.json({ status: repo.approvalStatus })
})

// ─── Public: shareable client report ─────────────────────
app.get('/api/share/:token', async (req, res) => {
  const repo = await (Repository as any).findOne({ shareToken: req.params.token }).lean()
  if (!repo) return res.status(404).json({ message: 'Report not found or link expired' })

  // Pull latest review/rebuild task summary for the report
  const latestAnalysis = await (Task as any).findOne({
    repositoryId: repo._id,
    type: { $in: ['review', 'rebuild_proposal', 'security_scan'] },
    status: 'completed',
  }).sort({ createdAt: -1 }).lean()

  const latestDeploy = await (Task as any).findOne({
    repositoryId: repo._id,
    type: 'blitz_deploy',
    status: 'completed',
  }).sort({ createdAt: -1 }).lean()

  res.json({
    repository: {
      name: repo.name,
      fullName: repo.fullName,
      description: repo.description,
      language: repo.language,
      fileCount: repo.fileCount,
      status: repo.status,
      createdAt: repo.createdAt,
    },
    analysis: latestAnalysis
      ? { type: latestAnalysis.type, summary: latestAnalysis.summary, createdAt: latestAnalysis.createdAt }
      : null,
    deploy: latestDeploy?.metadata?.deploymentUrl
      ? { url: latestDeploy.metadata.deploymentUrl, platform: latestDeploy.metadata.platform }
      : null,
  })
})

// Health
app.get('/health', (_, res) => res.json({ status: 'ok' }))

// Serve React frontend in production (backend and frontend share the same Render service)
if (process.env.NODE_ENV === 'production') {
  // __dirname = .../forge-ai/backend/dist  →  ../../frontend/dist = .../forge-ai/frontend/dist
  // Using __dirname is reliable regardless of what cwd Render uses to launch the process.
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist')
  const indexHtml = path.join(frontendDist, 'index.html')
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(frontendDist))
    app.get(/^(?!\/api\/|\/health|\/uploads\/|\/dashboards\/|\/sites\/)/, (_req, res) => {
      res.sendFile(indexHtml)
    })
  } else {
    console.warn(`[static] Frontend dist not found at ${frontendDist} — API-only mode. Run 'npm run build' in forge-ai/frontend to fix.`)
    app.get(/^(?!\/api\/|\/health|\/uploads\/|\/dashboards\/|\/sites\/)/, (_req, res) => {
      res.status(503).send('<h2>ForgeAI</h2><p>Frontend build not found. The backend is running — redeploy with <code>npm run build</code> in forge-ai/frontend.</p>')
    })
  }
}

// 404
app.use((_, res) => res.status(404).json({ message: 'Route not found' }))

// Start WhatsApp auto-send scheduler (fires pending WA sequence steps on their scheduled day)
startWAScheduler()

export default app
