import { Router } from 'express'
import passport from 'passport'
import { z } from 'zod'
import { User } from '../users/user.model'
import { signToken } from '../../lib/jwt'
import { requireAuth } from '../../middleware/auth.middleware'

const router = Router()

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

// Register
router.post('/register', async (req, res) => {
  try {
    const body = registerSchema.parse(req.body)
    const existing = await User.findOne({ email: body.email })
    if (existing) return res.status(409).json({ message: 'Email already in use' })

    const user = await User.create(body)
    const token = signToken(user._id.toString())
    return res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, githubConnected: user.githubConnected },
    })
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ message: err.errors[0].message })
    return res.status(500).json({ message: 'Server error' })
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const body = loginSchema.parse(req.body)
    const user = await User.findOne({ email: body.email }).select('+password')
    if (!user || !(await user.comparePassword(body.password))) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }
    const token = signToken(user._id.toString())
    return res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar, githubConnected: user.githubConnected },
    })
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ message: err.errors[0].message })
    return res.status(500).json({ message: 'Server error' })
  }
})

// GitHub OAuth
router.get('/github', passport.authenticate('github', { session: false }))

router.get(
  '/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login?error=github` }),
  (req, res) => {
    const user = req.user as any
    const token = signToken(user._id.toString())
    res.redirect(`${process.env.FRONTEND_URL}/login?token=${token}`)
  },
)

// Me
router.get('/me', requireAuth, (req, res) => {
  const u = req.user as any
  res.json({ user: { id: u._id, name: u.name, email: u.email, avatar: u.avatar, githubConnected: u.githubConnected } })
})

export default router
