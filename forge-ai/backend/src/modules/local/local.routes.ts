// Local folder workspaces — lets the web app open any folder on the machine
// the backend runs on (same trust model as Claude Code: it's the user's own box).

import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import os from 'os'
import axios from 'axios'
import { requireAuth } from '../../middleware/auth.middleware'
import { Repository } from '../repository/repository.model'

const router = Router()
router.use(requireAuth)

// ─── Browse the filesystem (directories only, for the folder picker) ──
router.get('/browse', (req, res) => {
  const requested = (req.query.path as string) ?? ''

  // Root view — list drives on Windows, / and home elsewhere
  if (!requested) {
    if (process.platform === 'win32') {
      const drives: { name: string; path: string }[] = []
      for (let c = 65; c <= 90; c++) {
        const letter = String.fromCharCode(c)
        const drivePath = `${letter}:\\`
        try { if (fs.existsSync(drivePath)) drives.push({ name: `${letter}:`, path: drivePath }) } catch {}
      }
      return res.json({ current: '', parent: null, home: os.homedir(), dirs: drives })
    }
    return res.json({
      current: '',
      parent: null,
      home: os.homedir(),
      dirs: [{ name: '/', path: '/' }, { name: '~ (home)', path: os.homedir() }],
    })
  }

  const current = path.resolve(requested)
  if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) {
    return res.status(400).json({ message: 'Not a directory' })
  }

  let items: fs.Dirent[] = []
  try { items = fs.readdirSync(current, { withFileTypes: true }) } catch (err: any) {
    return res.status(403).json({ message: `Cannot read directory: ${err.message}` })
  }

  const dirs = items
    .filter((i) => i.isDirectory() && !i.name.startsWith('.') && i.name !== 'node_modules')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => ({ name: i.name, path: path.join(current, i.name) }))

  const parentDir = path.dirname(current)
  res.json({
    current,
    parent: parentDir === current ? '' : parentDir, // drive root → back to drive list
    home: os.homedir(),
    dirs,
  })
})

// ─── Open a folder as a local workspace ────────────────────
router.post('/open', async (req, res) => {
  const user = req.user as any
  const { path: folderPath } = req.body

  if (!folderPath || typeof folderPath !== 'string') {
    return res.status(400).json({ message: 'path is required' })
  }

  const abs = path.resolve(folderPath)
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    return res.status(400).json({ message: 'Folder does not exist' })
  }

  // Already opened? Return the existing workspace
  const existing = await Repository.findOne({ userId: user._id, localPath: abs, source: 'local' })
  if (existing) return res.json({ repository: existing })

  const name = path.basename(abs) || abs
  const repo = await Repository.create({
    userId: user._id,
    githubId: -Date.now(), // synthetic id — keeps the (userId, githubId) unique index happy
    name,
    fullName: `local/${name}`,
    description: abs,
    private: true,
    defaultBranch: 'main',
    cloneUrl: `file:///${abs.replace(/\\/g, '/')}`,
    localPath: abs,
    status: 'ready',
    indexed: false,
    source: 'local',
  })

  // Best-effort semantic index so chat context works (Python service optional)
  const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:5001'
  axios.post(`${PYTHON_SERVICE}/repo/index`, { path: abs, repositoryId: repo._id.toString() })
    .then(() => Repository.updateOne({ _id: repo._id }, { indexed: true }))
    .catch(() => console.warn('[local] Python service unavailable, skipping index'))

  res.status(201).json({ repository: repo })
})

export default router
