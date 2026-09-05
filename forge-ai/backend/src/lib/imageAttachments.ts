// Turns uploaded image attachments into model input, OCR-first:
//  - image had readable text  → an "[IMAGE TEXT]" block (model sees text only)
//  - no text (design/photo)   → base64 data URL for the vision model

import fs from 'fs'
import path from 'path'
import { UPLOADS_DIR } from '../modules/uploads/upload.routes'

export interface ImageAttachment {
  url: string
  text?: string
  hasText?: boolean
  originalName?: string
}

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
}

/** Resolve an /uploads/<userId>/<file> URL to a safe absolute path (own files only). */
function safeUploadPath(url: string, userId: string): string | null {
  const m = /^\/uploads\/([^/]+)\/([^/]+)$/.exec(url)
  if (!m || m[1] !== userId) return null
  const abs = path.join(UPLOADS_DIR, m[1], m[2])
  const root = path.resolve(UPLOADS_DIR)
  if (!path.resolve(abs).startsWith(root + path.sep)) return null
  return fs.existsSync(abs) ? abs : null
}

export function resolveAttachments(
  images: ImageAttachment[] | undefined,
  userId: string,
): { ocrText: string; dataUrls: string[] } {
  const blocks: string[] = []
  const dataUrls: string[] = []

  for (const img of images ?? []) {
    const label = img.originalName ?? 'image'
    if (img.hasText && img.text?.trim()) {
      blocks.push(`[IMAGE TEXT — extracted from attached image "${label}"]:\n${img.text.trim()}`)
      continue
    }
    // No text detected → real image for the vision model
    const abs = typeof img.url === 'string' ? safeUploadPath(img.url, userId) : null
    if (!abs) continue
    const mime = MIME_BY_EXT[path.extname(abs).toLowerCase()] ?? 'image/png'
    dataUrls.push(`data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`)
  }

  return { ocrText: blocks.length ? `\n\n${blocks.join('\n\n')}` : '', dataUrls }
}
