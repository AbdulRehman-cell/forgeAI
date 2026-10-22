import fs from 'fs'
import path from 'path'
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

export const SITES_DIR = process.env.SITES_DIR ?? path.join(process.cwd(), 'sites')

// ─── Helpers ──────────────────────────────────────────────────────────────────

// We no longer skip dist/build — when deploying we target those directories directly
const SKIP = new Set(['node_modules', '.git', '.env', '__pycache__', 'venv', '.venv', 'coverage', '.turbo'])

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

export function makeSlug(name: string): string {
  return `${sanitizeSlug(name)}-${Math.random().toString(36).slice(2, 6)}`
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

// ─── Find the right directory to deploy ─────────────────────────────────────
// Priority: look for a built static output folder first, fall back to root.
// This handles: static sites (index.html at root), Vite/CRA (dist/ or build/),
// MERN sites (client/dist/ or client/build/), and Next.js (out/ or .next/out/).

const DEPLOY_CANDIDATES = [
  'dist',
  'build',
  'out',
  path.join('client', 'dist'),
  path.join('client', 'build'),
  path.join('frontend', 'dist'),
  path.join('frontend', 'build'),
  path.join('public'),
]

export function findDeployRoot(localPath: string): string {
  // Check each candidate for an index.html — first match wins
  for (const candidate of DEPLOY_CANDIDATES) {
    const dir = path.join(localPath, candidate)
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir
  }
  // Fall back to root if index.html is there directly (plain static site)
  if (fs.existsSync(path.join(localPath, 'index.html'))) return localPath
  throw new Error(
    `No built static files found. Expected index.html in one of: ${DEPLOY_CANDIDATES.join(', ')}, or the project root.\n` +
    `Run your build step first (e.g. "npm run build" inside the client folder) then redeploy.`
  )
}

// ─── Pre-build patches ───────────────────────────────────────────────────────

// Patch BrowserRouter → HashRouter so SPA routes survive hard refreshes on any
// static host (R2, S3, GitHub Pages) without needing server-side URL rewriting.
// Also fixes the common AI generation bug where Routes/Route/Link are used but
// no Router wrapper exists at all — injects HashRouter into the entry file.
export function patchRouterForStaticHosting(srcDir: string): number {
  if (!fs.existsSync(srcDir)) return 0
  let count = 0
  let entryFile = ''
  let usesRouterComponents = false

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue
        walk(full)
      } else if (/\.[jt]sx?$/.test(entry.name)) {
        try {
          let src = fs.readFileSync(full, 'utf-8')

          // Track the app entry point (main.jsx / index.jsx / App.jsx)
          if (/^(main|index)\.[jt]sx?$/.test(entry.name)) entryFile = full

          // BrowserRouter → HashRouter
          if (src.includes('BrowserRouter') || src.includes('createBrowserRouter')) {
            src = src
              .replace(/\bBrowserRouter\b/g, 'HashRouter')
              .replace(/\bcreateBrowserRouter\b/g, 'createHashRouter')
            fs.writeFileSync(full, src, 'utf-8')
            count++
          }

          // Detect Router component usage (Routes, Route, Link, NavLink from react-router-dom)
          if (/from ['"]react-router-dom['"]/.test(src) &&
              (src.includes('Routes') || src.includes('<Route') || src.includes('<Link'))) {
            usesRouterComponents = true
          }
        } catch {}
      }
    }
  }
  walk(srcDir)

  // If the app uses Router components but has no Router provider, inject HashRouter
  // into the entry file around the root component render.
  if (usesRouterComponents && entryFile) {
    try {
      let src = fs.readFileSync(entryFile, 'utf-8')
      const hasRouter = /\b(BrowserRouter|HashRouter|MemoryRouter|RouterProvider)\b/.test(src)
      if (!hasRouter) {
        // Add HashRouter import if not already imported
        if (!src.includes('HashRouter')) {
          src = src.replace(
            /import\s+.*?from\s+['"]react-router-dom['"]/,
            (m) => m.replace(/}\s*from/, ', HashRouter } from').replace('HashRouter, HashRouter', 'HashRouter'),
          )
          // If no react-router-dom import exists at all, add one
          if (!src.includes('react-router-dom')) {
            src = `import { HashRouter } from 'react-router-dom'\n` + src
          }
        }
        // Wrap the root JSX element inside ReactDOM.createRoot().render() with HashRouter
        src = src
          .replace(/\.render\(\s*(<[A-Z][^>]*>|<React\.StrictMode>)/g, '.render(<HashRouter>$1')
          .replace(/(React\.StrictMode>|<\/[A-Z][^>]*>)\s*\)\s*\)/g, '$1</HashRouter>))')
        fs.writeFileSync(entryFile, src, 'utf-8')
        count++
      }
    } catch {}
  }

  return count
}

// Copy .env.example → .env in buildCwd so Vite picks up VITE_* vars at build time.
// Existing .env is never overwritten (user may have already set real values).
export function injectEnvForBuild(buildCwd: string): boolean {
  const envFile    = path.join(buildCwd, '.env')
  const exampleEnv = path.join(buildCwd, '.env.example')
  if (fs.existsSync(envFile) || !fs.existsSync(exampleEnv)) return false
  fs.copyFileSync(exampleEnv, envFile)
  return true
}

// ─── Patch index.html for subdirectory hosting ───────────────────────────────
// Vite/CRA build with absolute asset paths (/assets/...) which break when the
// site is served from a sub-path like /sites/{slug}/. Rewrite them to relative
// paths (./assets/...) so the browser resolves them against the current URL.
// Optionally injects an API proxy interceptor so relative /api/ calls are
// forwarded to the ForgeAI backend regardless of what env var the project uses.
function patchHtmlPaths(distDir: string, apiProxyUrl?: string): void {
  const indexPath = path.join(distDir, 'index.html')
  if (!fs.existsSync(indexPath)) return
  let html = fs.readFileSync(indexPath, 'utf-8')
  // src="/  href="/  →  src="./  href="./"  (skip protocol-relative // URLs)
  html = html.replace(/(src|href|content)="\/(?!\/)/g, '$1="./')
  // <base href="/"> → <base href="./">
  html = html.replace(/(<base\s[^>]*href=")\/(")/g, '$1./$2')

  // Inject API proxy interceptor — rewrites every relative /api/ fetch/XHR call
  // to the absolute ForgeAI proxy URL so the backend works from any CDN origin.
  if (apiProxyUrl) {
    const proxyScript = `<script>
(function(){
  var __API__=${JSON.stringify(apiProxyUrl)};
  function fixUrl(u){
    if(typeof u!=='string')return u;
    var origin=window.location.origin;
    // catch both relative "/api/..." and absolute "https://current-origin/api/..."
    if(u.startsWith('/api/')||u.startsWith(origin+'/api/')){
      var p=u.startsWith(origin)?u.slice(origin.length):u;
      return __API__+p;
    }
    return u;
  }
  var _f=window.fetch;
  window.fetch=function(u,o){return _f.call(this,fixUrl(u),o);};
  var _o=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){var a=Array.from(arguments);a[1]=fixUrl(u);return _o.apply(this,a);};
})();
</script>`
    // Insert right before </head> so it runs before any app JS
    html = html.includes('</head>')
      ? html.replace('</head>', proxyScript + '</head>')
      : proxyScript + html
  }

  fs.writeFileSync(indexPath, html, 'utf-8')
}

// ─── Fix 1: validate the deploy root has files ───────────────────────────────

function assertHasFiles(deployRoot: string): void {
  if (!fs.existsSync(deployRoot)) {
    throw new Error(`Deploy directory does not exist: ${deployRoot}. The site may not have been built yet.`)
  }
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(deployRoot, { withFileTypes: true }) } catch { entries = [] }
  if (entries.length === 0) {
    throw new Error(`Deploy directory is empty: ${deployRoot}. Run a build first before deploying.`)
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
  return `${base}/sites/${slug}/`
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
  apiProxyUrl?: string  // absolute URL of the ForgeAI backend proxy for this site's backend
}): Promise<SelfHostedResult> {
  const { localPath, name, existingSlug, apiProxyUrl } = options
  const slug = existingSlug ?? makeSlug(name)

  // Resolve to the actual built output directory (dist/, client/dist/, etc.)
  const deployRoot = findDeployRoot(localPath)

  // Fix 1: fail fast if nothing to deploy
  assertHasFiles(deployRoot)

  // Rewrite absolute asset paths to relative + inject API proxy interceptor
  patchHtmlPaths(deployRoot, apiProxyUrl)

  if (r2Configured()) {
    // Fix 2: upload with rollback on failure
    await uploadDirToR2(deployRoot, slug)
    return { url: r2PublicUrl(slug), slug, siteDir: null, provider: 'r2' }
  }

  // Local fallback (dev / no R2 configured)
  const siteDir = path.join(SITES_DIR, slug)
  if (fs.existsSync(siteDir)) fs.rmSync(siteDir, { recursive: true, force: true })
  copyDir(deployRoot, siteDir)  // now throws on any file error
  return { url: localUrl(slug), slug, siteDir, provider: 'local' }
}
