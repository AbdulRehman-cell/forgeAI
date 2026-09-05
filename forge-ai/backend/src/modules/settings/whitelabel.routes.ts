import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { User } from '../users/user.model'

const router = Router()
router.use(requireAuth)

/** Get current white-label config */
router.get('/', async (req, res) => {
  const authed = req.user as any
  const user = await User.findById(authed._id)
  if (!user) return res.status(404).json({ message: 'Not found' })
  res.json({ whiteLabel: user.whiteLabel ?? {} })
})

/** Save white-label config (Pro/Team only) */
router.put('/', async (req, res) => {
  const authed = req.user as any
  const user = await User.findById(authed._id)
  if (!user) return res.status(404).json({ message: 'Not found' })
  if (!['pro', 'team'].includes(user.plan)) {
    return res.status(403).json({ message: 'White-label branding requires a Pro or Team plan' })
  }

  const { brandName, logoUrl, primaryColor, supportEmail } = req.body
  user.whiteLabel = {
    brandName: brandName?.trim() || undefined,
    logoUrl: logoUrl?.trim() || undefined,
    primaryColor: primaryColor?.trim() || undefined,
    supportEmail: supportEmail?.trim() || undefined,
  }
  await user.save()
  res.json({ whiteLabel: user.whiteLabel })
})

export default router
