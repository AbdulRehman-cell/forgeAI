import { Router } from 'express'
import axios from 'axios'
import { requireAuth } from '../../middleware/auth.middleware'
import { User } from '../users/user.model'

const router = Router()
router.use(requireAuth)

router.get('/repos', async (req, res) => {
  const authed = req.user as any
  // Team members browse the owner's GitHub repos (they're working in the owner's workspace)
  const effectiveId = authed.teamOwnerId ?? authed._id

  const fullUser = await User.findById(effectiveId).select('+githubAccessToken')
  if (!fullUser?.githubAccessToken) {
    return res.status(400).json({ message: 'GitHub not connected' })
  }

  console.log('[github] token present:', !!fullUser.githubAccessToken, '| prefix:', fullUser.githubAccessToken?.slice(0, 8))
  try {
    const { data } = await axios.get('https://api.github.com/user/repos', {
      headers: { Authorization: `token ${fullUser.githubAccessToken}` },
      params: { per_page: 100, sort: 'updated', type: 'all' },
    })
    res.json({ repositories: data })
  } catch (err: any) {
    const status = err.response?.status
    const msg = err.response?.data?.message ?? err.message ?? 'Unknown error'
    console.error('[github] /repos failed:', status, msg)

    if (status === 401) {
      return res.status(401).json({ message: 'GitHub token expired — reconnect GitHub in Settings' })
    }
    if (status === 403) {
      const remaining = err.response?.headers?.['x-ratelimit-remaining']
      if (remaining === '0') {
        return res.status(429).json({ message: 'GitHub API rate limit hit — try again in a minute' })
      }
      return res.status(403).json({ message: `GitHub refused the request: ${msg}` })
    }
    res.status(500).json({ message: `Failed to fetch GitHub repositories: ${msg}` })
  }
})

export default router
