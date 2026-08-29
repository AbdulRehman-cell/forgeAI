// OAuth start/callback for the Google Sheets + Stripe source connectors.
// The `start` endpoints return a redirect URL the frontend opens in a popup;
// the callback stores tokens on the user document and closes the popup by
// sending a small postMessage to the opener.

import { Router } from 'express'
import axios from 'axios'
import crypto from 'crypto'
import { requireAuth } from '../../../middleware/auth.middleware'
import { User } from '../../users/user.model'

const router = Router()

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

// A short-lived signed state so a rogue callback can't attach itself to
// another user. HMAC over (userId + timestamp) — verified on return.
const STATE_TTL_MS = 10 * 60_000
function signState(userId: string, provider: string): string {
  const secret = process.env.JWT_SECRET ?? 'dev-secret'
  const nonce = crypto.randomBytes(8).toString('hex')
  const ts = Date.now()
  const payload = `${userId}.${provider}.${ts}.${nonce}`
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 24)
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}
function verifyState(state: string): { userId: string; provider: string } | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf-8')
    const [userId, provider, ts, nonce, sig] = decoded.split('.')
    if (!userId || !provider || !ts || !nonce || !sig) return null
    if (Date.now() - Number(ts) > STATE_TTL_MS) return null
    const secret = process.env.JWT_SECRET ?? 'dev-secret'
    const expected = crypto.createHmac('sha256', secret).update(`${userId}.${provider}.${ts}.${nonce}`).digest('hex').slice(0, 24)
    return sig === expected ? { userId, provider } : null
  } catch { return null }
}

// ── Google Sheets ──────────────────────────────────────────
router.get('/google/start', requireAuth, (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return res.status(501).json({ message: 'GOOGLE_CLIENT_ID not configured on the server.' })
  const user = req.user as any
  const state = signState(user._id.toString(), 'google')
  const redirectUri = googleCallbackUrl()
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',      // gives us a refresh_token
    prompt: 'consent',           // guarantees refresh_token even on re-connect
    state,
  }).toString()
  res.json({ url })
})

// The callback runs in the popup — public route (no bearer token in a browser
// redirect), authenticated via signed state.
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string }
  if (error) return sendCallbackPage(res, false, `Google refused the request: ${error}`)
  if (!code || !state) return sendCallbackPage(res, false, 'Missing code/state on the callback.')
  const parsed = verifyState(state)
  if (!parsed || parsed.provider !== 'google') return sendCallbackPage(res, false, 'Invalid or expired state.')

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return sendCallbackPage(res, false, 'Server not configured (GOOGLE_CLIENT_ID/SECRET).')

  try {
    const { data } = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: googleCallbackUrl(), grant_type: 'authorization_code',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 },
    )
    await User.updateOne({ _id: parsed.userId }, {
      $set: {
        'dashboardTokens.google': {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
          scope: data.scope,
        },
      },
    })
    sendCallbackPage(res, true, 'Google connected — you can close this window.')
  } catch (err: any) {
    sendCallbackPage(res, false, `Token exchange failed: ${err?.response?.data?.error_description ?? err.message}`)
  }
})

// ── Stripe (Connect Standard OAuth) ────────────────────────
router.get('/stripe/start', requireAuth, (req, res) => {
  const clientId = process.env.STRIPE_CLIENT_ID
  if (!clientId) return res.status(501).json({ message: 'STRIPE_CLIENT_ID not configured on the server.' })
  const user = req.user as any
  const state = signState(user._id.toString(), 'stripe')
  const url = 'https://connect.stripe.com/oauth/authorize?' + new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'read_only',           // dashboards only need read access
    redirect_uri: stripeCallbackUrl(),
    state,
  }).toString()
  res.json({ url })
})

router.get('/stripe/callback', async (req, res) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string }
  if (error) return sendCallbackPage(res, false, `Stripe refused the request: ${error}`)
  if (!code || !state) return sendCallbackPage(res, false, 'Missing code/state on the callback.')
  const parsed = verifyState(state)
  if (!parsed || parsed.provider !== 'stripe') return sendCallbackPage(res, false, 'Invalid or expired state.')

  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return sendCallbackPage(res, false, 'Server not configured (STRIPE_SECRET_KEY).')

  try {
    const { data } = await axios.post(
      'https://connect.stripe.com/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${secret}`,
        },
        timeout: 15_000,
      },
    )
    await User.updateOne({ _id: parsed.userId }, {
      $set: {
        'dashboardTokens.stripe': {
          accessToken: data.access_token,
          stripeUserId: data.stripe_user_id,
          livemode: data.livemode,
          scope: data.scope,
        },
      },
    })
    sendCallbackPage(res, true, 'Stripe connected — you can close this window.')
  } catch (err: any) {
    sendCallbackPage(res, false, `Token exchange failed: ${err?.response?.data?.error_description ?? err.message}`)
  }
})

// ── Status endpoint (frontend polls this to know what to show) ─
router.get('/status', requireAuth, async (req, res) => {
  const user = req.user as any
  // Load with the normally-select:false fields so we can see if they exist.
  // Do NOT also project `dashboardTokens` — MongoDB rejects mixing a parent
  // path with its sub-paths in one projection (Location31249 path collision).
  const u = await User.findById(user._id).select('+dashboardTokens.google.accessToken +dashboardTokens.stripe.accessToken')
  res.json({
    google: !!(u?.dashboardTokens?.google?.accessToken),
    stripe: !!(u?.dashboardTokens?.stripe?.accessToken && u.dashboardTokens.stripe.stripeUserId),
  })
})

// ── Helpers ────────────────────────────────────────────────
function googleCallbackUrl(): string {
  const base = process.env.BACKEND_PUBLIC_URL ?? 'http://localhost:4000'
  return `${base}/api/dashboard/oauth/google/callback`
}
function stripeCallbackUrl(): string {
  const base = process.env.BACKEND_PUBLIC_URL ?? 'http://localhost:4000'
  return `${base}/api/dashboard/oauth/stripe/callback`
}

/** Send a tiny HTML page that notifies the opener via postMessage and then
 *  closes itself. Keeps the frontend's popup flow clean. */
function sendCallbackPage(res: any, ok: boolean, message: string) {
  const origin = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  const payload = JSON.stringify({ type: 'dashboard-oauth', ok, message })
  res.setHeader('Content-Type', 'text/html')
  res.send(`<!doctype html><html><body style="font-family:system-ui;background:#0b0d10;color:#f0f4f8;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px">
    <div>
      <div style="font-size:2rem;margin-bottom:8px">${ok ? '✓' : '✗'}</div>
      <div>${escapeHtml(message)}</div>
    </div>
    <script>
      try { window.opener && window.opener.postMessage(${payload}, ${JSON.stringify(origin)}); } catch (e) {}
      setTimeout(function(){ window.close(); }, 1200);
    </script>
  </body></html>`)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

export default router
