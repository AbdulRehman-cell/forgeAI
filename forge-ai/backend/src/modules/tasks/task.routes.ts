import { Router } from 'express'
import archiver from 'archiver'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import { requireAuth } from '../../middleware/auth.middleware'
import { Task } from './task.model'
import { Repository } from '../repository/repository.model'
import { User } from '../users/user.model'
import { taskQueue } from '../../lib/workers'

const router = Router()
router.use(requireAuth)

// List tasks
router.get('/', async (req, res) => {
  const user = req.user as any
  const { repositoryId, limit = 50 } = req.query
  const filter: any = { userId: user._id }
  if (repositoryId) filter.repositoryId = repositoryId
  const tasks = await Task.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).populate('repositoryId', 'fullName name')
  res.json({ tasks })
})

// Get single task
router.get('/:id', async (req, res) => {
  const user = req.user as any
  const task = await Task.findOne({ _id: req.params.id, userId: user._id })
  if (!task) return res.status(404).json({ message: 'Not found' })
  res.json({ task })
})

// Fix Workspace
router.post('/fix-workspace', async (req, res) => {
  const user = req.user as any
  const { repositoryId } = req.body

  const repo = await Repository.findOne({ _id: repositoryId, userId: user._id })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })
  if (repo.status !== 'ready') return res.status(400).json({ message: 'Repository is not ready' })

  const fullUser = await User.findById(user._id)

  const task = await Task.create({
    userId: user._id,
    repositoryId,
    type: 'fix_workspace',
    status: 'pending',
  })

  const job = await taskQueue.add('fix-workspace', {
    taskId: task._id.toString(),
    repositoryId,
    userId: user._id.toString(),
    localPath: repo.localPath,
    aiProvider: fullUser?.aiProvider ?? process.env.DEFAULT_AI_PROVIDER ?? 'github',
    type: 'fix_workspace',
  })

  task.jobId = job.id
  await task.save()

  res.status(201).json({ task })
})

// Fix single file
router.post('/fix-file', async (req, res) => {
  const user = req.user as any
  const { repositoryId, filePath } = req.body

  const repo = await Repository.findOne({ _id: repositoryId, userId: user._id })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })

  const fullUser = await User.findById(user._id)

  const task = await Task.create({
    userId: user._id,
    repositoryId,
    type: 'fix_file',
    metadata: { filePath },
  })

  await taskQueue.add('fix-file', {
    taskId: task._id.toString(),
    repositoryId,
    userId: user._id.toString(),
    localPath: repo.localPath,
    filePath,
    aiProvider: fullUser?.aiProvider ?? 'claude',
    type: 'fix_file',
  })

  res.status(201).json({ task })
})

// Create PR
router.post('/:id/create-pr', async (req, res) => {
  const user = req.user as any
  const task = await Task.findOne({ _id: req.params.id, userId: user._id })
  if (!task || task.status !== 'completed') return res.status(400).json({ message: 'Task not complete' })

  const repo = await Repository.findById(task.repositoryId)
  const fullUser = await User.findById(user._id).select('+githubAccessToken')
  if (!repo || !fullUser?.githubAccessToken) return res.status(400).json({ message: 'Missing data' })

  try {
    const { data } = await axios.post(
      `https://api.github.com/repos/${repo.fullName}/pulls`,
      {
        title: `ForgeAI: Auto-fix (${task._id.toString().slice(-6)})`,
        body: task.summary ?? 'Automated fixes applied by ForgeAI.',
        head: `forgeai/fix-${task._id.toString().slice(-6)}`,
        base: repo.defaultBranch,
      },
      { headers: { Authorization: `token ${fullUser.githubAccessToken}` } },
    )
    res.json({ url: data.html_url })
  } catch (err: any) {
    res.status(500).json({ message: err.response?.data?.message ?? 'PR creation failed' })
  }
})

// Download changes as zip
router.get('/:id/download', async (req, res) => {
  const user = req.user as any
  const task = await Task.findOne({ _id: req.params.id, userId: user._id })
  if (!task || !task.changes.length) return res.status(404).json({ message: 'No changes' })

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename=forge-changes-${task._id.toString().slice(-6)}.zip`)

  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.pipe(res)

  for (const change of task.changes) {
    archive.append(change.after, { name: change.path })
  }

  await archive.finalize()
})

export default router
