import fs from 'fs'
import path from 'path'
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

export const SITES_DIR = process.env.SITES_DIR ?? path.join(process.cwd(), 'sites')

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SKIP = new Set(['node_modules', '.git', '.env', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'coverage', '.turbo'])

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
}

function mimeType(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

function sanitizeSlug(name: string): string {
  return (name || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

// ─── R2 config ────────────────────────────────────────────────────────────────

function r2Configured(): boolean {
  return !!(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
    process.env.CLOUDFLARE_R2_BUCKET
  )
}

function makeR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
  })
}

function r2PublicUrl(slug: string, filePath = ''): string {
  const base = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/$/, '')
  if (!base) throw new Error('CLOUDFLARE_R2_PUBLIC_URL is not set')
  return filePath ? `${base}/sites/${slug}/${filePath}` : `${base}/sites/${slug}/index.html`
}

// ─── R2 upload ────────────────────────────────────────────────────────────────

async function uploadDirToR2(localDir: string, slug: string): Promise<void> {
  const client = makeR2Client()
  const bucket = process.env.CLOUDFLARE_R2_BUCKET!
  const uploads: Promise<void>[] = []

  function walk(dir: string, prefix: string) {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      const keyPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(fullPath, keyPath)
      } else {
        const key = `sites/${slug}/${keyPath}`
        uploads.push(
          client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fs.readFileSync(fullPath),
            ContentType: mimeType(fullPath),
            // Allow public access (bucket must have public access enabled in R2 dashboard)
            CacheControl: 'public, max-age=31536000, immutable',
          })).then(() => {})
        )
      }
    }
  }

  walk(localDir, '')
  // Upload in batches of 20 to avoid overwhelming the connection
  for (let i = 0; i < uploads.length; i += 20) {
    await Promise.all(uploads.slice(i, i + 20))
  }
}

export async function deleteFromR2(slug: string): Promise<void> {
  const client = makeR2Client()
  const bucket = process.env.CLOUDFLARE_R2_BUCKET!
  const prefix = `sites/${slug}/`

  // List all objects under this slug
  let continuationToken: string | undefined
  const keys: string[] = []
  do {
    const list = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))
    for (const obj of list.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (continuationToken)

  if (keys.length === 0) return

  // Delete in batches of 1000 (S3 limit)
  for (let i = 0; i < keys.length; i += 1000) {
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.slice(i, i + 1000).map(Key => ({ Key })) },
    }))
  }
}

// ─── Local fallback ───────────────────────────────────────────────────────────

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(src, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(srcPath, destPath)
    else { try { fs.copyFileSync(srcPath, destPath) } catch {} }
  }
}

function localUrl(slug: string): string {
  const base = (process.env.SITES_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, '')
  return `${base}/sites/${slug}`
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function siteUrl(slug: string): string {
  if (r2Configured()) return r2PublicUrl(slug)
  return localUrl(slug)
}

export interface SelfHostedResult {
  url: string
  slug: string
  siteDir: string | null  // null when using R2 (no local copy kept)
  provider: 'r2' | 'local'
}

export async function selfHostedDeploy(options: {
  localPath: string
  name: string
  existingSlug?: string
}): Promise<SelfHostedResult> {
  const { localPath, name, existingSlug } = options
  const slug = existingSlug ?? `${sanitizeSlug(name)}-${Math.random().toString(36).slice(2, 6)}`

  if (r2Configured()) {
    // Upload to Cloudflare R2 — ForgeAI server is out of the serving path
    await uploadDirToR2(localPath, slug)
    return { url: r2PublicUrl(slug), slug, siteDir: null, provider: 'r2' }
  }

  // Local fallback (dev / no R2 configured)
  const siteDir = path.join(SITES_DIR, slug)
  if (fs.existsSync(siteDir)) fs.rmSync(siteDir, { recursive: true, force: true })
  copyDir(localPath, siteDir)
  return { url: localUrl(slug), slug, siteDir, provider: 'local' }
}
