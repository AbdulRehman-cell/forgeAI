// Local folder workspaces — lets the web app open any folder on the machine
// the backend runs on (same trust model as Claude Code: it's the user's own box).

import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import os from 'os'
import axios from 'axios'
import multer from 'multer'
import AdmZip from 'adm-zip'
import { requireAuth } from '../../middleware/auth.middleware'
import { Repository } from '../repository/repository.model'

const WORKSPACES_DIR = process.env.WORKSPACES_DIR ?? path.join(process.cwd(), 'workspaces')
if (!fs.existsSync(WORKSPACES_DIR)) fs.mkdirSync(WORKSPACES_DIR, { recursive: true })

const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) cb(null, true)
    else cb(new Error('Only .zip files are allowed'))
  },
})

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

// ─── Upload a ZIP of a local project ──────────────────────────
router.post('/upload-zip', zipUpload.single('project'), async (req, res) => {
  const user = req.user as any
  const file = req.file
  if (!file) return res.status(400).json({ message: 'No zip file uploaded (field: "project")' })

  const originalName = path.basename(file.originalname, '.zip') || 'project'
  const slug = `${Date.now()}-${originalName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()}`
  const destDir = path.join(WORKSPACES_DIR, user._id.toString(), slug)
  fs.mkdirSync(destDir, { recursive: true })

  try {
    const zip = new AdmZip(file.buffer)
    const entries = zip.getEntries()

    // Detect top-level folder wrapping (e.g. when user zips a folder)
    const topDirs = new Set<string>()
    entries.forEach(e => { const parts = e.entryName.split('/'); if (parts.length > 1) topDirs.add(parts[0]) })
    const stripPrefix = topDirs.size === 1 ? `${[...topDirs][0]}/` : ''

    entries.forEach(entry => {
      if (entry.isDirectory) return
      let relPath = entry.entryName
      if (stripPrefix && relPath.startsWith(stripPrefix)) relPath = relPath.slice(stripPrefix.length)
      if (!relPath) return
      const outPath = path.join(destDir, relPath)
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      fs.writeFileSync(outPath, entry.getData())
    })
  } catch (err: any) {
    fs.rmSync(destDir, { recursive: true, force: true })
    return res.status(400).json({ message: `Failed to extract zip: ${err.message}` })
  }

  const existing = await Repository.findOne({ userId: user._id, localPath: destDir, source: 'local' })
  if (existing) return res.json({ repository: existing })

  // Store zip in MongoDB (capped at 14 MB) so files survive Render restarts
  const zipForDb = file.buffer.length <= 14 * 1024 * 1024 ? file.buffer : undefined

  const repo = await Repository.create({
    userId: user._id,
    githubId: -Date.now(),
    name: originalName,
    fullName: `local/${originalName}`,
    description: destDir,
    private: true,
    defaultBranch: 'main',
    cloneUrl: `file:///${destDir.replace(/\\/g, '/')}`,
    localPath: destDir,
    status: 'ready',
    indexed: false,
    source: 'local',
    workspaceZip: zipForDb,
  })

  const PYTHON_SERVICE = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:5001'
  axios.post(`${PYTHON_SERVICE}/repo/index`, { path: destDir, repositoryId: repo._id.toString() })
    .then(() => Repository.updateOne({ _id: repo._id }, { indexed: true }))
    .catch(() => {})

  res.status(201).json({ repository: repo })
})

// ─── Re-upload ZIP to restore a lost workspace ─────────────────
router.post('/reupload-zip/:repositoryId', zipUpload.single('project'), async (req, res) => {
  const user = req.user as any
  const file = req.file
  if (!file) return res.status(400).json({ message: 'No zip file uploaded (field: "project")' })

  const repo = await Repository.findOne({ _id: req.params.repositoryId, userId: user._id })
  if (!repo) return res.status(404).json({ message: 'Repository not found' })

  // Re-extract to the original localPath (or a fresh one if path changed)
  const destDir = repo.localPath ?? path.join(WORKSPACES_DIR, user._id.toString(), `${Date.now()}-${repo.name}`)
  fs.mkdirSync(destDir, { recursive: true })

  try {
    const zip = new AdmZip(file.buffer)
    const entries = zip.getEntries()
    const topDirs = new Set<string>()
    entries.forEach(e => { const parts = e.entryName.split('/'); if (parts.length > 1) topDirs.add(parts[0]) })
    const stripPrefix = topDirs.size === 1 ? `${[...topDirs][0]}/` : ''
    entries.forEach(entry => {
      if (entry.isDirectory) return
      let relPath = entry.entryName
      if (stripPrefix && relPath.startsWith(stripPrefix)) relPath = relPath.slice(stripPrefix.length)
      if (!relPath) return
      const outPath = path.join(destDir, relPath)
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      fs.writeFileSync(outPath, entry.getData())
    })
  } catch (err: any) {
    return res.status(400).json({ message: `Failed to extract zip: ${err.message}` })
  }

  repo.localPath = destDir
  repo.status = 'ready'
  if (file.buffer.length <= 14 * 1024 * 1024) {
    ;(repo as any).workspaceZip = file.buffer
  }
  await repo.save()

  res.json({ repository: repo })
})

export default router
