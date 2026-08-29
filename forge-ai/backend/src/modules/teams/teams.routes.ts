import { Router } from 'express'
import crypto from 'crypto'
import { requireAuth } from '../../middleware/auth.middleware'
import { User } from '../users/user.model'
import nodemailer from 'nodemailer'

const router = Router()
router.use(requireAuth)

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

/** List team members */
router.get('/', async (req, res) => {
  const authed = req.user as any
  const user = await User.findById(authed._id).select('+teamMembers.inviteToken')
  if (!user) return res.status(404).json({ message: 'Not found' })
  res.json({ members: user.teamMembers ?? [] })
})

/** Invite a new member */
router.post('/invite', async (req, res) => {
  const authed = req.user as any
  const { email, role = 'member' } = req.body
  if (!email?.trim()) return res.status(400).json({ message: 'Email is required' })

  const user = await User.findById(authed._id).select('+teamMembers.inviteToken')
  if (!user) return res.status(404).json({ message: 'Not found' })
  if (!['pro', 'team'].includes(user.plan)) {
    return res.status(403).json({ message: 'Team seats require a Pro or Team plan' })
  }

  const existing = (user.teamMembers ?? []).find(m => m.email === email.toLowerCase())
  if (existing) return res.status(409).json({ message: 'This email is already invited' })

  const inviteToken = crypto.randomBytes(24).toString('hex')
  if (!user.teamMembers) user.teamMembers = []
  user.teamMembers.push({ email: email.trim().toLowerCase(), role, inviteToken, accepted: false, invitedAt: new Date() })
  await user.save()

  const inviteUrl = `${process.env.FRONTEND_URL}/team/accept?token=${inviteToken}`
  try {
    const transport = makeTransport()
    if (!transport) {
      console.warn('[teams] SMTP not configured (SMTP_HOST missing) — invite email not sent. Share this link manually:', inviteUrl)
    } else if (!process.env.SMTP_FROM) {
      console.warn('[teams] SMTP_FROM not set — invite email not sent. Share this link manually:', inviteUrl)
    } else {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: `${user.name} invited you to join ForgeAI`,
        html: `
          <h2>You've been invited to ForgeAI</h2>
          <p><strong>${user.name}</strong> has invited you to collaborate on ForgeAI.</p>
          <p><a href="${inviteUrl}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Accept Invitation</a></p>
          <p style="margin-top:16px;font-size:12px;color:#666">Or copy this link: ${inviteUrl}</p>
        `,
      })
      console.log(`[teams] Invite email sent to ${email}`)
    }
  } catch (err: any) {
    console.error('[teams] Failed to send invite email:', err?.message ?? err)
  }

  res.status(201).json({ message: 'Invitation sent', inviteUrl })
})

/** Remove a member */
router.delete('/:email', async (req, res) => {
  const authed = req.user as any
  const user = await User.findById(authed._id)
  if (!user) return res.status(404).json({ message: 'Not found' })

  const email = decodeURIComponent(req.params.email).toLowerCase()
  const before = user.teamMembers?.length ?? 0
  user.teamMembers = (user.teamMembers ?? []).filter(m => m.email !== email)
  if ((user.teamMembers?.length ?? 0) === before) {
    return res.status(404).json({ message: 'Member not found' })
  }
  await user.save()
  res.json({ removed: true })
})

export default router
