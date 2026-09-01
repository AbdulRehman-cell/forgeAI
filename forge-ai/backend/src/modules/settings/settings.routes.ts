import { Router } from 'express'
import axios from 'axios'
import { requireAuth } from '../../middleware/auth.middleware'
import { User } from '../users/user.model'

const router = Router()
router.use(requireAuth)

router.put('/ai-provider', async (req, res) => {
  const user = req.user as any
  const { provider } = req.body
  if (!['openai', 'claude', 'gemini'].includes(provider)) {
    return res.status(400).json({ message: 'Invalid provider' })
  }
  await User.findByIdAndUpdate(user._id, { aiProvider: provider })
  res.json({ message: 'Updated' })
})

router.get('/', async (req, res) => {
  const user = req.user as any
  const fullUser = await User.findById(user._id).select('aiProvider settings +settings.waAccessToken').lean() as any
  res.json({
    aiProvider: fullUser?.aiProvider ?? 'claude',
    waConnected: !!(fullUser?.settings?.waAccessToken && fullUser?.settings?.waPhoneNumberId),
    waPhoneNumberId: fullUser?.settings?.waPhoneNumberId ?? '',
    // Never return the token to the frontend — just signal whether it's set
    waTokenSet: !!fullUser?.settings?.waAccessToken,
  })
})

// Save WhatsApp Business credentials
router.put('/whatsapp', async (req, res) => {
  const user = req.user as any
  const { accessToken, phoneNumberId } = req.body
  if (!accessToken || !phoneNumberId) {
    return res.status(400).json({ message: 'accessToken and phoneNumberId are required' })
  }
  await User.findByIdAndUpdate(user._id, {
    'settings.waAccessToken': accessToken,
    'settings.waPhoneNumberId': phoneNumberId,
  })
  res.json({ message: 'WhatsApp credentials saved' })
})

// Send a real test WhatsApp message (hello_world template) to any number
router.post('/whatsapp/send-test', async (req, res) => {
  const user = req.user as any
  const { to } = req.body
  if (!to) return res.status(400).json({ message: 'Phone number required' })

  const fullUser = await User.findById(user._id).select('+settings.waAccessToken settings.waPhoneNumberId').lean() as any
  const token: string = fullUser?.settings?.waAccessToken ?? ''
  const phoneId: string = fullUser?.settings?.waPhoneNumberId ?? ''

  if (!token || !phoneId) {
    return res.status(400).json({ message: 'No WhatsApp credentials saved yet' })
  }

  // Strip formatting, remove leading +
  const phone = to.trim().replace(/[\s\-\(\)]/g, '').replace(/^\+/, '')

  try {
    const { data } = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: { name: 'hello_world', language: { code: 'en_US' } },
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
    )
    res.json({ ok: true, messageId: data?.messages?.[0]?.id })
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message ?? err?.message
    res.status(422).json({ ok: false, error: msg })
  }
})

// Test WhatsApp credentials by fetching the phone number info from Meta
router.post('/whatsapp/test', async (req, res) => {
  const user = req.user as any
  const fullUser = await User.findById(user._id).select('+settings.waAccessToken settings.waPhoneNumberId').lean() as any
  const token: string = fullUser?.settings?.waAccessToken ?? ''
  const phoneId: string = fullUser?.settings?.waPhoneNumberId ?? ''
  if (!token || !phoneId) {
    return res.status(400).json({ message: 'No WhatsApp credentials saved yet' })
  }
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v19.0/${phoneId}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
    )
    res.json({ ok: true, displayName: data.display_phone_number, verifiedName: data.verified_name })
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message ?? err?.message
    res.status(422).json({ ok: false, error: msg })
  }
})

export default router
