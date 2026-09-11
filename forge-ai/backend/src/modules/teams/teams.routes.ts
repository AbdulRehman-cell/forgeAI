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
