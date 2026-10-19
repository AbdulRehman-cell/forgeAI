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

// ─── Fix 3: R2 config pre-check (called once at server startup) ───────────────

export function checkR2Config(): void {
  const vars = {
    CLOUDFLARE_R2_ACCOUNT_ID: process.env.CLOUDFLARE_R2_ACCOUNT_ID,
    CLOUDFLARE_R2_ACCESS_KEY_ID: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    CLOUDFLARE_R2_BUCKET: process.env.CLOUDFLARE_R2_BUCKET,
    CLOUDFLARE_R2_PUBLIC_URL: process.env.CLOUDFLARE_R2_PUBLIC_URL,
  }
  const present = Object.entries(vars).filter(([, v]) => !!v).map(([k]) => k)
  const missing = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k)

  if (present.length === 0) {
    console.log('[hosting] R2 not configured — self-hosted deploys will use local disk (dev mode)')
    return
  }
  if (missing.length > 0) {
    console.warn(`[hosting] ⚠️  R2 partially configured — missing: ${missing.join(', ')}. Self-hosted deploys will FAIL until these are set.`)
    return
  }
  console.log(`[hosting] ✅ R2 configured — deploying to bucket "${vars.CLOUDFLARE_R2_BUCKET}" at ${vars.CLOUDFLARE_R2_PUBLIC_URL}`)
}

function r2Configured(): boolean {
  return !!(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
    process.env.CLOUDFLARE_R2_BUCKET &&
    process.env.CLOUDFLARE_R2_PUBLIC_URL
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

function r2PublicUrl(slug: string): string {
  const base = process.env.CLOUDFLARE_R2_PUBLIC_URL!.replace(/\/$/, '')
  return `${base}/sites/${slug}/index.html`
}

// ─── Fix 1: validate localPath has deployable files ──────────────────────────

function countDeployableFiles(dir: string): number {
  let count = 0
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return 0 }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue
    if (entry.isDirectory()) count += countDeployableFiles(path.join(dir, entry.name))
    else count++
  }
  return count
}

function assertHasFiles(localPath: string): void {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Source directory does not exist: ${localPath}. The site may not have been built yet.`)
  }
  const count = countDeployableFiles(localPath)
  if (count === 0) {
    throw new Error(`No deployable files found in ${localPath}. Run a build first before deploying.`)
  }
}

// ─── Fix 2: R2 upload with rollback on failure ────────────────────────────────

async function uploadDirToR2(localDir: string, slug: string): Promise<void> {
  const client = makeR2Client()
  const bucket = process.env.CLOUDFLARE_R2_BUCKET!
  const uploads: Array<{ key: string; fullPath: string }> = []

  function walk(dir: string, prefix: string) {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      const keyPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(fullPath, keyPath)
      else uploads.push({ key: `sites/${slug}/${keyPath}`, fullPath })
    }
  }

  walk(localDir, '')

  const uploadedKeys: string[] = []
  try {
    // Upload in batches of 20
    for (let i = 0; i < uploads.length; i += 20) {
      const batch = uploads.slice(i, i + 20)
      await Promise.all(batch.map(async ({ key, fullPath }) => {
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fs.readFileSync(fullPath),
          ContentType: mimeType(fullPath),
          CacheControl: 'public, max-age=31536000, immutable',
        }))
        uploadedKeys.push(key)
      }))
    }
  } catch (uploadErr) {
    // Rollback: delete whatever made it up before the failure
    if (uploadedKeys.length > 0) {
      try {
        await client.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: uploadedKeys.map(Key => ({ Key })) },
        }))
      } catch {
        // Rollback best-effort — log but don't mask the original error
        console.error(`[hosting] R2 rollback failed for slug "${slug}" — ${uploadedKeys.length} orphaned objects may remain`)
      }
    }
    throw uploadErr
  }
}

export async function deleteFromR2(slug: string): Promise<void> {
  const client = makeR2Client()
  const bucket = process.env.CLOUDFLARE_R2_BUCKET!
  const prefix = `sites/${slug}/`

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

  for (let i = 0; i < keys.length; i += 1000) {
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.slice(i, i + 1000).map(Key => ({ Key })) },
    }))
  }
}

// ─── Local fallback ───────────────────────────────────────────────────────────

function copyDir(src: string, dest: string): number {
  fs.mkdirSync(dest, { recursive: true })
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(src, { withFileTypes: true }) } catch { return 0 }
  let copied = 0
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copied += copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)  // let it throw — no silent swallow
      copied++
    }
  }
  return copied
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
  siteDir: string | null
  provider: 'r2' | 'local'
}

export async function selfHostedDeploy(options: {
  localPath: string
  name: string
  existingSlug?: string
}): Promise<SelfHostedResult> {
  const { localPath, name, existingSlug } = options
  const slug = existingSlug ?? `${sanitizeSlug(name)}-${Math.random().toString(36).slice(2, 6)}`

  // Fix 1: fail fast if nothing to deploy
  assertHasFiles(localPath)

  if (r2Configured()) {
    // Fix 2: upload with rollback on failure
    await uploadDirToR2(localPath, slug)
    return { url: r2PublicUrl(slug), slug, siteDir: null, provider: 'r2' }
  }

  // Local fallback (dev / no R2 configured)
  const siteDir = path.join(SITES_DIR, slug)
  if (fs.existsSync(siteDir)) fs.rmSync(siteDir, { recursive: true, force: true })
  copyDir(localPath, siteDir)  // now throws on any file error
  return { url: localUrl(slug), slug, siteDir, provider: 'local' }
}
