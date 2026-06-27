import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.middleware'
import { Repository } from './repository.model'
import { taskQueue } from '../../lib/workers'
import axios from 'axios'
import path from 'path'
import fs from 'fs'

const router = Router()
router.use(requireAuth)

const REPOS_DIR = process.env.REPOS_DIR ?? path.join(process.cwd(), 'repos')

// List
router.get('/', async (req, res) => {
  const user = req.user as any
  const repositories = await Repository.find({ userId: user._id }).sort({ updatedAt: -1 })
  res.json({ repositories })
})

// Get one
router.get('/:id', async (req, res) => {
  const user = req.user as any
  const repository = await Repository.findOne({ _id: req.params.id, userId: user._id })
  if (!repository) return res.status(404).json({ message: 'Not found' })
  res.json({ repository })
})

// Import
router.post('/import', async (req, res) => {
  const user = req.user as any
  const { githubId, fullName, name, description, language, private: isPrivate, defaultBranch, cloneUrl } = req.body

  const existing = await Repository.findOne({ userId: user._id, githubId })
  if (existing) return res.status(409).json({ message: 'Repository already imported' })

  const repo = await Repository.create({
    userId: user._id,
    githubId,
    fullName,
    name,
    description,
    language,
    private: isPrivate,
    defaultBranch,
    cloneUrl,
    status: 'cloning',
  })

  // Queue clone + index job
  await taskQueue.add('clone-repo', { repositoryId: repo._id.toString(), userId: user._id.toString(), cloneUrl, type: 'clone_repo' })

  res.status(201).json({ repository: repo })
})

// File tree
router.get('/:id/tree', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.id, userId: user._id })
  if (!repo || !repo.localPath) return res.status(404).json({ message: 'Not found or not cloned' })

  try {
    const { data } = await axios.get(`${process.env.PYTHON_SERVICE_URL}/repo/tree`, {
      params: { path: repo.localPath },
    })
    res.json(data)
  } catch {
    res.status(500).json({ message: 'Failed to get file tree' })
  }
})

// File content
router.get('/:id/file', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOne({ _id: req.params.id, userId: user._id })
  if (!repo || !repo.localPath) return res.status(404).json({ message: 'Not found' })

  const filePath = path.join(repo.localPath, req.query.path as string)
  // Prevent path traversal
  if (!filePath.startsWith(repo.localPath)) return res.status(403).json({ message: 'Forbidden' })

  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found' })
  const content = fs.readFileSync(filePath, 'utf-8')
  res.json({ content })
})

// Delete
router.delete('/:id', async (req, res) => {
  const user = req.user as any
  const repo = await Repository.findOneAndDelete({ _id: req.params.id, userId: user._id })
  if (!repo) return res.status(404).json({ message: 'Not found' })
  res.json({ message: 'Deleted' })
})

export default router
