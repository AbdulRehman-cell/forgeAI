// Image uploads for Chat and Agent.
// Flow (Claude/GPT-style): upload → OCR → if the image contains readable
// text, the client sends the TEXT to the model; only text-free images
// (screenshots of designs, photos, diagrams) go to the model as images.

import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { requireAuth } from '../../middleware/auth.middleware'
import { extractText } from '../../lib/ocr'

export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads')

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'])
const MAX_SIZE = 8 * 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) cb(null, true)
    else cb(new Error('Only PNG, JPEG, WebP, GIF, or BMP images are allowed'))
  },
})

const router = Router()
router.use(requireAuth)

router.post('/image', upload.single('image'), async (req, res) => {
  const user = req.user as any
  const file = req.file
  if (!file) return res.status(400).json({ message: 'No image uploaded (field name: "image")' })

  const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/bmp': '.bmp' }[file.mimetype] ?? '.png'
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`
  const userDir = path.join(UPLOADS_DIR, user._id.toString())
  fs.mkdirSync(userDir, { recursive: true })
  fs.writeFileSync(path.join(userDir, name), file.buffer)

  // OCR decides how the model will see this image
  const ocr = await extractText(file.buffer)

  res.status(201).json({
    url: `/uploads/${user._id.toString()}/${name}`,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    hasText: ocr.hasText,
    text: ocr.text,
    confidence: Math.round(ocr.confidence),
  })
})

export default router
