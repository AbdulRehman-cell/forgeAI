// ─── Website audit ─────────────────────────────────────────
// Scores an existing website out of 10 and recommends what to do with it:
// leave it alone, enhance it, or rebuild it. Entirely deterministic — the score
// comes from measurable facts about the markup and CSS, not a model's opinion,
// so the same site always scores the same and the reasoning can be shown to a
// client.

import axios from 'axios'
import { capturePages, hasValidTls, type CapturedPage } from './siteImport'

export interface AuditCategory {
  name: string
  score: number   // 0-10
  weight: number
  notes: string[]
}

export interface SiteAudit {
  url: string
  score: number                       // weighted, 0-10, one decimal
  verdict: 'perfect' | 'enhance' | 'rebuild'
  headline: string
  reasoning: string
  categories: AuditCategory[]
  strengths: string[]
  issues: string[]
  stats: Record<string, number | string>
}

const clamp = (n: number) => Math.max(0, Math.min(10, n))
const count = (s: string, re: RegExp) => (s.match(re) || []).length

/** Pull the text of every same-origin stylesheet so design/responsive signals
 *  can be measured (inline <style> is included too). */
async function collectCss(pages: CapturedPage[], deadline = Number.MAX_SAFE_INTEGER): Promise<string> {
  let css = ''
  for (const p of pages) {
    for (const m of p.html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += m[1]
  }
  const hrefs: string[] = []
  for (const p of pages) {
    for (const m of p.html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)) {
      const href = m[0].match(/href=["']([^"']+)["']/i)?.[1]
      if (!href) continue
      try {
        const abs = new URL(href, p.url).href
        if (/fonts\.googleapis/i.test(abs)) continue
        if (!hrefs.includes(abs)) hrefs.push(abs)
      } catch { /* malformed */ }
    }
  }
  for (const url of hrefs.slice(0, 6)) {
    if (Date.now() > deadline) break // out of time — score from what we have
    try {
      const { data } = await axios.get(url, { timeout: 8000, responseType: 'text', maxContentLength: 4_000_000 })
      css += String(data)
    } catch { /* stylesheet unavailable — score from what we have */ }
  }
  return css
}

/** `captured` lets a caller that has already fetched the pages (the enhance
 *  pipeline) reuse them instead of downloading the whole site twice. */
export async function auditSite(rawUrl: string, captured?: CapturedPage[]): Promise<SiteAudit | null> {
  // Keep the whole audit comfortably inside a browser request timeout: ~18s of
  // crawling, then ~5s for stylesheets. A slow site yields fewer pages, not a
  // failed request.
  const started = Date.now()
  const pages = captured?.length
    ? captured
    : await capturePages(rawUrl, 5, { timeoutMs: 9000, budgetMs: 18000 })
  if (!pages.length) return null
  const css = await collectCss(pages, started + 24000)
  const home = pages[0]
  const all = pages.map((p) => p.html).join('\n')
  const text = all.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const words = text.split(' ').filter((w) => w.length > 2).length

  const strengths: string[] = []
  const issues: string[] = []
  const cats: AuditCategory[] = []

  // ── Mobile & responsive ──
  {
    const notes: string[] = []
    let s = 0
    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(home.html)
    const mediaQueries = count(css, /@media[^{]*\(/gi)
    const hasMobileNav = /(burger|hamburger|menu-toggle|nav-toggle|mobile-menu|drawer)/i.test(all)
    const fixedWidths = count(css, /width\s*:\s*\d{3,}px/gi)
    if (hasViewport) { s += 3; notes.push('Responsive viewport tag present') }
    else { notes.push('No viewport meta — the site renders zoomed-out on phones'); issues.push('Missing responsive viewport tag') }
    if (mediaQueries >= 6) { s += 4; notes.push(`${mediaQueries} responsive breakpoints`) }
    else if (mediaQueries >= 1) { s += 2; notes.push(`Only ${mediaQueries} breakpoint(s) — thin mobile coverage`) }
    else { notes.push('No media queries at all — no mobile layout'); issues.push('No responsive breakpoints') }
    if (hasMobileNav) { s += 2; notes.push('Has a mobile menu') }
    else { notes.push('No mobile menu found'); issues.push('No mobile navigation') }
    if (fixedWidths > 8) { s -= 1; notes.push(`${fixedWidths} fixed pixel widths may overflow on small screens`) }
    else s += 1
    if (s >= 8) strengths.push('Works well on mobile')
    cats.push({ name: 'Mobile & responsive', score: clamp(s), weight: 2, notes })
  }

  // ── Design & polish ──
  {
    const notes: string[] = []
    let s = 0
    const vars = count(css, /--[a-z-]+\s*:/gi)
    const shadows = count(css, /box-shadow\s*:/gi)
    const radius = count(css, /border-radius\s*:/gi)
    const transitions = count(css, /transition[^:]*:/gi)
    const modernLayout = count(css, /display\s*:\s*(flex|grid)/gi)
    const webFont = /fonts\.googleapis|@font-face/i.test(all + css)
    const gradients = count(css, /linear-gradient|radial-gradient/gi)
    if (vars >= 10) { s += 2; notes.push(`${vars} CSS custom properties — themable, modern`) }
    else if (vars > 0) s += 1
    else { notes.push('No CSS variables — styling is hard-coded'); issues.push('Dated CSS with no design tokens') }
    if (modernLayout >= 8) { s += 2; notes.push('Modern flex/grid layout') } else if (modernLayout > 0) s += 1
    else issues.push('No flex/grid layout')
    if (shadows >= 4) { s += 1.5; notes.push('Layered shadows give depth') } else notes.push('Little use of depth/shadow')
    if (radius >= 4) s += 1
    if (transitions >= 4) { s += 1.5; notes.push('Smooth transitions on interactive elements') }
    else { notes.push('No hover/focus transitions — feels static'); issues.push('No micro-interactions') }
    if (webFont) { s += 1.5; notes.push('Custom web typography') } else { issues.push('Default system fonts only') }
    if (gradients >= 2) s += 0.5
    if (s >= 8) strengths.push('Visually polished and modern')
    cats.push({ name: 'Design & polish', score: clamp(s), weight: 2, notes })
  }

  // ── Content depth ──
  {
    const notes: string[] = []
    let s = 0
    const sections = count(all, /<section/gi)
    const h = count(all, /<h[1-3][\s>]/gi)
    if (pages.length >= 4) { s += 3; notes.push(`${pages.length} pages`) }
    else if (pages.length >= 2) { s += 1.5; notes.push(`Only ${pages.length} pages`) }
    else { notes.push('Single page only'); issues.push('Very few pages') }
    if (words >= 800) { s += 3.5; notes.push(`~${words} words of real content`) }
    else if (words >= 300) { s += 2; notes.push(`~${words} words — fairly thin`) }
    else { notes.push(`Only ~${words} words`); issues.push('Very thin copy') }
    if (sections >= 6) { s += 2; notes.push(`${sections} content sections`) }
    else if (sections >= 3) s += 1
    else issues.push('Few content sections on the page')
    if (h >= 8) s += 1.5; else if (h >= 4) s += 0.75
    if (s >= 8) strengths.push('Substantial, well-structured content')
    cats.push({ name: 'Content depth', score: clamp(s), weight: 1.5, notes })
  }

  // ── Images & media ──
  {
    const notes: string[] = []
    let s = 0
    const imgs = count(all, /<img/gi)
    const alts = count(all, /<img[^>]+alt=["'][^"']+["']/gi)
    const lazy = count(all, /loading=["']lazy["']/gi)
    const modern = count(all, /\.(webp|avif)/gi)
    const dims = count(all, /<img[^>]+(width|height)=/gi)
    if (imgs >= 8) { s += 3.5; notes.push(`${imgs} images`) }
    else if (imgs >= 3) { s += 2; notes.push(`${imgs} images — could use more visuals`) }
    else { notes.push(`Only ${imgs} image(s)`); issues.push('Very few images') }
    const altPct = imgs ? Math.round((alts / imgs) * 100) : 0
    if (altPct >= 90) { s += 3; notes.push('All images have alt text') }
    else if (altPct >= 50) { s += 1.5; notes.push(`${altPct}% of images have alt text`) }
    else { notes.push(`Only ${altPct}% of images have alt text`); issues.push('Missing image alt text') }
    if (lazy > 0) { s += 1.5; notes.push('Lazy-loaded images') } else notes.push('No lazy loading — slower first paint')
    if (modern > 0) { s += 1; notes.push('Modern image formats (webp/avif)') }
    if (dims > 0) s += 1
    if (s >= 8) strengths.push('Rich, well-optimised imagery')
    cats.push({ name: 'Images & media', score: clamp(s), weight: 1.5, notes })
  }

  // ── SEO ──
  {
    const notes: string[] = []
    let s = 0
    const title = home.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ''
    const desc = /<meta[^>]+name=["']description["']/i.test(home.html)
    const og = count(home.html, /<meta[^>]+property=["']og:/gi)
    const h1 = count(home.html, /<h1[\s>]/gi)
    const canonical = /rel=["']canonical["']/i.test(home.html)
    const jsonLd = /application\/ld\+json/i.test(all)
    if (title.length >= 20 && title.length <= 70) { s += 2.5; notes.push('Well-sized page title') }
    else if (title) { s += 1; notes.push('Title present but poorly sized') }
    else { issues.push('No page title'); notes.push('Missing <title>') }
    if (desc) { s += 2; notes.push('Meta description present') }
    else { issues.push('No meta description'); notes.push('Missing meta description — hurts search results') }
    if (og >= 3) { s += 2; notes.push('Open Graph tags for social sharing') }
    else { notes.push('Few/no Open Graph tags — poor link previews'); issues.push('No social sharing tags') }
    if (h1 === 1) { s += 2; notes.push('Exactly one H1') }
    else { notes.push(h1 === 0 ? 'No H1 heading' : `${h1} H1 headings — should be one`); issues.push('Heading hierarchy problem') }
    if (canonical) s += 0.75
    if (jsonLd) { s += 0.75; notes.push('Structured data (JSON-LD)') }
    if (s >= 8) strengths.push('Strong SEO fundamentals')
    cats.push({ name: 'SEO', score: clamp(s), weight: 1.5, notes })
  }

  // ── Accessibility ──
  {
    const notes: string[] = []
    let s = 2
    const lang = /<html[^>]+lang=/i.test(home.html)
    const inputs = count(all, /<input|<textarea|<select/gi)
    const labels = count(all, /<label/gi)
    const aria = count(all, /aria-[a-z]+=/gi)
    const focus = count(css, /:focus(-visible)?/gi)
    if (lang) { s += 2; notes.push('Language declared') } else { issues.push('No lang attribute'); }
    if (inputs === 0 || labels >= inputs * 0.6) { s += 2; notes.push('Form fields are labelled') }
    else { notes.push('Form inputs missing labels'); issues.push('Unlabelled form fields') }
    if (aria >= 4) { s += 2; notes.push('ARIA attributes used') } else notes.push('Little ARIA usage')
    if (focus >= 2) { s += 2; notes.push('Visible focus styles') }
    else { notes.push('No focus styles — hard to navigate by keyboard'); issues.push('No keyboard focus styles') }
    if (s >= 8) strengths.push('Good accessibility basics')
    cats.push({ name: 'Accessibity', score: clamp(s), weight: 1, notes })
  }

  // ── Technical health ──
  {
    const notes: string[] = []
    let s = 4
    const isHttps = /^https:/i.test(pages[0].url)
    const certOk = isHttps ? await hasValidTls(pages[0].url) : false
    const inlineStyles = count(all, /\sstyle=["']/gi)
    const deprecated = count(all, /<(center|font|marquee|blink)\b/gi)
    const tables = count(all, /<table[^>]*>[\s\S]{0,200}<tr/gi)
    if (isHttps && certOk) { s += 3; notes.push('Served over HTTPS with a valid certificate') }
    else if (isHttps && !certOk) {
      s -= 2
      notes.push('HTTPS certificate is invalid or expired — visitors get a browser security warning')
      issues.push('Invalid/expired HTTPS certificate — visitors see a security warning')
    } else { issues.push('Not served over HTTPS'); notes.push('No HTTPS — insecure and penalised by search engines') }
    if (inlineStyles <= 15) { s += 2; notes.push('Styling kept in stylesheets') }
    else { notes.push(`${inlineStyles} inline style attributes — hard to maintain/restyle`) }
    if (deprecated === 0) s += 1; else { issues.push('Deprecated HTML tags in use'); notes.push('Uses deprecated tags') }
    if (tables > 2) { s -= 1; notes.push('Possible table-based layout') }
    cats.push({ name: 'Technical health', score: clamp(s), weight: 0.5, notes })
  }

  const totalWeight = cats.reduce((a, c) => a + c.weight, 0)
  const score = Math.round((cats.reduce((a, c) => a + c.score * c.weight, 0) / totalWeight) * 10) / 10

  const byName = (n: string) => cats.find((c) => c.name.startsWith(n))?.score ?? 0
  const content = byName('Content')
  const design = byName('Design')
  const mobile = byName('Mobile')

  // Verdict: keep a good site, restyle one whose bones are sound, rebuild one
  // that has neither the content nor the structure to work from.
  let verdict: SiteAudit['verdict']
  let headline: string
  let reasoning: string
  if (score >= 8) {
    verdict = 'perfect'
    headline = 'Already excellent — leave it alone'
    reasoning = 'This site scores well across design, content and technical health. Rebuilding or restyling it risks making it worse. Only targeted tweaks are worth doing.'
  } else if (content >= 5.5 && pages.length >= 2) {
    // A real business site with real content is worth FIXING, not replacing.
    // Note the "Design & polish" score measures how MODERN the CSS is (tokens,
    // transitions, flex/grid) — not whether the site looks good. A handsome
    // site built with old techniques scores low here, and telling that owner to
    // throw their design away is both wrong and a much harder sell than
    // "your site is fine, it just doesn't work on phones".
    verdict = 'enhance'
    const problems = [
      mobile < 5 ? `it does not work properly on phones (mobile ${mobile.toFixed(1)}/10)` : '',
      byName('SEO') < 5 ? 'search-engine basics are missing' : '',
      design < 4 ? 'the styling is dated' : '',
    ].filter(Boolean)
    headline = mobile < 5 ? 'Worth fixing — mobile is the big problem' : 'Worth fixing — polish it up'
    reasoning = `The content is solid (${content.toFixed(1)}/10 across ${pages.length} pages), so the site is worth keeping — ${problems.length ? problems.join(', ') : 'it just needs modernising'}. Keep their design, structure and photos, and fix what is actually broken.`
  } else {
    verdict = 'rebuild'
    headline = 'Weak foundation — rebuild it'
    reasoning = `There isn't enough here to build on (content ${content.toFixed(1)}/10, only ${pages.length} page(s)). A fresh site using their real business details will beat restyling this one.`
  }

  return {
    url: pages[0].url,
    score,
    verdict,
    headline,
    reasoning,
    categories: cats,
    strengths: [...new Set(strengths)],
    issues: [...new Set(issues)].slice(0, 10),
    stats: {
      pages: pages.length,
      words,
      images: count(all, /<img/gi),
      sections: count(all, /<section/gi),
      breakpoints: count(css, /@media[^{]*\(/gi),
      cssRulesApprox: count(css, /\{/g),
    },
  }
}
