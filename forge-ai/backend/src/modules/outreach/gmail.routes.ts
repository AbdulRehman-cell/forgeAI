import { Router } from 'express'
import { google } from '../../lib/google'
import { requireAuth } from '../../middleware/auth.middleware'
import { User } from '../users/user.model'

const router = Router()

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI ?? `${process.env.BACKEND_URL ?? 'http://localhost:4000'}/api/gmail/callback`,
  )
}

// GET /api/gmail/connect — return the Google auth URL as JSON
router.get('/connect', requireAuth, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(501).json({ message: 'Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.' })
  }
  const oauth2Client = getOAuth2Client()
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    state: (req.user as any)._id.toString(),
  })
  res.json({ url })
})

// GET /api/gmail/callback — exchange code, store tokens, redirect to settings
router.get('/callback', async (req, res) => {
  const { code, state: userId, error } = req.query
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'

  if (error) return res.redirect(`${frontendUrl}/settings?gmail=error&reason=${error}`)
  if (!code || !userId) return res.redirect(`${frontendUrl}/settings?gmail=error&reason=missing_params`)

  const oauth2Client = getOAuth2Client()
  try {
    const { tokens } = await oauth2Client.getToken(String(code))
    oauth2Client.setCredentials(tokens)

    // Get the Gmail address
    const oauthApi = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: profile } = await oauthApi.userinfo.get()

    await User.findByIdAndUpdate(String(userId), {
      gmailRefreshToken: tokens.refresh_token,
      gmailEmail: profile.email,
    })

    res.redirect(`${frontendUrl}/settings?gmail=connected&email=${encodeURIComponent(profile.email ?? '')}`)
  } catch (err: any) {
    console.error('[gmail] Callback error:', err?.message)
    res.redirect(`${frontendUrl}/settings?gmail=error&reason=${encodeURIComponent(err?.message ?? 'unknown')}`)
  }
})

// GET /api/gmail/status
router.get('/status', requireAuth, async (req, res) => {
  const user = await User.findById((req.user as any)._id).select('+gmailRefreshToken gmailEmail')
  res.json({
    connected: !!user?.gmailRefreshToken,
    email: user?.gmailEmail ?? null,
  })
})

// DELETE /api/gmail/disconnect
router.delete('/disconnect', requireAuth, async (req, res) => {
  const user = await User.findById((req.user as any)._id).select('+gmailRefreshToken gmailEmail')
  if (user?.gmailRefreshToken) {
    // Best-effort token revocation
    try {
      const oauth2Client = getOAuth2Client()
      oauth2Client.setCredentials({ refresh_token: user.gmailRefreshToken })
      await oauth2Client.revokeCredentials()
    } catch { /* ignore revocation errors */ }
  }
  await User.findByIdAndUpdate((req.user as any)._id, { $unset: { gmailRefreshToken: 1, gmailEmail: 1 } })
  res.json({ disconnected: true })
})

// POST /api/gmail/send — send cold email via user's Gmail
router.post('/send', requireAuth, async (req, res) => {
  const user = await User.findById((req.user as any)._id).select('+gmailRefreshToken gmailEmail')
  if (!user?.gmailRefreshToken) {
    return res.status(400).json({ message: 'Gmail not connected. Go to Settings → Gmail Integration to connect.' })
  }

  const { to, subject, body, prospectId } = req.body
  if (!to || !subject || !body) return res.status(400).json({ message: 'to, subject, and body are required' })

  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: user.gmailRefreshToken })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  // Build RFC 2822 email
  const message = [
    `From: ${user.gmailEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n')

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: Buffer.from(message).toString('base64url') },
    })

    if (prospectId) {
      const { Prospect } = await import('./prospect.model')
      await Prospect.findByIdAndUpdate(prospectId, { status: 'sent', sentAt: new Date() })
    }

    res.json({ sent: true, from: user.gmailEmail })
  } catch (err: any) {
    console.error('[gmail] Send error:', err?.message)
    const msg = String(err?.message ?? '')
    if (err?.code === 401 || msg.includes('invalid_grant')) {
      await User.findByIdAndUpdate(user._id, { $unset: { gmailRefreshToken: 1, gmailEmail: 1 } })
      return res.status(401).json({ message: 'Gmail session expired. Please reconnect in Settings.' })
    }
    if (msg.includes('Invalid To') || msg.includes('does not exist') || msg.includes('550') || msg.includes('No such user')) {
      return res.status(422).json({ message: `That email address doesn't exist or can't receive mail. Click the ✏️ pencil next to "To" to correct it.` })
    }
    res.status(500).json({ message: 'Failed to send via Gmail', detail: msg })
  }
})

// GET /api/gmail/lead-settings
router.get('/lead-settings', requireAuth, async (req, res) => {
  const user = await User.findById((req.user as any)._id).select('leadAutoReply leadAutoReplyTemplate gmailEmail')
  res.json({
    autoReply: user?.leadAutoReply ?? false,
    template: user?.leadAutoReplyTemplate ?? '',
    gmailEmail: user?.gmailEmail ?? null,
  })
})

// PUT /api/gmail/lead-settings
router.put('/lead-settings', requireAuth, async (req, res) => {
  const { autoReply, template } = req.body
  await User.findByIdAndUpdate((req.user as any)._id, {
    ...(autoReply !== undefined && { leadAutoReply: autoReply }),
    ...(template !== undefined && { leadAutoReplyTemplate: template }),
  })
  res.json({ saved: true })
})

export default router
