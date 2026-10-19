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
import { Repository } from './modules/repository/repository.model'
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
app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true,
}))
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

// Self-hosted sites — served as static files with relaxed CSP so user-generated
// HTML/JS/CSS can run. We disable helmet's opinionated headers for this path only.
app.use('/sites', (req, res, next) => {
  // Allow user-generated pages to load their own scripts/styles/images
  res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:")
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('X-Frame-Options', 'ALLOWALL')
  next()
}, express.static(SITES_DIR, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store')
  },
}))

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
