import { Router } from 'express'
import axios from 'axios'
import { requireAuth } from '../../middleware/auth.middleware'
import { User } from '../users/user.model'

const router = Router()

const META_APP_ID     = () => process.env.META_APP_ID ?? ''
const META_APP_SECRET = () => process.env.META_APP_SECRET ?? ''
const REDIRECT_URI    = () =>
  process.env.META_WA_REDIRECT_URI ??
  `${process.env.BACKEND_URL ?? 'http://localhost:4000'}/api/whatsapp/callback`

// GET /api/whatsapp/connect — return the Meta OAuth URL (no redirect, same as Gmail)
router.get('/connect', requireAuth, (req, res) => {
  if (!META_APP_ID() || !META_APP_SECRET()) {
    return res.status(501).json({
      message: 'WhatsApp OAuth not configured. Add META_APP_ID and META_APP_SECRET to your .env file.',
    })
  }
  const params = new URLSearchParams({
    client_id: META_APP_ID(),
    redirect_uri: REDIRECT_URI(),
    scope: 'whatsapp_business_management,whatsapp_business_messaging',
    response_type: 'code',
    state: (req.user as any)._id.toString(),
  })
  const url = `https://www.facebook.com/v19.0/dialog/oauth?${params}`
  res.json({ url })
})

// GET /api/whatsapp/callback — exchange code, discover phone number, save, redirect
router.get('/callback', async (req, res) => {
  const { code, state: userId, error, error_description } = req.query
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'

  if (error) {
    return res.redirect(`${frontendUrl}/settings?wa=error&reason=${encodeURIComponent(String(error_description ?? error))}`)
  }
  if (!code || !userId) {
    return res.redirect(`${frontendUrl}/settings?wa=error&reason=missing_params`)
  }

  try {
    // 1. Exchange code for short-lived user access token
    const { data: tokenData } = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        client_id: META_APP_ID(),
        client_secret: META_APP_SECRET(),
        redirect_uri: REDIRECT_URI(),
        code: String(code),
      },
      timeout: 15_000,
    })

    // 2. Exchange for long-lived token (60 days)
    const { data: longTokenData } = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: META_APP_ID(),
        client_secret: META_APP_SECRET(),
        fb_exchange_token: tokenData.access_token,
      },
      timeout: 15_000,
    })
    const accessToken: string = longTokenData.access_token ?? tokenData.access_token

    // 3. Discover WhatsApp Business Accounts + phone numbers
    const { data: me } = await axios.get('https://graph.facebook.com/v19.0/me', {
      params: {
        fields: 'businesses{whatsapp_business_accounts{id,phone_numbers{id,display_phone_number,verified_name}}}',
        access_token: accessToken,
      },
      timeout: 15_000,
    })

    // Flatten all phone numbers across all WABAs
    type PhoneEntry = { phoneNumberId: string; displayPhone: string; verifiedName: string }
    const phones: PhoneEntry[] = []
    for (const biz of me?.businesses?.data ?? []) {
      for (const waba of biz?.whatsapp_business_accounts?.data ?? []) {
        for (const ph of waba?.phone_numbers?.data ?? []) {
          phones.push({
            phoneNumberId: ph.id,
            displayPhone: ph.display_phone_number,
            verifiedName: ph.verified_name,
          })
        }
      }
    }

    if (phones.length === 0) {
      return res.redirect(`${frontendUrl}/settings?wa=error&reason=no_phone_numbers`)
    }

    // Auto-select the first phone (if multiple, user can switch later)
    const phone = phones[0]

    await User.findByIdAndUpdate(String(userId), {
      'settings.waAccessToken': accessToken,
      'settings.waPhoneNumberId': phone.phoneNumberId,
      'settings.waDisplayPhone': phone.displayPhone,
      'settings.waVerifiedName': phone.verifiedName,
    })

    res.redirect(
      `${frontendUrl}/settings?wa=connected&phone=${encodeURIComponent(phone.displayPhone)}&name=${encodeURIComponent(phone.verifiedName)}`,
    )
  } catch (err: any) {
    console.error('[whatsapp-oauth] Callback error:', err?.response?.data ?? err?.message)
    const msg = err?.response?.data?.error?.message ?? err?.message ?? 'unknown'
    res.redirect(`${frontendUrl}/settings?wa=error&reason=${encodeURIComponent(msg)}`)
  }
})

// GET /api/whatsapp/status
router.get('/status', requireAuth, async (req, res) => {
  const user = await User.findById((req.user as any)._id).select('+settings.waAccessToken settings.waPhoneNumberId settings.waDisplayPhone settings.waVerifiedName').lean() as any
  res.json({
    connected: !!(user?.settings?.waAccessToken && user?.settings?.waPhoneNumberId),
    displayPhone: user?.settings?.waDisplayPhone ?? null,
    verifiedName: user?.settings?.waVerifiedName ?? null,
    phoneNumberId: user?.settings?.waPhoneNumberId ?? null,
  })
})

// DELETE /api/whatsapp/disconnect
router.delete('/disconnect', requireAuth, async (req, res) => {
  await User.findByIdAndUpdate((req.user as any)._id, {
    $unset: {
      'settings.waAccessToken': 1,
      'settings.waPhoneNumberId': 1,
      'settings.waDisplayPhone': 1,
      'settings.waVerifiedName': 1,
    },
  })
  res.json({ disconnected: true })
})

export default router
