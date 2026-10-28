// ─── ForgeAI Visual QA ──────────────────────────────────────────────────────
// Looks at a deployed site the way a client would: full-page screenshots on a
// desktop and a phone, reviewed by a vision model against a defect rubric
// (broken images, layout breaks, unreadable text, unstyled elements, a weak
// first screen). Real defects get a small CSS fix appended to the deployed
// stylesheet and the workspace source; the site is re-checked and the fix is
// reverted if it scored worse. Screenshots come from Cloudflare Browser
// Rendering (CLOUDFLARE_API_TOKEN) so no browser ever runs in the 512 MB box.

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import type { AIProvider } from '../modules/ai/providers/base'
import { applyTasteGuard } from './brandKit'

export type Device = 'desktop' | 'phone'
export type Shooter = (url: string, device: Device) => Promise<Buffer>

export interface QaIssue {
  severity: 'high' | 'medium' | 'low'
  screen: string
  where: string
  problem: string
  fix: string
}

export interface QaReview {
  score: number
  issues: QaIssue[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const VIEWPORTS: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
}

/** Holds the page still for a screenshot: no loader, no entrance animation
 *  half-way, every reveal-on-scroll section visible. */
export const STILL_CSS = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}'
  + '.page-loader,.app-loading,#preloader,.preloader{display:none!important}'
  + '.reveal,.reveal-init,[class*="reveal"],.animate-in,.fade-in,.fade-up,[data-aos]{opacity:1!important;transform:none!important;visibility:visible!important}'

/**
 * Measures what a screenshot can't show — `overflow-x: hidden` silently clips
 * content running off the page — and prints it in a yellow bar at the very top
 * of the shot, where the reviewer reads it. Only the outermost offender of a
 * subtree is reported; content inside a deliberate scroller (carousel) is not.
 */
export const PROBE_JS = `(function(){
  var vw = document.documentElement.clientWidth, found = [], broken = 0;
  function clipped(el){ for (var p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) { var o = getComputedStyle(p).overflowX; if (o !== 'visible') return true; } return false; }
  document.querySelectorAll('body *').forEach(function(el){
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width === 0 || cs.position === 'fixed' || r.right <= vw + 4) return;
    if (found.some(function(f){ return f.el.contains(el); }) || clipped(el)) return;
    found.push({ el: el, w: Math.round(r.width), right: Math.round(r.right) });
  });
  document.querySelectorAll('img').forEach(function(i){ if (i.complete && i.naturalWidth === 0) broken++; });
  var label = function(f){ var c = (typeof f.el.className === 'string' ? f.el.className.trim().split(/\\s+/)[0] : ''); return f.el.tagName.toLowerCase() + (c ? '.' + c : '') + ' (' + f.w + 'px wide, ends at ' + f.right + 'px)'; };
  var bar = document.createElement('div');
  bar.setAttribute('style', 'position:absolute;top:0;left:0;width:' + vw + 'px;z-index:2147483647;background:#ffeb3b;color:#000;font:13px/1.4 monospace;padding:6px 10px;box-sizing:border-box');
  bar.textContent = 'QA PROBE (viewport ' + vw + 'px): ' + (found.length ? found.length + ' element(s) run off the right edge: ' + found.slice(0, 4).map(label).join('; ') : 'nothing runs off the right edge') + ' | broken images: ' + broken;
  document.body.appendChild(bar);
})();`

const cfAccount = () => process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID

/** The configured screenshot service, or null when visual QA can't run. */
export function visualQaEngine(): 'cloudflare' | null {
  const token = process.env.CLOUDFLARE_API_TOKEN
  return token && !token.includes('...') && cfAccount() ? 'cloudflare' : null
}

// The Workers Free plan allows one Browser Rendering request every 10 seconds
let lastShotAt = 0

/** Full-page JPEG of a public URL from Cloudflare Browser Rendering. */
export const cloudflareShooter: Shooter = async (url, device) => {
  const wait = lastShotAt + 10_500 - Date.now()
  if (wait > 0) await sleep(wait)
  lastShotAt = Date.now()
  const body = {
    url,
    viewport: { ...VIEWPORTS[device], deviceScaleFactor: 1 },
    screenshotOptions: { fullPage: true, type: 'jpeg', quality: 70 },
    gotoOptions: { waitUntil: 'networkidle2', timeout: 45_000 },
    addStyleTag: [{ content: STILL_CSS }],
    addScriptTag: [{ content: PROBE_JS }],
  }
  // "Browser Run" is the product's newer name; the older path still serves it
  let last = ''
  for (const product of ['browser-run', 'browser-rendering']) {
    const res = await axios.post(`https://api.cloudflare.com/client/v4/accounts/${cfAccount()}/${product}/screenshot`, body, {
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      responseType: 'arraybuffer',
      timeout: 75_000,
      validateStatus: () => true,
    })
    if (res.status === 200 && String(res.headers['content-type'] ?? '').startsWith('image/')) return Buffer.from(res.data)
    last = `${res.status} ${Buffer.from(res.data ?? '').toString('utf8').slice(0, 200)}`
    if (res.status !== 404) break
  }
  throw new Error(`Cloudflare screenshot failed: ${last}`)
}

const RUBRIC = `You review screenshots of a freshly built business website before its client sees it.

Report ONLY real defects a client would notice:
1. Broken or missing images — empty boxes, visible alt text, grey placeholders.
2. Layout breaks — overlapping elements, text cut off, cards or rows running off the right edge of the page, squashed columns, a lone orphaned card, an empty gap taller than a screen.
3. Unreadable text — light on light, dark on dark (check small labels in dark footers and bands too), text over a busy photo without an overlay.
4. Unstyled elements — browser-default buttons, inputs or bullet lists, giant icons, raw link lists.
5. First screen — the headline, a supporting line and a clear button must be visible without scrolling.
6. Phone-only breaks.
A yellow "QA PROBE" bar at the very top of each page was added by the checker (it is not part of the site — never report the bar itself): it lists elements MEASURED running off the right edge and the count of broken images. Report every element it lists as a high-severity layout break; in "where" name the page section that element belongs to (its heading) — never "Header" just because the bar is drawn at the top.
The floating round WhatsApp button overlapping content is intended. Ignore taste, wording, intentional colours and minor spacing. A clean page has no issues.

Reply with ONLY JSON:
{"score": <0-10, 10 = flawless>, "issues": [{"severity": "high|medium|low", "screen": "desktop|phone|both", "where": "the section, quoting its heading exactly (or 'Footer', 'Header')", "problem": "what is wrong", "fix": "the concrete CSS change that fixes it"}]}`

/**
 * A full-page screenshot is 7–10k px tall; shrunk into one image its text is
 * a few pixels high and defects go unseen. Desktop pages are cut into ≤6
 * strips; phone pages into screen-sized slices laid three side by side, so
 * every image keeps text at a readable size.
 */
export function readableTiles(jpeg: Buffer, device: Device): Buffer[] {
  const jpegjs = require('jpeg-js') as typeof import('jpeg-js')
  const img = jpegjs.decode(jpeg, { useTArray: true, maxMemoryUsageInMB: 160, maxResolutionInMP: 60 })
  const { width, height, data } = img
  const row = width * 4
  const encode = (pixels: Uint8Array, w: number, h: number) => Buffer.from(jpegjs.encode({ data: pixels, width: w, height: h }, 72).data)
  if (device === 'desktop') {
    const tileH = Math.max(900, Math.ceil(height / 6))
    const out: Buffer[] = []
    for (let y = 0; y < height; y += tileH) {
      const h = Math.min(tileH, height - y)
      out.push(encode(data.subarray(y * row, (y + h) * row), width, h))
    }
    return out
  }
  const sliceH = 1300
  const gap = 24
  const slices = Math.ceil(height / sliceH)
  const out: Buffer[] = []
  for (let first = 0; first < slices; first += 3) {
    const cols = Math.min(3, slices - first)
    const w = cols * width + (cols - 1) * gap
    const sheet = new Uint8Array(w * sliceH * 4).fill(255)
    for (let c = 0; c < cols; c++) {
      const y0 = (first + c) * sliceH
      const h = Math.min(sliceH, height - y0)
      for (let y = 0; y < h; y++) sheet.set(data.subarray((y0 + y) * row, (y0 + y + 1) * row), (y * w + c * (width + gap)) * 4)
    }
    out.push(encode(sheet, w, sliceH))
  }
  return out
}

function firstJson(text: string): any {
  const s = text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  return a >= 0 && b > a ? JSON.parse(s.slice(a, b + 1)) : null
}

/** Vision review of the screenshots. The provider must accept images (Gemini). */
export async function reviewScreens(provider: AIProvider, shots: { device: Device; image: Buffer }[], site: string): Promise<QaReview | null> {
  const desktop = shots.filter((s) => s.device === 'desktop').flatMap((s) => readableTiles(s.image, 'desktop'))
  const phone = shots.filter((s) => s.device === 'phone').flatMap((s) => readableTiles(s.image, 'phone'))
  const guide = `Images 1–${desktop.length}: the DESKTOP page (1280px wide), top to bottom in consecutive strips. Images ${desktop.length + 1}–${desktop.length + phone.length}: the PHONE page (390px wide) — each image holds up to three consecutive phone screens, read left to right.`
  const res = await provider.chat([{
    role: 'user',
    content: `${RUBRIC}\n\n${guide}\n\nSite: ${site}`,
    images: [...desktop, ...phone].map((b) => `data:image/jpeg;base64,${b.toString('base64')}`),
  }], 'You are a meticulous senior web designer doing pre-launch QA. Output JSON only.')
  const raw = firstJson(res?.content ?? '')
  if (!raw || typeof raw.score !== 'number') return null
  const issues: QaIssue[] = (Array.isArray(raw.issues) ? raw.issues : [])
    .filter((i: any) => ['high', 'medium', 'low'].includes(i?.severity) && i?.problem)
    .slice(0, 12)
    .map((i: any) => ({
      severity: i.severity,
      screen: String(i.screen ?? 'both'),
      where: String(i.where ?? '').slice(0, 200),
      problem: String(i.problem).slice(0, 400),
      fix: String(i.fix ?? '').slice(0, 400),
    }))
  return { score: Math.max(0, Math.min(10, raw.score)), issues }
}

/**
 * The markup around an issue: found by a class name it mentions
 * ("div.promo-grid"), else by the heading the reviewer quoted.
 */
export function sectionAround(sources: string[], where: string, problem = ''): string {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const needles: RegExp[] = []
  for (const m of `${where} ${problem}`.matchAll(/\b[a-z]+\.([a-z][\w-]{2,})/gi)) needles.push(new RegExp(`class(?:Name)?=["'][^"']*\\b${escape(m[1])}\\b`, 'i'))
  const quoted = /["“'‘]([^"”'’]{6,})["”'’]/.exec(where)?.[1] ?? where
  const words = quoted.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4)
  if (words.length >= 2) needles.push(new RegExp(words.map(escape).join('[^a-z0-9]+(?:<[^>]+>[^a-z0-9]*)*'), 'i'))
  for (const needle of needles) {
    for (const src of sources) {
      const m = needle.exec(src)
      if (!m) continue
      const start = Math.max(src.lastIndexOf('<section', m.index), m.index - 2500, 0)
      const close = src.indexOf('</section>', m.index)
      const end = close >= 0 ? Math.min(close + 10, m.index + 5000) : m.index + 3500
      return src.slice(start, end)
    }
  }
  return ''
}

// ForgeAI owns these: blocks, the photo hero, the header and logo. A patch that
// restyles them fights the brand layer, so such rules are dropped.
const OWNED = /\.(kit-|hero-photo|hero-inner|hero-copy|hero-aside|hero-card|hero-glass|hero-stat|page-hero|nav-brand|brand-|site-header|nav-cta)/

function dropOwnedRules(css: string): string {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (whole, selector: string) => (OWNED.test(selector) ? '' : whole))
}

const looksLikeCode = (text: string) => /^\s*(import\s|export\s|const\s+\w+\s*=|function\s+\w+\s*\(|<\/?[A-Za-z][\w.]*[\s>/])/m.test(text)

/** A small CSS patch for the defects, aimed only at the page's own classes. */
export async function cssFixFor(provider: AIProvider, issues: QaIssue[], markup: string, rootVars: string): Promise<string> {
  const res = await provider.chat([{
    role: 'user',
    content: `These visual defects were found in screenshots of a live website:\n${issues.map((i, n) => `${n + 1}. [${i.severity}, ${i.screen}] ${i.where}: ${i.problem} — suggested: ${i.fix}`).join('\n')}\n\nMarkup of the affected sections:\n\`\`\`html\n${markup.slice(0, 14_000)}\n\`\`\`\n\nThe stylesheet's variables:\n\`\`\`css\n${rootVars.slice(0, 2500)}\n\`\`\`\n\nWrite the SMALLEST set of CSS rules that fixes exactly these defects, targeting the classes in the markup (use @media (max-width: 760px) for phone-only problems). Rules:\n- Never target classes starting with kit-, hero-photo, hero-, page-hero, brand-, nav-brand, site-header or nav-cta — ForgeAI styles those.\n- No font-family, no gradient text, no hex colours — use the variables.\n- If a defect cannot be fixed with CSS, skip it.\nOutput ONLY the CSS inside <file path="fix.css">…</file>.`,
  }], 'You are a senior front-end engineer fixing visual bugs with minimal, surgical CSS.')
  const text = res?.content ?? ''
  const css = (/<file[^>]*>([\s\S]*?)<\/file>/.exec(text)?.[1] ?? text).replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim()
  if (!css || looksLikeCode(css) || !/\{[^}]*\}/.test(css)) return ''
  return dropOwnedRules(applyTasteGuard(css)).trim().slice(0, 6000)
}

const QA_MARK = '/* ── ForgeAI visual QA fix ── */'
const LAYER_START = '/* ══ FORGEAI BRAND LAYER ══ */'

/** Appends a patch to a stylesheet — in source CSS just before the brand layer,
 *  so the layer stays last; in a built (minified) sheet at the end. */
function appendPatch(file: string, patch: string): void {
  const css = fs.readFileSync(file, 'utf8')
  const block = `\n${QA_MARK}\n${patch}\n`
  const at = css.indexOf(LAYER_START)
  fs.writeFileSync(file, at >= 0 ? `${css.slice(0, at)}${block}\n${css.slice(at)}` : `${css}${block}`)
}

/** Stylesheets a built site actually serves: index.html's local <link>s. */
export function servedStylesheets(deployRoot: string): string[] {
  const index = path.join(deployRoot, 'index.html')
  if (!fs.existsSync(index)) return []
  const html = fs.readFileSync(index, 'utf8')
  return [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["'](?!https?:|\/\/)([^"'?#]+)/gi), ...html.matchAll(/<link[^>]+href=["'](?!https?:|\/\/)([^"'?#]+\.css)[^"']*["'][^>]*rel=["']stylesheet["']/gi)]
    .map((m) => path.join(deployRoot, m[1].replace(/^\.?\//, '')))
    .filter((p, i, all) => fs.existsSync(p) && all.indexOf(p) === i)
}

export interface VisualQaResult {
  before: QaReview
  after?: QaReview
  patched: boolean
  reverted: boolean
}

/**
 * Screenshot → review → fix → re-check for one deployed site. Best effort:
 * any failure is logged and returns null — a deploy never fails on QA.
 */
export async function runVisualQa(opts: {
  url: string
  site: string
  provider: AIProvider
  /** Markup the reviewer's section names are looked up in (pages, JSX) */
  sources: string[]
  /** Built stylesheets the live site serves */
  servedCss: string[]
  /** The workspace stylesheet, so a rebuild keeps the fix */
  sourceCss?: string
  republish: () => Promise<void>
  log: (message: string) => Promise<unknown>
  shoot?: Shooter
}): Promise<VisualQaResult | null> {
  const shoot = opts.shoot ?? cloudflareShooter
  const look = async () => {
    const shots = [] as { device: Device; image: Buffer }[]
    for (const device of ['desktop', 'phone'] as Device[]) shots.push({ device, image: await shoot(opts.url, device) })
    return reviewScreens(opts.provider, shots, opts.site)
  }
  try {
    await opts.log('📸 Visual QA — screenshotting the live site on desktop and phone…')
    const before = await look()
    if (!before) { await opts.log('⚠️ Visual QA — the review came back unreadable, skipped'); return null }
    await opts.log(`🔎 Visual QA score ${before.score}/10 — ${before.issues.length ? before.issues.map((i) => `${i.severity}: ${i.where} — ${i.problem}`).slice(0, 5).join(' | ') : 'no defects found'}`)
    if (!opts.servedCss.length) return { before, patched: false, reverted: false }

    // A static site serves its source stylesheet itself — patch each file once
    const targets = [...new Set([...opts.servedCss, ...(opts.sourceCss && fs.existsSync(opts.sourceCss) ? [opts.sourceCss] : [])].map((f) => path.resolve(f)))]
    const rootVars = fs.readFileSync(opts.servedCss[0], 'utf8').match(/:root\s*{[^}]*}/g)?.pop() ?? ''
    let current = before
    let patched = false
    let reverted = false
    // Up to two rounds: a first fix often uncovers a rule that out-ranks it
    for (let round = 1; round <= 2; round++) {
      const fixable = current.issues.filter((i) => i.severity !== 'low')
      if (!fixable.length) break
      const markup = [...new Set(fixable.map((i) => sectionAround(opts.sources, i.where, i.problem)).filter(Boolean))].join('\n\n')
      const patch = await cssFixFor(opts.provider, fixable, markup || opts.sources[0]?.slice(0, 8000) || '', rootVars)
      if (!patch) { if (round === 1) await opts.log('ℹ️ Visual QA — no CSS fix applies to these issues'); break }
      const backups = new Map(targets.map((f) => [f, fs.readFileSync(f, 'utf8')]))
      for (const f of targets) appendPatch(f, patch)
      await opts.republish()
      await opts.log(`🛠️ Visual QA — round ${round}: applied a ${patch.split('}').length - 1}-rule CSS fix, re-checking…`)
      const after = await look()
      // A vision judge's score wobbles by a point between identical looks, so
      // only a clear drop — or more high-severity problems — counts as worse
      const highs = (r: QaReview) => r.issues.filter((i) => i.severity === 'high').length
      if (!after || after.score <= current.score - 2 || highs(after) > highs(current)) {
        for (const [f, css] of backups) fs.writeFileSync(f, css)
        await opts.republish()
        reverted = true
        await opts.log(`↩️ Visual QA — round ${round} scored ${after ? `worse (${after.score}/10)` : 'unreadably'}, reverted it`)
        break
      }
      current = after
      patched = true
      if (after.score >= 9) break
    }
    if (patched) await opts.log(`✅ Visual QA ${before.score}/10 → ${current.score}/10`)
    return { before, after: patched ? current : undefined, patched, reverted }
  } catch (e: any) {
    await opts.log(`⚠️ Visual QA skipped — ${String(e?.message ?? e).slice(0, 200)}`)
    return null
  }
}

// ─── Broken images (no screenshots needed) ───────────────────────────────────

/** Every remote photo a page references, whole. Quoted URLs (src="…", JS
 *  strings, quoted CSS url()) run to their closing quote — Commons file names
 *  contain parentheses — and only an unquoted CSS url(…) stops at ")". */
export function photoUrlsIn(text: string): string[] {
  const photo = (u: string) => /\.(jpe?g|png|webp|avif)(\?|$)/i.test(u) || /^https:\/\/(picsum\.photos|images\.unsplash\.com|images\.pexels\.com)\//i.test(u)
  const out = new Set<string>()
  for (const m of text.matchAll(/(["'`])(https:\/\/[^"'`\s<>]+)\1/g)) if (photo(m[2])) out.add(m[2])
  for (const m of text.matchAll(/url\(\s*(https:\/\/[^)"'\s]+)\s*\)/gi)) if (photo(m[1])) out.add(m[1])
  return [...out]
}

/** A URL a model mangled while copying it: raw non-ASCII or a broken %-escape.
 *  Browsers request these literally and fail, while HTTP clients re-encode them
 *  into a valid request — so they are judged by their text, not by a fetch. */
export const mangledUrl = (url: string) => /[^\x20-\x7e]/.test(url) || /%(?![0-9a-f]{2})/i.test(url)

/** URLs that definitely do not serve an image: mangled, 404/410/403, or not
 *  image/*. Rate limits and timeouts count as fine — never replace on a guess. */
export async function brokenImages(urls: string[], concurrency = 4): Promise<string[]> {
  const broken = urls.filter(mangledUrl)
  const queue = urls.filter((u) => !mangledUrl(u))
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const r = await axios.get(url, { timeout: 8000, maxRedirects: 4, responseType: 'stream', validateStatus: () => true, headers: { 'User-Agent': 'ForgeAI-site-builder/1.0 (image check)' } })
        r.data?.destroy?.()
        const type = String(r.headers['content-type'] ?? '')
        if ([403, 404, 410].includes(r.status) || (r.status < 300 && !type.startsWith('image/'))) broken.push(url)
      } catch { /* network trouble is not proof of a broken image */ }
    }
  }))
  return broken
}
