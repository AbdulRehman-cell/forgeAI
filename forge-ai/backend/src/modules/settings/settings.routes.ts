import { Router } from 'express'
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
  const fullUser = await User.findById(user._id)
  res.json({ aiProvider: fullUser?.aiProvider ?? 'claude' })
})

export default router
