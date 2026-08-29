// ─── Import an existing brand website ──────────────────────
// Fetches a brand's current site and extracts its REAL content — company name,
// value propositions, services, copy, contact details, colors, images, and page
// structure — so the Builder can rebuild it dramatically better using the
// brand's own facts instead of AI-invented filler.
//
// Dependency-free on purpose: regex extraction over the fetched HTML (no cheerio
// /jsdom to install). Every step is defensive — a failed import returns null and
// the build continues normally.

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import https from 'https'

// Ambient declaration so ts-node's per-file compile doesn't fail with TS2307
// when puppeteer isn't hoisted where its resolver expects. The runtime import
// still uses Node's normal module resolution — and if puppeteer is genuinely
// missing at runtime, `SpaRenderer.start()` catches it and falls back to the
// static-fetch path.
declare module 'puppeteer'

// Plenty of small-business sites have an expired or mismatched certificate. That
// must not stop us reading their PUBLIC marketing pages — we send no credentials
// and only read markup — so a certificate failure falls back to an unverified
// fetch. The problem is not swallowed: `hasValidTls()` reports it so the audit
// can score it down and show the client that visitors see a security warning.
const INSECURE_AGENT = new https.Agent({ rejectUnauthorized: false })
const TLS_ERROR = /CERT|SELF_SIGNED|ALTNAME|certificate|SSL/i

export interface BrandProfile {
  url: string
  siteName?: string
  tagline?: string
  description?: string
  headings: string[]
  paragraphs: string[]
  navItems: string[]
  emails: string[]
  phones: string[]
  address?: string
  socials: string[]
  images: string[]
  /** Per-image caption + nearest section context, aligned by index with
   *  `images`. Written into the PHOTO LIBRARY prompt so the generator knows
   *  what each photo actually shows and places it in the right section
   *  (hero photo in the hero, team photo on the team page, etc.) instead of
   *  picking randomly. */
  imageMeta: { alt: string; context: string }[]
  colors: string[]
  /** pages actually crawled (homepage + inner pages) */
  pagesRead: string[]
  /** facts lifted from JSON-LD structured data (survives JS-only sites) */
  structured: Record<string, string>
  /** Concatenated + truncated stylesheet(s) from the original site. Passed to
   *  the CSS generator as a "beat this" reference so the new design cannot
   *  regress on visual specificity. Capped so it never balloons prompt cost. */
  originalCss?: string
}

/** Block private/loopback hosts so a user-supplied URL can't be used to probe
 *  the internal network (SSRF). Only public http(s) URLs are importable. */
export function isPublicHttpUrl(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const h = u.hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false
  if (h === '::1' || h === '[::1]') return false
  // IPv4 literals in private / loopback / link-local ranges
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 127 || a === 10 || a === 0) return false
    if (a === 192 && b === 168) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 169 && b === 254) return false
  }
  return true
}

// Named entities that show up constantly in real marketing copy. Without these
// the raw "&mdash;" / "&bull;" text would leak straight into the rebuilt site.
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  mdash: '—', ndash: '–', hellip: '…', bull: '•', middot: '·',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  trade: '™', reg: '®', copy: '©', deg: '°', eacute: 'é', times: '×',
}

const decode = (s: string): string =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ').trim()

const meta = (html: string, key: string): string | undefined => {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'i')
  const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${key}["']`, 'i')
  const v = html.match(re)?.[1] ?? html.match(alt)?.[1]
  return v ? decode(v) : undefined
}

/** All matches of a capture group, decoded, de-duped, non-empty. */
const allText = (html: string, re: RegExp, limit: number): string[] => {
  const out: string[] = []
  for (const m of html.matchAll(re)) {
    const t = decode(m[1].replace(/<[^>]+>/g, ' '))
    if (t && t.length > 1 && !out.includes(t)) out.push(t)
    if (out.length >= limit) break
  }
  return out
}

// Build stamp appended to our own asset URLs (?v=...) so each rebuild produces
// fresh URLs a browser cannot have cached.
const BUILD_STAMP = Date.now().toString(36)

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// ─── Headless SPA renderer ─────────────────────────────────
// A growing share of small-business/portfolio sites are Vite/React/Next SPAs
// whose static HTML is a single `<div id="root"></div>` — regex extraction
// gets nothing and the import silently returns null. This class runs the page
// in a real Chromium so client-rendered content actually shows up. One browser
// is shared across the whole crawl so we pay the launch cost once, not per page.
//
// Fail-soft: if puppeteer is not installed (postinstall skipped, CI without
// Chromium, etc.) `start()` returns null and the import falls back to its
// original static-HTML path.

/** How long the SPA body is allowed to stay `<div id="root"></div>` before the
 *  render is considered blank. Extended for React apps that hydrate late. */
const SPA_HYDRATION_WAIT_MS = Number(process.env.SPA_HYDRATION_WAIT_MS ?? 1200)

/** Heuristic: the HTML fetched fine but the body is essentially empty *and*
 *  the page ships a JS bundle — classic SPA shell (Vite/CRA/Next hydration
 *  target). We only pay the browser-launch cost when we're pretty sure it will
 *  actually help. */
function looksLikeSpa(html: string, extracted: PageData): boolean {
  if (extracted.headings.length > 0 || extracted.paragraphs.length > 0) return false
  // Common SPA shells: <div id="root">, <div id="app">, <div id="__next">, or
  // a body containing basically nothing but a single mount div.
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? ''
  const stripped = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '').trim()
  const mountOnly = /^<div\s+id=["'](root|app|__next|__nuxt|svelte)["'][^>]*>\s*<\/div>$/i.test(stripped)
  if (mountOnly) return true
  // Or: has a JS module bundle and less than ~200 chars of visible text
  const hasModule = /<script[^>]+type=["']module["']/i.test(html) || /<script[^>]+src=["'][^"']*\/assets\/index-[^"']+\.js/i.test(html)
  const visibleText = stripped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return hasModule && visibleText.length < 200
}

export class SpaRenderer {
  private constructor(private browser: any) {}

  /** Try to start a shared headless browser. Returns null if puppeteer is not
   *  installed or the browser fails to launch — caller then falls back to
   *  plain static HTML fetches. */
  static async start(): Promise<SpaRenderer | null> {
    let puppeteer: any
    try {
      // Dynamic import so a missing package (or a failed Chromium download)
      // does not crash the whole backend at import time.
      puppeteer = (await import('puppeteer')).default ?? (await import('puppeteer'))
    } catch (err: any) {
      console.warn('[siteImport] puppeteer not available — cannot render SPA content:', err?.message ?? err)
      return null
    }
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      })
      return new SpaRenderer(browser)
    } catch (err: any) {
      console.warn('[siteImport] headless browser launch failed:', err?.message ?? err)
      return null
    }
  }

  /** Navigate to `url`, wait for the SPA to hydrate, return the fully-rendered
   *  outerHTML. Returns '' on any failure — same contract as `fetchHtml`. */
  async render(url: string, timeoutMs = 30000): Promise<string> {
    let page: any
    try {
      page = await this.browser.newPage()
      await page.setUserAgent(UA)
      await page.setViewport({ width: 1440, height: 900 })
      // Kill obvious noise before it stalls networkidle: analytics/tracking beacons
      // routinely keep the network "busy" long after the visible page is done.
      await page.setRequestInterception(true)
      page.on('request', (req: any) => {
        const rurl = req.url()
        if (/googletagmanager|google-analytics|gtag|facebook\.net|hotjar|clarity\.ms|segment|mixpanel|doubleclick/i.test(rurl)) {
          return req.abort()
        }
        req.continue()
      })
      await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs })
      // Extra beat for late React/Vue hydration writing into the mount div
      await new Promise((r) => setTimeout(r, SPA_HYDRATION_WAIT_MS))
      return await page.content()
    } catch (err: any) {
      console.warn(`[siteImport] SPA render failed for ${url}:`, err?.message ?? err)
      return ''
    } finally {
      if (page) { try { await page.close() } catch { /* already closed */ } }
    }
  }

  async close(): Promise<void> {
    try { await this.browser.close() } catch { /* already closed */ }
  }
}

/** Fetch a page's HTML. Generous timeout + one retry (brand sites are slow). */
async function fetchHtml(url: string, timeoutMs = 25000): Promise<string> {
  const { html } = await fetchHtmlDetailed(url, timeoutMs)
  return html
}

/** Like fetchHtml but reports WHY it failed, so the UI can say something useful
 *  instead of a generic "couldn't read that site". */
export async function fetchHtmlDetailed(url: string, timeoutMs = 25000): Promise<{ html: string; reason?: string; status?: number; insecureTls?: boolean }> {
  let reason: string | undefined
  let status: number | undefined
  let insecureTls = false
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await axios.get(url, {
        timeout: timeoutMs,
        maxRedirects: 4,
        maxContentLength: 5_000_000,
        responseType: 'text',
        // After a certificate failure, retry without verification (read-only)
        ...(insecureTls ? { httpsAgent: INSECURE_AGENT } : {}),
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        validateStatus: (s) => s >= 200 && s < 400,
      })
      const html = typeof res.data === 'string' ? res.data : String(res.data)
      if (!html.trim()) { reason = 'the server returned an empty page'; continue }
      return { html, status: res.status, insecureTls }
    } catch (err: any) {
      status = err?.response?.status
      const code = String(err?.code ?? '')
      const isTls = TLS_ERROR.test(code) || TLS_ERROR.test(String(err?.message ?? ''))
      if (isTls && !insecureTls) {
        // Retry immediately without certificate verification
        insecureTls = true
        reason = 'the site has an invalid HTTPS certificate'
        continue
      }
      if (status === 403 || status === 401) reason = 'the site blocks automated access (403)'
      else if (status === 404) reason = 'that address returned 404 — check the URL'
      else if (status && status >= 500) reason = `the site returned a server error (${status})`
      else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') reason = 'that domain could not be found — check the spelling'
      else if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') reason = 'the site took too long to respond'
      else if (code === 'ECONNREFUSED') reason = 'the connection was refused'
      else if (isTls) reason = 'the site has an invalid HTTPS certificate that could not be bypassed'
      else reason = err?.message ? String(err.message).slice(0, 120) : 'the request failed'
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1200))
    }
  }
  return { html: '', reason, status }
}

/** Is the site's HTTPS certificate actually valid? Reported in the audit — an
 *  invalid cert means real visitors get a browser security warning. */
export async function hasValidTls(url: string): Promise<boolean> {
  if (!/^https:/i.test(url)) return false
  try {
    await axios.head(url, { timeout: 10000, maxRedirects: 3, validateStatus: () => true })
    return true
  } catch (err: any) {
    if (TLS_ERROR.test(String(err?.code ?? '')) || TLS_ERROR.test(String(err?.message ?? ''))) return false
    return true // some other failure — not a certificate problem
  }
}

/** Try the obvious variants of what someone typed: as given, with/without www,
 *  and http as a last resort. Returns the first that actually serves HTML. */
export async function resolveSiteUrl(raw: string, timeoutMs = 25000): Promise<{ url: string; html: string; reason?: string }> {
  const cleaned = raw.trim().replace(/\s+/g, '')
  const withProto = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`
  let host = ''
  try { host = new URL(withProto).hostname } catch { return { url: withProto, html: '', reason: 'that is not a valid web address' } }

  const candidates = [withProto]
  const swapped = host.startsWith('www.')
    ? withProto.replace(`//${host}`, `//${host.slice(4)}`)
    : withProto.replace(`//${host}`, `//www.${host}`)
  candidates.push(swapped)
  if (/^https:/i.test(withProto)) candidates.push(withProto.replace(/^https:/i, 'http:'))

  let firstReason: string | undefined
  for (const c of candidates) {
    if (!isPublicHttpUrl(c)) continue
    const { html, reason } = await fetchHtmlDetailed(c, timeoutMs)
    if (html) return { url: c, html }
    firstReason ??= reason
  }
  return { url: withProto, html: '', reason: firstReason }
}

/** Facts from JSON-LD / Next.js data blobs. These survive on JavaScript-only
 *  sites where the visible markup is empty, so they rescue SPA imports. */
function extractStructured(html: string): Record<string, string> {
  const out: Record<string, string> = {}
  const put = (k: string, v: unknown) => {
    if (typeof v === 'string' && v.trim() && !out[k]) out[k] = decode(v).slice(0, 400)
  }
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach(visit); return }
    const t = String(node['@type'] ?? '')
    // Person is included because portfolio/freelancer SPAs (Vite/React/Next
    // with an empty <div id="root">) almost always ship a Person JSON-LD block
    // as their only crawlable content — without it, the body-extractor sees
    // zero text and the whole import returns null.
    if (/Organization|LocalBusiness|Corporation|Store|Restaurant|Hotel|ProfessionalService|Person/i.test(t)) {
      put('name', node.name); put('description', node.description)
      put('phone', node.telephone)
      // Person nodes commonly ship email as "mailto:you@x.com" — strip the
      // scheme so downstream code stores a real address, not a URL.
      const rawEmail = typeof node.email === 'string' ? node.email.replace(/^mailto:/i, '') : node.email
      put('email', rawEmail)
      if (node.address && typeof node.address === 'object') {
        const a = node.address
        put('address', [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry]
          .filter(Boolean).join(', '))
      } else put('address', node.address)
    }
    if (/Service|Product|Offer/i.test(t) && node.name) {
      out.services = `${out.services ? out.services + ', ' : ''}${decode(String(node.name))}`.slice(0, 500)
    }
    for (const v of Object.values(node)) if (v && typeof v === 'object') visit(v)
  }
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1].trim())) } catch { /* malformed JSON-LD is common */ }
  }
  return out
}

interface PageData {
  headings: string[]; paragraphs: string[]; navItems: string[]; images: string[]
  emails: string[]; phones: string[]; socials: string[]; colors: string[]
  links: string[]; address?: string; title?: string
  /** Per-image alt + section context, aligned by index with `images`. */
  imageMeta: { alt: string; context: string }[]
}

function extractPage(html: string, pageUrl: string): PageData {
  // Strip non-content before text extraction, but keep <noscript> — SPAs often
  // put their real copy there for crawlers.
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?noscript[^>]*>/gi, ' ')

  const abs = (src: string): string | null => {
    try { return new URL(src, pageUrl).href } catch { return null }
  }

  const headings = allText(body, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, 30)
  const paragraphs = allText(body, /<p[^>]*>([\s\S]*?)<\/p>/gi, 60).filter((p) => p.length > 45)
  // Fallbacks for SPA-ish markup that uses divs/spans instead of <p>
  if (paragraphs.length < 3) {
    paragraphs.push(...allText(body, /<(?:li|div|span)[^>]*>([^<]{60,400})<\/(?:li|div|span)>/gi, 30)
      .filter((p) => p.length > 60 && / /.test(p)))
  }

  const navBlock = body.match(/<nav[\s\S]*?<\/nav>/i)?.[0] ?? body.match(/<header[\s\S]*?<\/header>/i)?.[0] ?? ''
  const navItems = allText(navBlock, /<a[^>]*>([\s\S]*?)<\/a>/gi, 16).filter((t) => t.length < 30)

  const links: string[] = []
  for (const m of body.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    const a = abs(m[1])
    if (a && !links.includes(a)) links.push(a)
  }

  const emails = [...new Set([...body.matchAll(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g)].map((m) => m[0])
    .filter((e) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e)))]
  const phones = [...new Set([...body.matchAll(/(?:tel:|href=["']tel:)([+\d][\d\s().-]{6,20})/gi)]
    .map((m) => decode(m[1])))]
  const socials = [...new Set([...body.matchAll(
    /https?:\/\/(?:www\.)?(?:facebook|instagram|twitter|x|linkedin|youtube|tiktok)\.com\/[^\s"'<>]+/gi)].map((m) => m[0]))]

  const images: string[] = []
  const imageMeta: { alt: string; context: string }[] = []
  const pushImage = (url: string, alt: string, context: string) => {
    if (images.includes(url)) return
    images.push(url)
    imageMeta.push({ alt: alt.trim().slice(0, 140), context: context.trim().slice(0, 60) })
  }
  const og = meta(html, 'og:image')
  if (og) { const a = abs(og); if (a) pushImage(a, 'Open Graph share image', 'meta') }

  // Full <img> tag matches — we need the WHOLE tag to grab alt, and the
  // context BEFORE it to figure out what section it lives in.
  for (const m of body.matchAll(/<img[^>]*>/gi)) {
    const tag = m[0]
    const srcMatch = tag.match(/(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)
    if (!srcMatch) continue
    const a = abs(srcMatch[1])
    if (!a || /\.svg(\?|$)/i.test(a) || /(sprite|icon|pixel|1x1|blank|placeholder)/i.test(a)) continue
    const alt = tag.match(/\balt=["']([^"']+)["']/i)?.[1] ?? ''
    // Context: look back ~1500 chars for the nearest section class/id or heading text
    const idx = m.index ?? 0
    const before = body.slice(Math.max(0, idx - 1500), idx)
    const sectionMatch =
      before.match(/<(?:section|div|main|article|aside)[^>]*(?:id|class)=["']([^"']*(?:hero|about|team|service|feature|gallery|testimonial|cta|contact|footer|header|nav|banner|showcase|portfolio|product|division)[^"']*)["'][^>]*>[^<]*$/i)
    const nearestHeadingMatch = before.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>[\s\S]*?$/i)
    const context = sectionMatch
      ? (sectionMatch[1].split(/[\s-]+/).find((w: string) => /^(hero|about|team|service|feature|gallery|testimonial|cta|contact|footer|header|nav|banner|showcase|portfolio|product|division)/i.test(w)) ?? 'content')
      : nearestHeadingMatch
        ? nearestHeadingMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 40)
        : 'content'
    pushImage(a, decode(alt), context)
  }
  // Background images in inline styles (common for SPA hero sections)
  for (const m of body.matchAll(/background-image\s*:\s*url\(["']?([^"')]+)["']?\)/gi)) {
    const a = abs(m[1])
    if (a && !/\.svg(\?|$)/i.test(a)) pushImage(a, '', 'hero-bg')
  }

  const colors: string[] = []
  for (const m of html.matchAll(/#([0-9a-f]{6})\b/gi)) colors.push(`#${m[1].toLowerCase()}`)

  return {
    headings, paragraphs, navItems, images, imageMeta, emails, phones, socials, colors, links,
    address: body.match(/<address[^>]*>([\s\S]*?)<\/address>/i)?.[1],
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
  }
}

export async function importBrandSite(rawUrl: string): Promise<BrandProfile | null> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
  if (!isPublicHttpUrl(url)) return null

  let html = await fetchHtml(url)
  if (!html) return null

  // ── SPA rescue ──
  // If the static HTML fetch worked but the visible body is essentially empty
  // (Vite/React/Next shell), re-render the page with a real headless browser
  // so client-side content is actually captured. One browser instance is
  // reused for every inner page below and closed in `finally`. Falls back
  // silently to static fetches when puppeteer isn't installed.
  let renderer: SpaRenderer | null = null
  let home = extractPage(html, url)
  if (looksLikeSpa(html, home)) {
    renderer = await SpaRenderer.start()
    if (renderer) {
      const rendered = await renderer.render(url)
      if (rendered) {
        html = rendered
        home = extractPage(html, url)
      }
    }
  }

  try {
  const origin = new URL(url).origin
  const structured = extractStructured(html)

  // ── Crawl the brand's inner pages ──
  // The homepage rarely holds their full service detail; their own nav points at
  // it. Same-origin only, capped at 5 pages so an import stays quick. When the
  // homepage needed the renderer, inner pages get the same treatment — SPA
  // routes render the same way.
  const fetchPage = renderer
    ? (u: string) => renderer!.render(u).then((h) => h || fetchHtml(u).catch(() => ''))
    : (u: string) => fetchHtml(u).catch(() => '')

  const seen = new Set([url.replace(/\/$/, '')])
  const queue = home.links
    .filter((l) => { try { return new URL(l).origin === origin } catch { return false } })
    .filter((l) => !/\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?|mp4|webm)(\?|$)/i.test(l))
    .filter((l) => !/(privacy|terms|cookie|legal|sitemap|login|cart|account)/i.test(l))
    .filter((l) => { const k = l.replace(/\/$/, ''); if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, 5)

  const pages: PageData[] = [home]
  const pagesRead = [url]
  for (const link of queue) {
    const sub = await fetchPage(link)
    if (!sub) continue
    pages.push(extractPage(sub, link))
    pagesRead.push(link)
    Object.assign(structured, { ...extractStructured(sub), ...structured }) // homepage wins
  }

  // ── Merge every page, de-duped, order preserved ──
  const merge = (pick: (p: PageData) => string[], limit: number): string[] => {
    const out: string[] = []
    for (const p of pages) for (const v of pick(p)) {
      if (v && !out.includes(v)) out.push(v)
      if (out.length >= limit) return out
    }
    return out
  }

  // Brand colors: most frequent non-greyscale hex codes across all pages
  const freq = new Map<string, number>()
  for (const p of pages) for (const hex of p.colors) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    if (Math.max(r, g, b) - Math.min(r, g, b) < 24) continue // greyscale — not a brand color
    freq.set(hex, (freq.get(hex) ?? 0) + 1)
  }
  const colors = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c)

  const title = decode(home.title ?? '')
  const addressRaw = pages.find((p) => p.address)?.address
  const emails = merge((p) => p.emails, 4)
  // The same number often appears in several formats ("778-760-8080" and
  // "7787608080") — keep the first (best-formatted) of each distinct number.
  const byDigits = new Map<string, string>()
  for (const raw of merge((p) => p.phones, 10)) {
    const digits = raw.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
    if (digits.length >= 7 && !byDigits.has(digits)) byDigits.set(digits, raw.trim())
  }
  const phones = [...byDigits.values()].slice(0, 3)

  const profile: BrandProfile = {
    url,
    siteName: meta(html, 'og:site_name') ?? structured.name
      ?? (title ? title.split(/[|–—-]/)[0].trim() : undefined),
    tagline: title || undefined,
    description: meta(html, 'description') ?? meta(html, 'og:description') ?? structured.description,
    headings: merge((p) => p.headings, 40),
    paragraphs: merge((p) => p.paragraphs, 30),
    navItems: merge((p) => p.navItems, 16),
    emails: emails.length ? emails : (structured.email ? [structured.email] : []),
    phones: phones.length ? phones : (structured.phone ? [structured.phone] : []),
    address: addressRaw ? decode(addressRaw.replace(/<[^>]+>/g, ' ')) : structured.address,
    socials: merge((p) => p.socials, 6),
    // Images + their meta merged in the same order so `imageMeta[i]`
    // describes `images[i]` on the final profile.
    images: [],
    imageMeta: [],
    colors,
    pagesRead,
    structured,
  }

  // Aligned merge for images + imageMeta — cap at 20, de-dupe by URL, keep
  // the first meta seen for each URL. This is what lets the generator place
  // photos correctly (hero photo in hero, team photo on team page, etc.).
  const imgSeen = new Set<string>()
  for (const p of pages) {
    for (let i = 0; i < p.images.length; i++) {
      const u = p.images[i]
      if (!u || imgSeen.has(u) || profile.images.length >= 20) continue
      imgSeen.add(u)
      profile.images.push(u)
      profile.imageMeta.push(p.imageMeta?.[i] ?? { alt: '', context: 'content' })
    }
  }

  // Concatenated original CSS for the "beat this" reference passed to the
  // CSS generator. Best-effort; failures leave the field undefined.
  try {
    profile.originalCss = await fetchOriginalCss(html, pages, url)
  } catch { /* ignore — CSS is optional */ }

  // Usable if we got real copy OR structured data (the JS-only-site rescue path)
  const hasText = profile.headings.length > 0 || profile.paragraphs.length > 0
  const hasStructured = Boolean(structured.name || structured.description || structured.services)
  if (!hasText && !hasStructured) return null
  return profile
  } finally {
    if (renderer) await renderer.close()
  }
}

/**
 * Fetch and concatenate the site's own stylesheets so the CSS generator can
 * see the exact visual language it must beat. Skips fonts.googleapis (just
 * font-face declarations, not design), CDN normalize/reset sheets, and any
 * one file > 200KB (usually vendor blobs that dilute signal). Caps the
 * combined output at ~40KB to keep prompt cost bounded.
 */
async function fetchOriginalCss(homeHtml: string, _pages: PageData[], baseUrl: string, cap = 40000): Promise<string> {
  const seen = new Set<string>()
  const urls: string[] = []
  // A site typically loads the same stylesheets on every page, so just
  // extracting from the homepage HTML is sufficient and keeps this cheap.
  for (const m of homeHtml.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)) {
    const href = m[0].match(/href=["']([^"']+)["']/i)?.[1]
    if (!href) continue
    let abs: string
    try { abs = new URL(href, baseUrl).href } catch { continue }
    if (seen.has(abs)) continue
    // Skip: Google Fonts (declarations only), obvious resets/normalize CDN
    if (/fonts\.googleapis|fonts\.gstatic/i.test(abs)) continue
    if (/(normalize|reset|meyerweb)[.-][\w.]*\.css/i.test(abs)) continue
    seen.add(abs)
    urls.push(abs)
  }

  const parts: string[] = []
  let total = 0
  const stripAndFit = (css: string): string => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()
    return stripped.slice(0, Math.max(0, cap - total))
  }

  // Inline <style> blocks in the head — part of the visual language, no fetch needed
  for (const m of homeHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (total >= cap) break
    const inline = m[1].trim()
    if (inline.length < 60) continue
    const chunk = stripAndFit(inline)
    if (chunk) { parts.push(`/* ── inline <style> ── */\n${chunk}`); total += chunk.length }
  }

  for (const cssUrl of urls.slice(0, 8)) {
    if (total >= cap) break
    try {
      const { data } = await axios.get(cssUrl, {
        timeout: 10000,
        maxContentLength: 200_000,
        responseType: 'text',
        httpsAgent: INSECURE_AGENT,
        headers: { 'User-Agent': UA },
        validateStatus: (s) => s >= 200 && s < 300,
      })
      const css = String(data).trim()
      if (!css) continue
      const chunk = stripAndFit(css)
      if (chunk) { parts.push(`/* ── ${cssUrl} ── */\n${chunk}`); total += chunk.length }
    } catch { /* skip this sheet */ }
  }
  return parts.join('\n\n')
}

// ─── Enhance mode ──────────────────────────────────────────
// Instead of regenerating a site from scratch, keep the client's EXISTING HTML
// structure (their sections, their copy, their images in the same places) and
// give it a beautiful new stylesheet. Safer and far more faithful than a rebuild
// — the layout is already human-designed; only the styling is upgraded.

export interface CapturedPage {
  /** filename in the generated repo, e.g. "index.html" / "services.html" */
  file: string
  url: string
  html: string
}

/** "https://x.com/our-services/" → "our-services.html"; homepage → "index.html" */
function pageFileName(pageUrl: string, origin: string): string {
  try {
    const p = new URL(pageUrl).pathname.replace(/\/+$/, '')
    if (!p || p === '') return 'index.html'
    const slug = p.split('/').filter(Boolean).join('-').replace(/\.(html?|php|aspx)$/i, '')
    return `${slug.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase().slice(0, 50) || 'page'}.html`
  } catch { return 'index.html' }
}

/** Fetch the homepage + its same-origin inner pages, keeping the RAW html. */
export async function capturePages(
  rawUrl: string,
  max = 6,
  opts: { timeoutMs?: number; budgetMs?: number } = {},
): Promise<CapturedPage[]> {
  // A hard wall-clock budget keeps an audit inside the caller's HTTP timeout —
  // a slow site degrades to fewer pages instead of hanging the whole request.
  const started = Date.now()
  const timeoutMs = opts.timeoutMs ?? 25000
  const budgetMs = opts.budgetMs ?? Number.MAX_SAFE_INTEGER
  // Tries www/non-www and http fallbacks, so a slightly-off URL still works
  const resolved = await resolveSiteUrl(rawUrl, timeoutMs)
  const url = resolved.url
  const html = resolved.html
  if (!html) return []

  const origin = new URL(url).origin
  const out: CapturedPage[] = [{ file: 'index.html', url, html }]
  const seen = new Set([url.replace(/\/$/, ''), 'index.html'])

  const links = extractPage(html, url).links
    .filter((l) => { try { return new URL(l).origin === origin } catch { return false } })
    .filter((l) => !/\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?|mp4|webm)(\?|$)/i.test(l))
    .filter((l) => { const k = l.replace(/\/$/, ''); if (seen.has(k)) return false; seen.add(k); return true })

  for (const link of links) {
    if (out.length >= max) break
    if (Date.now() - started > budgetMs) break // out of time — ship what we have
    const file = pageFileName(link, origin)
    if (seen.has(file)) continue
    const sub = await fetchHtml(link, timeoutMs)
    if (!sub) continue
    seen.add(file)
    out.push({ file, url: link, html: sub })
  }
  return out
}

/**
 * Strip the client's own styling/scripts but KEEP their structure, classes,
 * copy and images — then point the page at the newly generated stylesheet.
 * Images and internal links are rewritten to the local copies so the finished
 * site is self-contained and every photo stays exactly where it was.
 */
export function sanitizeImportedHtml(
  page: CapturedPage,
  imageMap: Map<string, string>,
  pageMap: Map<string, string>,
  opts: { keepStyles?: boolean; cssMap?: Map<string, string>; scriptMap?: Map<string, string> } = {},
): string {
  const absOf = (src: string): string | null => {
    try { return new URL(src, page.url).href } catch { return null }
  }

  let html = page.html.replace(/<!--[\s\S]*?-->/g, '')

  if (opts.keepStyles) {
    // Enhance mode keeps their JS as well — it drives their own nav drawers,
    // sliders and forms. Stripping it would break working functionality.
    // Analytics/tracking is dropped; everything else is pointed at local copies.
    html = html.replace(/<script[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (m, src) => {
      const a = absOf(src)
      if (a && /googletagmanager|google-analytics|gtag|facebook\.net|hotjar|clarity\.ms|segment|mixpanel/i.test(a)) return ''
      const local = a && opts.scriptMap?.get(a)
      if (local) return m.replace(src, local)
      // Not downloaded (CDN, over the cap, or fetch failed): a RELATIVE src would
      // 404 on the new host and the library never loads — "$ is not defined",
      // "Swiper is not defined". Make it absolute so it still resolves.
      return a ? m.replace(src, a) : m
    })
    // Inline scripts pull in assets the same way — fix their paths too
    html = html.replace(/(<script(?![^>]*\ssrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
      (m, open, body, close) => `${open}${absolutizeAssetPaths(body, page.url)}${close}`)
  } else {
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '') // full restyle — our JS only
  }

  if (opts.keepStyles) {
    // Inline <style> blocks in the head often carry a desktop lock
    // (`body { min-width: 1200px }`, `html { width: 1200px }`) that pins the
    // page to a fixed pixel width on every viewport — no @media rule we later
    // ship can override that on mobile because the layout is already glued
    // wider than the screen. Strip those declarations from inline styles so
    // the page can reflow. Everything else (colors, borders, positioning) is
    // preserved.
    html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, body, close) => {
      const cleaned = body
        // `body { min-width: 1200px }` / `html { min-width: … }` — the classic
        // template pattern that shrinks phones into a desktop layout
        .replace(/(html|body)\s*\{[^}]*\}/gi, (rule: string) =>
          rule.replace(/\s*(min-width|width)\s*:\s*[^;}]+;?/gi, ''))
        // Fixed pixel widths on wrappers/containers do the same thing
        .replace(/\.(wrapper|container|main|content|inner|page)\s*\{[^}]*\}/gi, (rule: string) =>
          rule.replace(/\s*min-width\s*:\s*[^;}]+;?/gi, ''))
      return `${open}${cleaned}${close}`
    })
    // Same for inline style="min-width: 1200px" on <html>/<body> tags
    html = html.replace(/<(html|body)([^>]*style=("[^"]*"|'[^']*'))/gi, (m, tag, attrs) =>
      m.replace(/\s*min-width\s*:\s*[^;"']+;?/gi, ''))

    // KEEP their design: point their <link> stylesheets at local copies so the
    // site is self-contained, and leave the remaining inline <style>/style=""
    // untouched. Our enhancement layer is appended afterwards, so it can only
    // add polish.
    html = html.replace(/(<link[^>]+href=)["']([^"']+)["']/gi, (m, pre, href) => {
      if (/^(#|data:)/i.test(href)) return m
      const a = absOf(href)
      const local = a && opts.cssMap?.get(a)
      if (local) return `${pre}"${local}"`
      // Same reasoning as scripts: never leave a relative href that will 404 —
      // an unresolved stylesheet means the page ships completely unstyled.
      return a ? `${pre}"${a}"` : m
    })
  } else {
    // Full restyle: strip their styling entirely and generate a new stylesheet.
    html = html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi, '')
      .replace(/<link[^>]+as=["']style["'][^>]*>/gi, '')
      .replace(/\sstyle=("[^"]*"|'[^']*')/gi, '')

    // Rebuild mode strips ALL their JS, which means any cookie/consent/GDPR
    // modal's close button no longer works — the modal is stuck open forever
    // and blocks the entire page. Since we also stripped every tracking
    // script (google-analytics, gtm, hotjar, etc.), no consent is even
    // needed. Remove those modals entirely — plus common third-party CMP
    // containers (klaro, cookiebot, onetrust, iubenda, cookieyes, tarteaucitron).
    const modalPatterns = [
      /<(div|section|aside|dialog)[^>]*(id|class)="[^"]*(cookie|consent|gdpr|cmp|klaro|cookiebot|onetrust|iubenda|cookieyes|tarteaucitron|privacy[- _]?settings|ot-sdk|CybotCookiebot|translation[- _]?notice|translation[- _]?modal)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi,
      // Klaro contextual blockers use cn-* / cm-* prefixes
      /<(div|section|aside)[^>]*(id|class)="[^"]*\bcn-(modal|notice|body|dialog|container)\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi,
      /<(div|section|aside)[^>]*(id|class)="[^"]*\bcm-(modal|notice|body|dialog)\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi,
      /<div[^>]*id="klaro"[^>]*>[\s\S]*?<\/div>/gi,
      /<div[^>]*id="CybotCookiebotDialog"[^>]*>[\s\S]*?<\/div>/gi,
      /<div[^>]*id="onetrust-consent-sdk"[^>]*>[\s\S]*?<\/div>/gi,
      // Noscript blocks often contain fallback consent messages
      /<noscript[\s\S]*?consent[\s\S]*?<\/noscript>/gi,
    ]
    for (const pat of modalPatterns) html = html.replace(pat, '')
  }

  // Images → the local copies, keeping each one exactly where it was
  html = html.replace(/(<img[^>]+?)(src|data-src|data-lazy-src)=["']([^"']+)["']/gi, (m, pre, attr, src) => {
    if (/^(data:|#)/i.test(src)) return m
    const a = absOf(src)
    if (!a) return m
    const local = imageMap.get(a)
    // Not downloaded (over the cap or fetch failed): a relative path like
    // "/ssspath/img/x.jpg" does not exist on the new host and renders as a
    // broken image — point it back at the original server instead.
    return `${pre}src="${local ?? a}"`
  })
  // Lazy-loaded images often ship as <img data-src="..."> with NO src, relying on
  // the site's own lazy-loader. If that script doesn't run they render blank, so
  // promote data-src to a real src (kept alongside, so their loader still works).
  html = html.replace(/<img((?:(?!\ssrc=)[^>])*?)\s(data-src|data-lazy-src|data-original)=["']([^"']+)["']([^>]*)>/gi,
    (m, pre, attr, src, post) => {
      const a = absOf(src)
      if (!a) return m
      return `<img${pre} ${attr}="${src}" src="${imageMap.get(a) ?? a}"${post}>`
    })

  // Favicons / apple-touch icons — these are <link href>, not <img>, so they were
  // being left pointing at the client's old server (404 on the new site).
  html = html.replace(/(<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=)["']([^"']+)["']/gi, (m, pre, href) => {
    const a = absOf(href)
    const local = a && imageMap.get(a)
    return local ? `${pre}"${local}"` : m
  })
  html = html.replace(/(<link[^>]*href=)["']([^"']+)["']([^>]*rel=["'][^"']*icon)/gi, (m, pre, href, post) => {
    const a = absOf(href)
    const local = a && imageMap.get(a)
    return local ? `${pre}"${local}"${post}` : m
  })
  // og:image must stay an ABSOLUTE url for social sharing — point it at the
  // original (still-live) asset rather than a relative path that won't resolve.
  html = html.replace(/(<meta[^>]+property=["']og:image["'][^>]*content=)["']([^"']+)["']/gi, (m, pre, src) => {
    const a = absOf(src)
    return a ? `${pre}"${a}"` : m
  })
  html = html.replace(/\ssrcset=("[^"]*"|'[^']*')/gi, '') // stale remote candidates
  html = html.replace(/url\((["']?)([^"')]+)\1\)/gi, (m, q, src) => {
    if (/^(data:|#)/i.test(src)) return m
    const a = absOf(src)
    if (!a) return m
    return `url(${imageMap.get(a) ?? a})`
  })

  // Internal links → the local page files. A same-site link we did NOT capture
  // must be made ABSOLUTE back to the original site: left as "/services" it
  // would 404 on the new host, which is what breaks "most pages don't open".
  const origin = (() => { try { return new URL(page.url).origin } catch { return '' } })()
  html = html.replace(/(<a[^>]+href=)["']([^"']+)["']/gi, (m, pre, href) => {
    if (/^(#|mailto:|tel:|javascript:|data:)/i.test(href)) return m
    const a = absOf(href)
    if (!a) return m
    const local = pageMap.get(a.replace(/\/$/, ''))
    if (local) return `${pre}"${local}"`
    // Same-origin but not captured → point at the real page on their live site
    if (origin && a.startsWith(origin)) return `${pre}"${a}"`
    return m
  })

  // Guaranteed responsive viewport (added at the top of <head>)
  const viewport = `\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n`
  html = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => m + viewport)
    : `<!doctype html><html><head>${viewport}</head><body>${html}</body></html>`
  // Our stylesheet goes LAST in <head> so it layers over theirs in keepStyles
  // mode (and is simply the only stylesheet in full-restyle mode). The ?v= build
  // stamp guarantees a rebuild is never served from a stale browser cache —
  // cache headers alone cannot fix a copy the browser already holds.
  const ours = `  <link rel="stylesheet" href="styles.css?v=${BUILD_STAMP}" />\n`
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${ours}</head>`) : html.replace(/<body/i, `${ours}<body`)
  html = html.replace(/<\/body>/i, '  <script src="script.js" defer></script>\n</body>')
  if (!/<script src="script\.js"/.test(html)) html += '\n<script src="script.js" defer></script>\n'
  return html
}

/** Every class and id actually used across the captured pages — this is what the
 *  new stylesheet has to target for the redesign to land. */
export function selectorsIn(html: string): { classes: string[]; ids: string[] } {
  const classes = new Set<string>()
  const ids = new Set<string>()
  for (const m of html.matchAll(/class=["']([^"']+)["']/gi)) {
    for (const c of m[1].split(/\s+/)) if (c && !/^(js-|is-|wp-)/.test(c)) classes.add(c)
  }
  for (const m of html.matchAll(/\sid=["']([^"']+)["']/gi)) ids.add(m[1])
  return { classes: [...classes], ids: [...ids] }
}

/** Download images and return a map of ORIGINAL url → local path, so each photo
 *  can be put back exactly where it was in the original markup. */
export async function downloadImageMap(
  urls: string[], destDir: string, publicPrefix: string, max = 24,
): Promise<Map<string, string>> {
  const EXT: Record<string, string> = {
    'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
    'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif', 'image/svg+xml': '.svg',
  }
  fs.mkdirSync(destDir, { recursive: true })
  const map = new Map<string, string>()
  let n = 0
  for (const src of urls.slice(0, max)) {
    if (map.has(src)) continue
    try {
      const res = await axios.get(src, {
        responseType: 'arraybuffer', timeout: 15000, maxContentLength: 8_000_000, httpsAgent: INSECURE_AGENT,
        headers: { 'User-Agent': UA, Referer: src }, validateStatus: (s) => s >= 200 && s < 300,
      })
      const type = String(res.headers['content-type'] ?? '').split(';')[0].toLowerCase()
      const ext = EXT[type]
      const buf = res.data as Buffer
      if (!ext || !buf || buf.byteLength < 512) continue
      const name = `img-${++n}${ext}`
      fs.writeFileSync(path.join(destDir, name), buf)
      map.set(src, `${publicPrefix}${name}`)
    } catch { /* keep the original remote URL for this one */ }
  }
  return map
}

/** Their <link> stylesheets, downloaded locally so the enhanced site is
 *  self-contained. Any url() inside is rewritten to an absolute original URL so
 *  fonts/background images still resolve from the new location. Returns a map of
 *  ORIGINAL stylesheet url → local path. Google Fonts and other CDN sheets are
 *  left remote (they are stable and expect their own hosting). */
export async function downloadStylesheets(
  pages: CapturedPage[], destDir: string, publicPrefix: string, max = 14,
): Promise<Map<string, string>> {
  const wanted: string[] = []
  for (const page of pages) {
    for (const m of page.html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)) {
      const href = m[0].match(/href=["']([^"']+)["']/i)?.[1]
      if (!href) continue
      try {
        const abs = new URL(href, page.url).href
        if (/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg\.com|cdnjs/i.test(abs)) continue
        if (!wanted.includes(abs)) wanted.push(abs)
      } catch { /* malformed href */ }
    }
  }

  fs.mkdirSync(destDir, { recursive: true })
  const map = new Map<string, string>()
  let n = 0
  for (const url of wanted.slice(0, max)) {
    try {
      const { data } = await axios.get(url, {
        timeout: 15000, maxContentLength: 4_000_000, responseType: 'text', httpsAgent: INSECURE_AGENT,
        headers: { 'User-Agent': UA }, validateStatus: (s) => s >= 200 && s < 300,
      })
      let css = String(data)
      // Relative url() would break once the file moves — make them absolute
      css = css.replace(/url\((["']?)([^"')]+)\1\)/gi, (m, q, src) => {
        if (/^(data:|https?:|\/\/)/i.test(src)) return m
        try { return `url(${new URL(src, url).href})` } catch { return m }
      })
      const name = `site-${++n}.css`
      fs.writeFileSync(path.join(destDir, name), css, 'utf-8')
      map.set(url, `${publicPrefix}${name}`)
    } catch { /* keep the remote link for this one */ }
  }
  return map
}

/**
 * Rewrite asset paths that live INSIDE a script or stylesheet.
 *
 * Sites routinely load their libraries from JavaScript rather than from markup —
 * e.g. a small bootstrap file holding "/ssspath/js/jquery-3.5.1.min.js" and
 * "/ssspath/layui/layui.js" that it injects at runtime. Rewriting only HTML
 * attributes leaves those paths relative, they 404 on the new host, and the page
 * dies with "$ is not defined" / "Swiper is not defined" / "layui is not defined".
 *
 * Only quoted strings ending in a real asset extension are touched, so API
 * routes, regexes and ordinary strings are left alone.
 */
const ASSET_EXT = 'js|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|mp4|webm|json'
export function absolutizeAssetPaths(code: string, baseUrl: string): string {
  return code.replace(
    new RegExp(`(["'])((?:\\.{0,2}/)[^"'\\n]*?\\.(?:${ASSET_EXT}))(\\?[^"'\\n]*)?\\1`, 'gi'),
    (m, q, p, query = '') => {
      if (/^(https?:|\/\/|data:)/i.test(p)) return m
      try { return `${q}${new URL(p, baseUrl).href}${query}${q}` } catch { return m }
    },
  )
}

/** Their <script src> files, downloaded locally so their own interactions (nav
 *  drawers, sliders, form handlers) keep working in the enhanced site. */
export async function downloadScripts(
  pages: CapturedPage[], destDir: string, publicPrefix: string, max = 18,
): Promise<Map<string, string>> {
  const wanted: string[] = []
  for (const page of pages) {
    for (const m of page.html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)) {
      try {
        const abs = new URL(m[1], page.url).href
        if (/googletagmanager|google-analytics|gtag|facebook\.net|hotjar|clarity\.ms|segment|mixpanel/i.test(abs)) continue
        if (/^https?:\/\/(cdn\.|unpkg|jsdelivr|cdnjs|ajax\.googleapis)/i.test(abs)) continue // stable CDNs stay remote
        if (!wanted.includes(abs)) wanted.push(abs)
      } catch { /* malformed src */ }
    }
  }
  fs.mkdirSync(destDir, { recursive: true })
  const map = new Map<string, string>()
  let n = 0
  for (const url of wanted.slice(0, max)) {
    try {
      const { data } = await axios.get(url, {
        timeout: 15000, maxContentLength: 4_000_000, responseType: 'text', httpsAgent: INSECURE_AGENT,
        headers: { 'User-Agent': UA }, validateStatus: (s) => s >= 200 && s < 300,
      })
      // Libraries this script loads at runtime must resolve against the ORIGINAL
      // site, not the new host where those paths don't exist.
      const code = absolutizeAssetPaths(String(data), url)
      const name = `site-${++n}.js`
      fs.writeFileSync(path.join(destDir, name), code, 'utf-8')
      map.set(url, `${publicPrefix}${name}`)
    } catch { /* keep the remote src for this one */ }
  }
  return map
}

// Properties the enhancement layer must NEVER set outside a media query. These
// are the client's layout and brand identity — letting the layer touch them is
// how a "polish" pass ends up moving their nav, swapping their fonts, or turning
// their emerald buttons red. Depth, motion and rhythm are still fully allowed.
const LAYER_BLOCKED = new Set([
  'display', 'position', 'float', 'clear', 'visibility', 'order', 'z-index',
  'top', 'right', 'bottom', 'left', 'inset',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'overflow', 'overflow-x', 'overflow-y',
  'flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'flex-basis', 'flex-grow', 'flex-shrink',
  'grid', 'grid-template', 'grid-template-columns', 'grid-template-rows', 'grid-auto-flow',
  'grid-column', 'grid-row', 'align-items', 'justify-content', 'place-items',
  'font-family', 'color', 'background', 'background-color', 'background-image',
  'content',
])

/**
 * Keep an AI-written enhancement layer from breaking the client's site.
 * Outside media queries only "polish" declarations survive (shadows, radii,
 * transitions, spacing, typography rhythm); anything that would move their
 * layout or hijack their colors/fonts is dropped. Inside `@media` blocks the
 * full property set is allowed, since responsive fixes legitimately need
 * display/flex/width changes. Returns the filtered CSS.
 */
export function sanitizeEnhancementCss(css: string): { css: string; dropped: number } {
  let dropped = 0

  const filterBlock = (block: string): string => block
    .split(';')
    .filter((decl) => {
      const prop = decl.split(':')[0]?.trim().toLowerCase()
      if (!prop || prop.startsWith('--')) return true
      if (LAYER_BLOCKED.has(prop)) { dropped++; return false }
      return true
    })
    .join(';')

  // Walk the stylesheet, tracking @media depth so nested rules are handled.
  let out = ''
  let i = 0
  while (i < css.length) {
    const braceAt = css.indexOf('{', i)
    if (braceAt === -1) { out += css.slice(i); break }
    const prelude = css.slice(i, braceAt)
    // Find this block's matching close brace
    let depth = 0, j = braceAt
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') { depth--; if (depth === 0) break }
    }
    const body = css.slice(braceAt + 1, j)
    const isAtRule = /@(media|supports|container)/i.test(prelude)
    if (isAtRule) {
      out += `${prelude}{${body}}` // responsive/feature blocks pass through
    } else if (/@(keyframes|font-face|import|charset)/i.test(prelude)) {
      out += `${prelude}{${body}}`
    } else {
      const kept = filterBlock(body).replace(/^\s*;+|;+\s*$/g, '').trim()
      if (kept) out += `${prelude}{${kept}}\n`
    }
    i = j + 1
  }
  return { css: out, dropped }
}

/** Does this markup already have its own mobile menu toggle? If so, ForgeAI must
 *  NOT inject a second hamburger on top of it. */
export function hasOwnMobileNav(html: string): boolean {
  return /class=["'][^"']*(burger|hamburger|menu-toggle|nav-toggle|mobile-menu|drawer-toggle|menu-btn)/i.test(html)
}

/** Every image referenced by a captured page (img src, lazy attrs, css urls). */
export function imageUrlsIn(page: CapturedPage): string[] {
  const out: string[] = []
  const add = (src: string) => {
    try { const a = new URL(src, page.url).href; if (!out.includes(a)) out.push(a) } catch { /* bad url */ }
  }
  for (const m of page.html.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)) add(m[1])
  // favicons / apple-touch icons so the new site keeps their logo in the tab
  for (const m of page.html.matchAll(/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/gi)) {
    const href = m[0].match(/href=["']([^"']+)["']/i)?.[1]
    if (href) add(href)
  }
  for (const m of page.html.matchAll(/url\((["']?)([^"')]+)\1\)/gi)) {
    if (/\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(m[2])) add(m[2])
  }
  const og = meta(page.html, 'og:image')
  if (og) add(og)
  return out
}

/** Download the brand's own photos into the generated repo so the site is fully
 *  self-contained — it keeps working after their old host goes away. Returns the
 *  site-relative paths that replace the remote URLs. Best-effort per image. */
export async function downloadBrandImages(
  images: string[], destDir: string, publicPrefix: string, max = 12,
): Promise<string[]> {
  const rich = await downloadBrandImagesWithSource(images, destDir, publicPrefix, max)
  return rich.map((r) => r.localPath)
}

/** Like `downloadBrandImages` but also returns the source URL each saved
 *  image came from, so callers can keep any per-image metadata (alt text,
 *  section context) aligned with the reordered/filtered output. */
export async function downloadBrandImagesWithSource(
  images: string[], destDir: string, publicPrefix: string, max = 12,
): Promise<{ localPath: string; sourceUrl: string }[]> {
  const EXT: Record<string, string> = {
    'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
    'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif',
  }
  fs.mkdirSync(destDir, { recursive: true })
  const fetched: { buf: Buffer; ext: string; source: string }[] = []
  for (const src of images.slice(0, max * 2)) {
    if (fetched.length >= max * 2) break
    try {
      const res = await axios.get(src, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxContentLength: 8_000_000,
        httpsAgent: INSECURE_AGENT,
        headers: { 'User-Agent': UA, Referer: src },
        validateStatus: (s) => s >= 200 && s < 300,
      })
      const type = String(res.headers['content-type'] ?? '').split(';')[0].toLowerCase()
      const ext = EXT[type]
      const buf = res.data as Buffer
      // < 6KB is an icon, logo, spacer or tracking pixel — not usable as a photo
      if (!ext || !buf || buf.byteLength < 6144) continue
      fetched.push({ buf, ext, source: src })
    } catch { /* skip this image — a partial set is still useful */ }
  }

  const saved: { localPath: string; sourceUrl: string }[] = []
  for (const { buf, ext, source } of fetched.sort((a, b) => b.buf.byteLength - a.buf.byteLength).slice(0, max)) {
    const name = `brand-${saved.length + 1}${ext}`
    fs.writeFileSync(path.join(destDir, name), buf)
    saved.push({ localPath: `${publicPrefix}${name}`, sourceUrl: source })
  }
  return saved
}

/** Render the profile as a prompt block the builder can follow verbatim. */
export function brandProfileBlock(p: BrandProfile): string {
  const lines: string[] = [
    `BRAND SOURCE — the client's CURRENT website (${p.url}). Rebuild it FAR better, but use these REAL facts, services, and copy — never invent a different business, and never contradict these details:`,
  ]
  if (p.siteName) lines.push(`BRAND NAME: ${p.siteName}`)
  if (p.tagline) lines.push(`TAGLINE/TITLE: ${p.tagline}`)
  if (p.description) lines.push(`DESCRIPTION: ${p.description}`)
  if (p.navItems.length) lines.push(`THEIR PAGES/NAV: ${p.navItems.join(', ')}`)
  if (p.headings.length) lines.push(`THEIR HEADINGS (real services/value props):\n- ${p.headings.slice(0, 18).join('\n- ')}`)
  if (p.paragraphs.length) lines.push(`THEIR COPY (rewrite sharper, keep the facts):\n- ${p.paragraphs.slice(0, 12).join('\n- ')}`)
  const contact = [
    p.emails.length ? `email ${p.emails.join(', ')}` : '',
    p.phones.length ? `phone ${p.phones.join(', ')}` : '',
    p.address ? `address ${p.address}` : '',
  ].filter(Boolean).join(' | ')
  if (contact) lines.push(`REAL CONTACT DETAILS (use these exactly): ${contact}`)
  if (p.socials.length) lines.push(`SOCIAL LINKS: ${p.socials.join(', ')}`)
  if (p.structured.services) lines.push(`THEIR SERVICES (from structured data): ${p.structured.services}`)
  if (p.colors.length) lines.push(`THEIR BRAND COLORS (evolve tastefully, stay recognisable): ${p.colors.join(', ')}`)
  if (p.images.length) {
    // Each photo comes with its ORIGINAL section context (hero / team /
    // service / etc.) and the alt text if present. Tell the generator to
    // place each photo in the SAME kind of section on the new site so photos
    // are never randomly aligned — hero photo stays in the hero, team photo
    // stays on the team page, product photos stay in product cards.
    const labelled = p.images.slice(0, 12).map((u, i) => {
      const meta = p.imageMeta?.[i]
      const bits: string[] = []
      if (meta?.alt) bits.push(`caption: "${meta.alt}"`)
      if (meta?.context && meta.context !== 'content') bits.push(`originally in: ${meta.context}`)
      return `${i + 1}. ${u}${bits.length ? ` — ${bits.join(' | ')}` : ''}`
    }).join('\n')
    lines.push(`THEIR OWN PHOTOS — use these EXACT paths, and PLACE EACH ONE in the same kind of section it came from on the original site (hero photo → hero; team photo → team; service photo → the matching service card). NEVER swap them randomly:\n${labelled}`)
  }
  if (p.pagesRead.length > 1) lines.push(`(Content gathered from ${p.pagesRead.length} of their pages.)`)
  return lines.join('\n')
}
