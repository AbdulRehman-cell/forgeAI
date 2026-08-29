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
import uploadRoutes, { UPLOADS_DIR } from './modules/uploads/upload.routes'
import dashboardRoutes from './modules/dashboard/dashboard.routes'
import leadsRoutes from './modules/leads/leads.routes'
import outreachRoutes from './modules/outreach/outreach.routes'
import gmailRoutes from './modules/outreach/gmail.routes'
import teamsRoutes from './modules/teams/teams.routes'
import whiteLabelRoutes from './modules/settings/whitelabel.routes'
import { Repository } from './modules/repository/repository.model'
import { Task } from './modules/tasks/task.model'

const REPOS_DIR = process.env.REPOS_DIR ?? path.join(process.cwd(), 'repos')

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
app.use('/api/whitelabel', whiteLabelRoutes)

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
  if (invitedUser) member.userId = invitedUser._id
  await owner.save()
  res.json({ message: 'Invitation accepted', ownerName: owner.name })
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

// 404
app.use((_, res) => res.status(404).json({ message: 'Route not found' }))

export default app
