import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { Repository } from '../repository/repository.model'
import { User } from '../users/user.model'
import { createProvider } from './ai.factory'
import axios from 'axios'

const router = Router()
router.use(requireAuth)

router.post('/chat', async (req, res) => {
  const user = req.user as any
  const { repositoryId, message } = req.body

  if (!message?.trim()) return res.status(400).json({ message: 'Message is required' })

  const repo = await Repository.findOne({ _id: repositoryId, userId: user._id })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })

  // Get repository context from Python service
  let context = ''
  if (repo.localPath) {
    try {
      const { data } = await axios.post(`${process.env.PYTHON_SERVICE_URL}/repo/context`, {
        path: repo.localPath,
        query: message,
      })
      context = data.context ?? ''
    } catch {
      // Continue without context if Python service is unavailable
    }
  }

  const fullUser = await User.findById(user._id)
const provider = createProvider('github')
  const systemPrompt = `You are ForgeAI, an expert software engineer assistant.
You are analyzing the repository: ${repo.fullName}
Language: ${repo.language ?? 'Unknown'}

${context ? `Repository context:\n${context}` : ''}

Answer questions clearly and concisely. When suggesting code changes, always show the full modified file or function.`

  try {
    const response = await provider.chat([{ role: 'user', content: message }], systemPrompt)
    res.json({ response: response.content })
  }catch (err: any) {
    console.error('[ai] Full error:', err.response?.data ?? err.message)  // add this
    res.status(500).json({ message: err.response?.data?.error?.message ?? err.message ?? 'AI request failed' })
  }
})

export default router
