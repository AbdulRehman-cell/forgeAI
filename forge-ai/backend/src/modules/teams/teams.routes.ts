import { Router } from 'express'
import crypto from 'crypto'
import { requireAuth } from '../../middleware/auth.middleware'
import { User } from '../users/user.model'
import { Task } from '../tasks/task.model'
import { Repository } from '../repository/repository.model'
import nodemailer from 'nodemailer'

const router = Router()
router.use(requireAuth)

const PRO_SEAT_LIMIT = 3

function makeTransport() {
  const host = process.env.SMTP_HOST
  if (!host) return null
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })
}

async function sendInviteEmail(to: string, ownerName: string, inviteUrl: string) {
  try {
    const transport = makeTransport()
    if (!transport || !process.env.SMTP_FROM) {
      console.warn('[teams] SMTP not configured — invite link:', inviteUrl)
      return
    }
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: `${ownerName} invited you to join ForgeAI`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:32px">
          <h2 style="margin:0 0 8px">You've been invited to ForgeAI</h2>
          <p style="color:#555;margin:0 0 24px"><strong>${ownerName}</strong> has invited you to collaborate on their ForgeAI workspace.</p>
          <a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Accept Invitation</a>
          <p style="margin-top:24px;font-size:12px;color:#999">Or copy this link: ${inviteUrl}</p>
        </div>
      `,
    })
    console.log(`[teams] Invite email sent to ${to}`)
  } catch (err: any) {
    console.error('[teams] Failed to send invite email:', err?.message ?? err)
  }
}

/** Get team info — works for both owner (their own team) and member (their owner's team) */
router.get('/', async (req, res) => {
  const authed = req.user as any
  const isOwner = !authed.teamOwnerId
  const ownerId = authed.teamOwnerId ?? authed._id

  const owner = await User.findById(ownerId).select('+teamMembers.inviteToken')
  if (!owner) return res.status(404).json({ message: 'Not found' })

  const seatLimit = owner.plan === 'team' ? null : PRO_SEAT_LIMIT
  const seatUsed = (owner.teamMembers ?? []).length

  // Include inviteUrl for pending members so the owner can share links manually
  const members = (owner.teamMembers ?? []).map((m: any) => ({
    email: m.email,
    role: m.role,
    accepted: m.accepted,
    invitedAt: m.invitedAt,
    userId: m.userId,
    inviteUrl: !m.accepted && m.inviteToken
      ? `${process.env.FRONTEND_URL}/team/accept?token=${m.inviteToken}`
      : undefined,
  }))

  res.json({
    members,
    plan: owner.plan,
    seatLimit,
    seatUsed,
    isOwner,
    myRole: isOwner ? 'owner' : authed.teamRole,
    ownerName: isOwner ? undefined : owner.name,
    ownerEmail: isOwner ? undefined : owner.email,
    smtpConfigured: !!process.env.SMTP_HOST && !!process.env.SMTP_FROM,
  })
})

/** Invite a new member */
router.post('/invite', async (req, res) => {
  const authed = req.user as any
  const { email, role = 'member' } = req.body
  if (!email?.trim()) return res.status(400).json({ message: 'Email is required' })
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ message: 'Invalid role' })

  // Members cannot invite; admins and owners can
  const isOwner = !authed.teamOwnerId
  if (!isOwner && authed.teamRole !== 'admin') {
    return res.status(403).json({ message: 'Only team admins can invite members' })
  }

  const ownerId = authed.teamOwnerId ?? authed._id
  const owner = await User.findById(ownerId).select('+teamMembers.inviteToken')
  if (!owner) return res.status(404).json({ message: 'Not found' })

  if (!['pro', 'team'].includes(owner.plan)) {
    return res.status(403).json({ message: 'Team seats require a Pro or Team plan' })
  }

  // Enforce seat limit for Pro plan
  if (owner.plan === 'pro' && (owner.teamMembers ?? []).length >= PRO_SEAT_LIMIT) {
    return res.status(403).json({
      message: `Pro plan supports ${PRO_SEAT_LIMIT} seats. Upgrade to Team for unlimited seats.`,
      seatLimitReached: true,
    })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const existing = (owner.teamMembers ?? []).find(m => m.email === normalizedEmail)
  if (existing) return res.status(409).json({ message: 'This email is already invited' })

  const inviteToken = crypto.randomBytes(24).toString('hex')
  if (!owner.teamMembers) owner.teamMembers = []
  owner.teamMembers.push({
    email: normalizedEmail,
    role,
    inviteToken,
    accepted: false,
    invitedAt: new Date(),
  })
  await owner.save()

  const inviteUrl = `${process.env.FRONTEND_URL}/team/accept?token=${inviteToken}`
  await sendInviteEmail(normalizedEmail, owner.name, inviteUrl)

  res.status(201).json({ message: 'Invitation sent', inviteUrl })
})

/** Resend invite to a pending member */
router.post('/:email/resend', async (req, res) => {
  const authed = req.user as any
  const isOwner = !authed.teamOwnerId
  if (!isOwner && authed.teamRole !== 'admin') {
    return res.status(403).json({ message: 'Only team admins can resend invites' })
  }

  const ownerId = authed.teamOwnerId ?? authed._id
  const owner = await User.findById(ownerId).select('+teamMembers.inviteToken')
  if (!owner) return res.status(404).json({ message: 'Not found' })

  const email = decodeURIComponent(req.params.email).toLowerCase()
  const member = (owner.teamMembers ?? []).find(m => m.email === email)
  if (!member) return res.status(404).json({ message: 'Member not found' })
  if (member.accepted) return res.status(400).json({ message: 'Invite already accepted' })

  // Rotate the token on resend
  member.inviteToken = crypto.randomBytes(24).toString('hex')
  member.invitedAt = new Date()
  await owner.save()

  const inviteUrl = `${process.env.FRONTEND_URL}/team/accept?token=${member.inviteToken}`
  await sendInviteEmail(email, owner.name, inviteUrl)

  res.json({ message: 'Invite resent', inviteUrl })
})

/** Change a member's role — owner only */
router.patch('/:email/role', async (req, res) => {
  const authed = req.user as any
  if (authed.teamOwnerId) {
    return res.status(403).json({ message: 'Only the team owner can change roles' })
  }

  const { role } = req.body
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ message: 'Invalid role' })

  const owner = await User.findById(authed._id)
  if (!owner) return res.status(404).json({ message: 'Not found' })

  const email = decodeURIComponent(req.params.email).toLowerCase()
  const member = (owner.teamMembers ?? []).find(m => m.email === email)
  if (!member) return res.status(404).json({ message: 'Member not found' })

  member.role = role
  await owner.save()

  // Sync role on the member's user document if they've accepted
  if (member.userId) {
    await User.findByIdAndUpdate(member.userId, { teamRole: role })
  }

  res.json({ message: 'Role updated', role })
})

/** Remove a member */
router.delete('/:email', async (req, res) => {
  const authed = req.user as any
  const isOwner = !authed.teamOwnerId

  // Members cannot remove; admins can remove members (not other admins); owners can remove anyone
  if (!isOwner && authed.teamRole !== 'admin') {
    return res.status(403).json({ message: 'Only team admins can remove members' })
  }

  const ownerId = authed.teamOwnerId ?? authed._id
  const owner = await User.findById(ownerId)
  if (!owner) return res.status(404).json({ message: 'Not found' })

  const email = decodeURIComponent(req.params.email).toLowerCase()
  const memberRecord = (owner.teamMembers ?? []).find(m => m.email === email)
  if (!memberRecord) return res.status(404).json({ message: 'Member not found' })

  // Admins cannot remove other admins
  if (!isOwner && memberRecord.role === 'admin') {
    return res.status(403).json({ message: 'Admins cannot remove other admins' })
  }

  const removedUserId = memberRecord.userId
  owner.teamMembers = (owner.teamMembers ?? []).filter(m => m.email !== email)
  await owner.save()

  // Clear team context on the removed member's account
  if (removedUserId) {
    await User.findByIdAndUpdate(removedUserId, { $unset: { teamOwnerId: 1, teamRole: 1 } })
  }

  res.json({ removed: true })
})

/** Team activity feed — last 50 AI tasks by any team member */
router.get('/activity', async (req, res) => {
  const authed = req.user as any
  const ownerId = authed.teamOwnerId ?? authed._id
  const owner = await User.findById(ownerId)
  if (!owner) return res.status(404).json({ message: 'Not found' })

  // Collect all user IDs: owner + accepted members
  const memberIds = (owner.teamMembers ?? [])
    .filter((m: any) => m.accepted && m.userId)
    .map((m: any) => m.userId)
  const allIds = [owner._id, ...memberIds]

  const tasks = await Task.find({ userId: { $in: allIds } })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()

  // Attach repo name and user email
  const repoIds = [...new Set(tasks.map(t => t.repositoryId?.toString()).filter(Boolean))]
  const repos = await Repository.find({ _id: { $in: repoIds } }).select('name fullName').lean()
  const repoMap = Object.fromEntries(repos.map((r: any) => [r._id.toString(), r.name || r.fullName]))

  const memberEmailMap: Record<string, string> = { [owner._id.toString()]: owner.email }
  for (const m of (owner.teamMembers ?? []) as any[]) {
    if (m.userId) memberEmailMap[m.userId.toString()] = m.email
  }

  const feed = tasks.map(t => ({
    id: t._id,
    type: t.type,
    status: t.status,
    summary: t.summary ?? null,
    repoName: repoMap[t.repositoryId?.toString()] ?? 'Unknown repo',
    userEmail: memberEmailMap[t.userId?.toString()] ?? 'Unknown',
    createdAt: t.createdAt,
  }))

  res.json(feed)
})

/** Per-member usage stats for the current calendar month */
router.get('/stats', async (req, res) => {
  const authed = req.user as any
  const isOwner = !authed.teamOwnerId
  if (!isOwner) return res.status(403).json({ message: 'Owner only' })

  const owner = await User.findById(authed._id)
  if (!owner) return res.status(404).json({ message: 'Not found' })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const acceptedMembers = (owner.teamMembers ?? []).filter((m: any) => m.accepted && m.userId)
  const allIds = [owner._id, ...acceptedMembers.map((m: any) => m.userId)]

  // Count tasks this month per user
  const counts = await Task.aggregate([
    { $match: { userId: { $in: allIds }, createdAt: { $gte: monthStart } } },
    { $group: { _id: '$userId', count: { $sum: 1 }, lastAt: { $max: '$createdAt' } } },
  ])
  const countMap = Object.fromEntries(counts.map(c => [c._id.toString(), { count: c.count, lastAt: c.lastAt }]))

  const rows = [
    {
      email: owner.email,
      userId: owner._id,
      role: 'owner' as const,
      monthlyLimit: null,
      taskCount: countMap[owner._id.toString()]?.count ?? 0,
      lastActiveAt: countMap[owner._id.toString()]?.lastAt ?? null,
    },
    ...acceptedMembers.map((m: any) => ({
      email: m.email,
      userId: m.userId,
      role: m.role as string,
      monthlyLimit: m.monthlyTaskLimit ?? null,
      taskCount: countMap[m.userId.toString()]?.count ?? 0,
      lastActiveAt: countMap[m.userId.toString()]?.lastAt ?? null,
    })),
  ]

  res.json(rows)
})

/** Set monthly AI task limit for a member — owner only */
router.patch('/:email/limit', async (req, res) => {
  const authed = req.user as any
  if (authed.teamOwnerId) return res.status(403).json({ message: 'Owner only' })

  const { limit } = req.body
  if (limit !== null && (typeof limit !== 'number' || limit < 1 || limit > 10000)) {
    return res.status(400).json({ message: 'limit must be a positive integer or null (unlimited)' })
  }

  const owner = await User.findById(authed._id)
  if (!owner) return res.status(404).json({ message: 'Not found' })

  const email = decodeURIComponent(req.params.email).toLowerCase()
  const member = (owner.teamMembers ?? []).find((m: any) => m.email === email)
  if (!member) return res.status(404).json({ message: 'Member not found' })

  member.monthlyTaskLimit = limit ?? undefined
  await owner.save()

  res.json({ email, monthlyLimit: limit ?? null })
})

// ─── Feature: AI Coding Standards ────────────────────────────────────────────

/** Get team coding standards */
router.get('/standards', async (req, res) => {
  const authed = req.user as any
  const ownerId = authed.teamOwnerId ?? authed._id
  const owner = await User.findById(ownerId)
  if (!owner) return res.status(404).json({ message: 'Not found' })
  res.json({ standards: owner.teamCodingStandards ?? '' })
})

/** Update team coding standards — owner/admin only */
router.patch('/standards', async (req, res) => {
  const authed = req.user as any
  const isOwner = !authed.teamOwnerId
  if (!isOwner && authed.teamRole !== 'admin') {
    return res.status(403).json({ message: 'Only admins can update coding standards' })
  }
  const ownerId = authed.teamOwnerId ?? authed._id
  const owner = await User.findById(ownerId)
  if (!owner) return res.status(404).json({ message: 'Not found' })

  owner.teamCodingStandards = req.body.standards?.trim() || null
  await owner.save()
  res.json({ standards: owner.teamCodingStandards ?? '' })
})

// ─── Feature: Team settings (approval toggle, digest toggle) ──────────────────

router.patch('/settings', async (req, res) => {
  const authed = req.user as any
  if (authed.teamOwnerId) return res.status(403).json({ message: 'Owner only' })

  const owner = await User.findById(authed._id)
  if (!owner) return res.status(404).json({ message: 'Not found' })

  if (typeof req.body.requireApproval === 'boolean') owner.teamRequireApproval = req.body.requireApproval
  if (typeof req.body.digestEnabled === 'boolean') owner.teamDigestEnabled = req.body.digestEnabled
  await owner.save()

  res.json({ requireApproval: owner.teamRequireApproval, digestEnabled: owner.teamDigestEnabled })
})

// ─── Feature: Approval Workflow ───────────────────────────────────────────────

/** List tasks awaiting approval (owner only) */
router.get('/approvals', async (req, res) => {
  const authed = req.user as any
  if (authed.teamOwnerId) return res.status(403).json({ message: 'Owner only' })

  const owner = await User.findById(authed._id)
  if (!owner) return res.status(404).json({ message: 'Not found' })

  const memberIds = (owner.teamMembers ?? [])
    .filter((m: any) => m.accepted && m.userId)
    .map((m: any) => m.userId)

  const pending = await Task.find({
    userId: { $in: memberIds },
    status: 'awaiting_approval',
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()

  const repoIds = [...new Set(pending.map(t => t.repositoryId?.toString()))]
  const repos = await Repository.find({ _id: { $in: repoIds } }).select('name').lean()
  const repoMap = Object.fromEntries(repos.map((r: any) => [r._id.toString(), r.name]))

  const memberEmailMap: Record<string, string> = {}
  for (const m of (owner.teamMembers ?? []) as any[]) {
    if (m.userId) memberEmailMap[m.userId.toString()] = m.email
  }

  res.json(pending.map(t => ({
    id: t._id,
    type: t.type,
    status: t.status,
    approvalStatus: t.approvalStatus,
    summary: t.summary,
    repoName: repoMap[t.repositoryId?.toString()] ?? 'Unknown',
    userEmail: memberEmailMap[t.userId?.toString()] ?? 'Unknown',
    changes: (t.changes ?? []).map((c: any) => ({ path: c.path, additions: c.additions, deletions: c.deletions })),
    createdAt: t.createdAt,
  })))
})

/** Approve a task */
router.post('/approvals/:taskId/approve', async (req, res) => {
  const authed = req.user as any
  if (authed.teamOwnerId) return res.status(403).json({ message: 'Owner only' })

  const task = await Task.findById(req.params.taskId)
  if (!task) return res.status(404).json({ message: 'Task not found' })
  if (task.status !== 'awaiting_approval') return res.status(400).json({ message: 'Task is not pending approval' })

  task.status = 'completed'
  task.approvalStatus = 'approved'
  task.approvalNote = req.body.note?.trim() || undefined
  await task.save()

  res.json({ approved: true })
})

/** Reject a task — reverts applied file changes */
router.post('/approvals/:taskId/reject', async (req, res) => {
  const authed = req.user as any
  if (authed.teamOwnerId) return res.status(403).json({ message: 'Owner only' })

  const task = await Task.findById(req.params.taskId).select('+changes')
  if (!task) return res.status(404).json({ message: 'Task not found' })
  if (task.status !== 'awaiting_approval') return res.status(400).json({ message: 'Task is not pending approval' })

  // Revert files using the stored before state
  const repo = await Repository.findById(task.repositoryId)
  if (repo?.localPath) {
    const fs = await import('fs')
    const path = await import('path')
    for (const change of task.changes ?? []) {
      if (change.truncated) continue
      try {
        const absPath = path.join(repo.localPath, change.path)
        if (!absPath.startsWith(repo.localPath)) continue
        if (change.before) {
          fs.writeFileSync(absPath, change.before, 'utf-8')
        } else if (fs.existsSync(absPath)) {
          fs.unlinkSync(absPath)
        }
      } catch {}
    }
  }

  task.status = 'failed'
  task.approvalStatus = 'rejected'
  task.approvalNote = req.body.note?.trim() || 'Rejected by team owner'
  task.error = 'Changes rejected by team owner'
  await task.save()

  res.json({ rejected: true })
})

// ─── Feature: Task Assignment ─────────────────────────────────────────────────

/** Assign a task to a team member */
router.post('/assign', async (req, res) => {
  const authed = req.user as any
  const isOwner = !authed.teamOwnerId
  if (!isOwner && authed.teamRole !== 'admin') {
    return res.status(403).json({ message: 'Only admins can assign tasks' })
  }

  const { repositoryId, type = 'fix_workspace', instruction, assignToEmail } = req.body
  if (!repositoryId || !assignToEmail || !instruction?.trim()) {
    return res.status(400).json({ message: 'repositoryId, assignToEmail, and instruction are required' })
  }

  const ownerId = authed.teamOwnerId ?? authed._id
  const owner = await User.findById(ownerId)
  if (!owner) return res.status(404).json({ message: 'Not found' })

  const memberRecord = (owner.teamMembers ?? []).find(
    (m: any) => m.email === assignToEmail.toLowerCase() && m.accepted && m.userId,
  )
  if (!memberRecord) return res.status(404).json({ message: 'Member not found or has not accepted invite' })

  const task = await Task.create({
    userId: memberRecord.userId,
    repositoryId,
    type,
    status: 'pending',
    assignedTo: memberRecord.userId,
    assignedToEmail: assignToEmail.toLowerCase(),
    assignedByEmail: authed.email,
    assignedAt: new Date(),
    metadata: { instruction: instruction.trim(), assignedTask: true },
  })

  res.status(201).json({
    id: task._id,
    assignedToEmail: assignToEmail.toLowerCase(),
    instruction: instruction.trim(),
    type,
    createdAt: task.createdAt,
  })
})

/** Get tasks assigned to me */
router.get('/my-assignments', async (req, res) => {
  const authed = req.user as any
  const tasks = await Task.find({
    assignedTo: authed._id,
    'metadata.assignedTask': true,
  })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean()

  const repoIds = [...new Set(tasks.map(t => t.repositoryId?.toString()))]
  const repos = await Repository.find({ _id: { $in: repoIds } }).select('name').lean()
  const repoMap = Object.fromEntries(repos.map((r: any) => [r._id.toString(), r.name]))

  res.json(tasks.map(t => ({
    id: t._id,
    type: t.type,
    status: t.status,
    repoName: repoMap[t.repositoryId?.toString()] ?? 'Unknown',
    assignedByEmail: t.assignedByEmail,
    instruction: t.metadata?.instruction,
    createdAt: t.createdAt,
  })))
})

// ─── Feature: Granular Repo Permissions ──────────────────────────────────────

/** Get all team repos with their per-member permissions */
router.get('/repo-permissions', async (req, res) => {
  const authed = req.user as any
  if (authed.teamOwnerId) return res.status(403).json({ message: 'Owner only' })

  const repos = await Repository.find({ userId: authed._id })
    .select('name fullName allowedMemberIds')
    .lean()

  const owner = await User.findById(authed._id)
  const members = (owner?.teamMembers ?? [])
    .filter((m: any) => m.accepted && m.userId)
    .map((m: any) => ({ email: m.email, userId: m.userId.toString(), role: m.role }))

  res.json(repos.map((r: any) => ({
    repoId: r._id,
    name: r.name || r.fullName,
    allowedMemberIds: (r.allowedMemberIds ?? []).map((id: any) => id.toString()),
    restricted: (r.allowedMemberIds ?? []).length > 0,
  })).concat([{ members }] as any))
})

/** Set which members can access a repo — empty array = everyone */
router.patch('/repos/:repoId/permissions', async (req, res) => {
  const authed = req.user as any
  if (authed.teamOwnerId) return res.status(403).json({ message: 'Owner only' })

  const repo = await Repository.findOne({ _id: req.params.repoId, userId: authed._id })
  if (!repo) return res.status(404).json({ message: 'Repo not found' })

  const { allowedMemberIds } = req.body
  if (!Array.isArray(allowedMemberIds)) return res.status(400).json({ message: 'allowedMemberIds must be an array' })

  repo.allowedMemberIds = allowedMemberIds
  await repo.save()

  res.json({ repoId: repo._id, allowedMemberIds, restricted: allowedMemberIds.length > 0 })
})

/** Leave a team — for members only */
router.post('/leave', async (req, res) => {
  const authed = req.user as any
  if (!authed.teamOwnerId) {
    return res.status(400).json({ message: 'You are not a member of any team' })
  }

  const owner = await User.findById(authed.teamOwnerId)
  if (owner) {
    owner.teamMembers = (owner.teamMembers ?? []).filter(
      m => m.userId?.toString() !== authed._id.toString() && m.email !== authed.email
    )
    await owner.save()
  }

  await User.findByIdAndUpdate(authed._id, { $unset: { teamOwnerId: 1, teamRole: 1 } })

  res.json({ left: true })
})

export default router
