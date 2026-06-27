import { Router } from 'express'
import axios from 'axios'
import { requireAuth } from '../../middleware/auth.middleware'
import { User } from '../users/user.model'

const router = Router()
router.use(requireAuth)

router.get('/repos', async (req, res) => {
  const user = req.user as any
  const fullUser = await User.findById(user._id).select('+githubAccessToken')
  if (!fullUser?.githubAccessToken) return res.status(400).json({ message: 'GitHub not connected' })

  try {
    const { data } = await axios.get('https://api.github.com/user/repos', {
      headers: { Authorization: `token ${fullUser.githubAccessToken}` },
      params: { per_page: 100, sort: 'updated', type: 'all' },
    })
    res.json({ repositories: data })
  } catch {
    res.status(500).json({ message: 'Failed to fetch GitHub repositories' })
  }
})

export default router
