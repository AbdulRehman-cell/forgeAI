// Turns the model's <forge-section>/<forge-hero> content tags into finished
// markup — HTML for static pages, JSX for React pages — keeping the page's
// light/tinted rhythm and never letting two sections of the same shape touch.

import JSON5 from 'json5'
import type { BrandKit } from '../brandKit'
import { Backdrop, Content, Ctx, Flavour, Shape } from './markup'
import { heroByLayout } from './heroes'
import { ownsTone, sectionByType } from './registry'
import { chooseVariant, seed } from './plan'
import { quranFigure } from './blocks/quran'
import { openQuran, type QuranText } from '../quran/pack'
import { translationFor } from '../quran/editions'

export interface ExpandResult {
  content: string
  rendered: number
  /** Tags whose content could not be read, as "type: reason" */
  failed: string[]
}

const TAG = /<forge-(section|hero)\b([^>]*)>([\s\S]*?)<\/forge-\1\s*>/gi
/** <forge-quran ref="2:255"></forge-quran> or self-closing — anything the model put inside is dropped */
const QURAN_TAG = /<forge-quran\b([^>]*?)\s*(?:\/>|>[\s\S]*?<\/forge-quran\s*>)/gi

// The pack is read once per build (per brand kit), and only when a page quotes it
const quranTexts = new WeakMap<BrandKit, QuranText | null>()
function quranFor(kit: BrandKit): QuranText | null {
  if (!quranTexts.has(kit)) {
    const tr = translationFor(kit.lang)
    quranTexts.set(kit, openQuran(tr ? [tr.id] : []))
  }
  return quranTexts.get(kit) ?? null
}

/** The tag body with the ways models keep JSX valid undone: braces spelt
 *  {'{'} or &#123;, the whole object wrapped as {{ … }}, {( … )},
 *  {JSON.stringify(…)} or a quoted/template string. */
function unwrapBody(raw: string): string {
  let s = raw.trim().replace(/^```(?:json|jsx|js)?\s*/i, '').replace(/\s*```$/, '').trim()
  s = s.replace(/\{\s*(['"`])([{}])\1\s*\}/g, '$2')
    .replace(/&#123;|&lbrace;/g, '{').replace(/&#125;|&rbrace;/g, '}')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  for (let i = 0; i < 3; i++) {
    const m = /^\{\s*(?:JSON\.stringify\(\s*([\s\S]*?)\s*\)|`([\s\S]*)`|'([\s\S]*)'|"([\s\S]*)"|\(\s*([\s\S]*?)\s*\))\s*\}$/.exec(s)
    // JSON.stringify(obj, null, 2) — the extra arguments are not part of the object
    const inner = m ? (m[1]?.replace(/,\s*(null|undefined)\s*(,\s*(\d+|'[^']*'|"[^"]*"))?\s*$/, '') ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').trim() : ''
    // Only a wrapper when what it wraps is itself an object — {"title": "x"} is plain JSON
    if (!/^[{[]/.test(inner)) break
    s = inner
  }
  if (/^\{\s*\{[\s\S]*\}\s*\}$/.test(s)) s = s.replace(/^\{\s*/, '').replace(/\s*\}$/, '')
  return s
}

/** JSON as models actually write it: fenced, JSX-escaped or wrapped (see
 *  unwrapBody), with trailing commas, unquoted keys, single quotes, comments or
 *  raw line breaks inside strings. Never evaluated as code. */
export function parseLooseJson(raw: string): Content | null {
  const s = unwrapBody(raw)
  const attempts: Array<() => unknown> = [
    () => JSON.parse(s),
    () => JSON.parse(s.replace(/,\s*([}\]])/g, '$1').replace(/[\r\n\t]+/g, ' ')),
    () => JSON5.parse(s),
    () => JSON5.parse(s.replace(/[\r\n\t]+/g, ' ')),
  ]
  for (const attempt of attempts) {
    try {
      const v = attempt()
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Content
      if (Array.isArray(v)) return { items: v }
    } catch { /* next attempt */ }
  }
  return null
}

export interface ListedPage { page: string; title: string; text: string; photo: string; post: Content; rank: number }

// Models send every story to "articles.html", name pages they never write and invent
// new stories on every page, so a static site's stories are ForgeAI's job: one page
// per title for the whole build, and once the set is chosen, lists show only those
const storyPages = new WeakMap<BrandKit, Map<string, ListedPage>>()
const sealedStories = new WeakSet<BrandKit>()
const LIST_PAGE = /^(index|articles?|blog|stories|news|posts|journal|recipes|guides|events?|calendar|whats-?on|shows|programme|schedule|about|contact)\.html$/i
const storyKey = (title: unknown) => String(title ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** rank 1: the lead story and the lists, which get their pages first; rank 2: the opener's side stories */
function pageForStory(kit: BrandKit, item: Content, title: string, href: unknown, rank = 1): string {
  const pages = storyPages.get(kit) ?? new Map<string, ListedPage>()
  storyPages.set(kit, pages)
  const key = storyKey(title)
  const known = pages.get(key)
  if (known) { known.rank = Math.min(known.rank, rank); return known.page }
  const taken = (p: string) => [...pages.values()].some((v) => v.page === p)
  const own = String(href ?? '').replace(/^\.?\/+/, '').split(/[?#]/)[0]
  const asked = /\.html$/i.test(own) ? own : own && /^[\w-]+$/.test(own) ? `${own}.html` : ''
  let page = asked && /^[\w-]+\.html$/.test(asked) && !LIST_PAGE.test(asked) && !taken(asked) ? asked : ''
  if (!page) {
    // Urdu and Arabic titles have no Latin letters to make a file name from
    const words = key.replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).filter(Boolean).slice(0, 6).join('-')
    page = `${words || `story-${seed(key).toString(36)}`}.html`
    for (let n = 2; taken(page); n++) page = `${words || `story-${seed(key).toString(36)}`}-${n}.html`
  }
  const text = String(item.text ?? item.lead ?? '')
  const post = { title, href: page, photo: item.photo, category: item.category ?? item.tag, date: item.date, readTime: item.readTime, author: item.author, text }
  pages.set(key, { page, title, text, photo: String(item.photo ?? ''), post, rank })
  return page
}

/** These stories are the site's whole set: from now on lists show only them */
export function sealStoryPages(kit: BrandKit, keep: string[]): void {
  const pages = storyPages.get(kit)
  if (!pages) return
  for (const [key, l] of pages) if (!keep.includes(l.page)) pages.delete(key)
  sealedStories.add(kit)
}

/** Gives the stories (and events with their own page) in this tag their one true page */
function assignStoryPages(data: Content, kind: 'section' | 'hero', type: string, kit: BrandKit, thisStory: string): void {
  const isOutside = (h: unknown) => /^(https?:|mailto:|tel:|\/\/)/i.test(String(h ?? ''))
  const sealed = sealedStories.has(kit)
  const pages = storyPages.get(kit)
  if (kind === 'hero') {
    if (type !== 'editorial' || sealed) return
    if (data.primary && typeof data.primary === 'object' && data.title && !isOutside(data.primary.href)) data.primary.href = pageForStory(kit, data, String(data.title), data.primary.href)
    for (const s of Array.isArray(data.stories) ? data.stories : []) if (s?.title && !isOutside(s.href)) s.href = pageForStory(kit, s, String(s.title), s.href, 2)
    return
  }
  if (type === 'blog-index') {
    const posts: Content[] = (Array.isArray(data.posts) ? data.posts : Array.isArray(data.items) ? data.items : []).filter((p: Content) => p?.title)
    if (!sealed) {
      for (const p of posts) if (!isOutside(p.href ?? p.url)) p.href = pageForStory(kit, p, String(p.title), p.href ?? p.url)
      return
    }
    // Real stories only, and never a list left short because the model made new ones up
    const real = posts.filter((p) => pages?.has(storyKey(p.title)) && storyKey(p.title) !== thisStory)
    for (const p of real) { p.href = pages!.get(storyKey(p.title))!.page; delete p.url }
    const others = [...(pages?.entries() ?? [])].filter(([k]) => k !== thisStory && !real.some((p) => storyKey(p.title) === k)).map(([, l]) => ({ ...l.post }))
    data.posts = thisStory ? [...real, ...others].slice(0, 3) : [...real, ...others]
    delete data.items
  } else if (type === 'events-list') {
    for (const e of Array.isArray(data.events) ? data.events : Array.isArray(data.items) ? data.items : []) {
      const title = e?.title ?? e?.name
      if (!title || !e.href || isOutside(e.href)) continue
      // An event with no page of its own keeps its listing and loses the link
      if (sealed && !pages?.has(storyKey(title))) delete e.href
      else e.href = pageForStory(kit, e, String(title), e.href)
      // "Tickets" that lead back to the calendar go nowhere: its own page has them
      const ticketPage = String(e.ticket?.href ?? '').replace(/^\.?\/+/, '').split(/[?#]/)[0]
      const asPage = /\.html$/i.test(ticketPage) ? ticketPage : `${ticketPage}.html`
      if (e.href && e.ticket && typeof e.ticket === 'object' && !isOutside(e.ticket.href) && LIST_PAGE.test(asPage)) e.ticket.href = e.href
    }
  }
}

/** The first characters of a body that could not be read, for the build log */
const preview = (body: string) => JSON.stringify(body.trim().replace(/\s+/g, ' ').slice(0, 48))

const attr = (attrs: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(attrs)?.[1]?.trim().toLowerCase() ?? ''

/** React pages that use <Link> or <KitForm> need the imports */
function ensureImports(src: string, needsLink: boolean, needsKitForm: boolean): string {
  let out = src
  if (needsLink && !/import\s*\{[^}]*\bLink\b[^}]*\}\s*from\s*['"]react-router-dom['"]/.test(out)) {
    const existing = /import\s*\{([^}]*)\}\s*from\s*['"]react-router-dom['"]/.exec(out)
    out = existing
      ? out.replace(existing[0], `import { ${[...existing[1].split(',').map((s) => s.trim()).filter(Boolean), 'Link'].join(', ')} } from 'react-router-dom'`)
      : `import { Link } from 'react-router-dom'\n${out}`
  }
  if (needsKitForm && !/import\s+KitForm\b/.test(out)) out = `import KitForm from '../components/KitForm'\n${out}`
  return out
}

/** Every tag in a page, rendered in order. Idempotent: a page with no tags comes back unchanged. */
export function expandSections(src: string, kit: BrandKit, flavour: Flavour): ExpandResult {
  if (!/<forge-(section|hero|quran)\b/i.test(src)) return { content: src, rendered: 0, failed: [] }
  const x = new Ctx(flavour, kit.photos.length ? kit.photos : [kit.heroPhoto], [kit.heroPhoto], kit.lang)
  x.quranText = () => quranFor(kit)
  const failed: string[] = []
  let rendered = 0
  let backdrop: Backdrop = 'dark'
  let prevShape: Shape | '' = ''
  let index = 0
  /** The story this page is about: its "related stories" list leaves it out */
  let thisStory = ''
  const sections = src.replace(TAG, (whole, kind: string, attrs: string, body: string) => {
    const data = parseLooseJson(body)
    if (kind.toLowerCase() === 'hero') {
      let layout = attr(attrs, 'layout') || attr(attrs, 'type')
      if (!heroByLayout(layout)) layout = /page/.test(layout) ? kit.plan.pageHero : kit.plan.hero
      const hero = heroByLayout(layout)!
      if (!data) { failed.push(`hero ${layout}: unreadable JSON ${preview(body)}`); return '' }
      // The landing opener's photo is the kit's hero photo unless the model named one
      if (!/^page/.test(layout) && !/^https?:/i.test(String(data.photo ?? ''))) data.photo = kit.heroPhoto
      if (flavour === 'html' && layout === 'editorial') {
        // The front page's side column shows the page's real stories, not ones invented for the opener
        const list = [...src.matchAll(TAG)].find((m) => m[1].toLowerCase() === 'section' && attr(m[2], 'type') === 'blog-index')
        const listed = list ? parseLooseJson(list[3]) : null
        const posts: Content[] = Array.isArray(listed?.posts) ? listed!.posts : Array.isArray(listed?.items) ? listed!.items : []
        const side = posts.filter((p) => p?.title && storyKey(p.title) !== storyKey(data.title)).slice(0, 3)
        if (side.length >= 2) data.stories = side.map((p) => ({ tag: p.category ?? p.tag, title: p.title, href: p.href ?? p.url, photo: p.photo, text: p.text }))
      }
      if (flavour === 'html') assignStoryPages(data, 'hero', layout, kit, '')
      rendered++
      backdrop = hero.dark ? 'dark' : layout === 'product' || layout === 'page-plain' ? 'alt' : 'bg'
      prevShape = hero.dark ? 'band' : 'split'
      return hero.render(data, x)
    }
    const type = attr(attrs, 'type')
    const def = sectionByType(type)
    if (!def) { failed.push(`${type || 'section'}: unknown type`); return '' }
    if (!data) { failed.push(`${type}: unreadable JSON ${preview(body)}`); return '' }
    if (type === 'article') thisStory = storyKey(data.title)
    if (flavour === 'html') assignStoryPages(data, 'section', type, kit, thisStory)
    const asked = attr(attrs, 'variant')
    const variant = asked in def.variants ? asked : chooseVariant(def, undefined, prevShape, `${kit.name}|${type}|${index}`)
    index++
    prevShape = def.variants[variant]
    let tone = ''
    if (ownsTone(def, variant)) {
      backdrop = def.leaves?.(variant) ?? 'dark'
    } else {
      tone = backdrop === 'bg' ? 'kit-alt' : ''
      backdrop = tone ? 'alt' : 'bg'
    }
    rendered++
    try {
      return def.render(data, variant, x, tone)
    } catch (e) {
      failed.push(`${type}: ${(e as Error).message}`)
      return ''
    }
  })
  // A verse anywhere on the page, filled in from the verified pack — never the model's text
  const content = sections.replace(QURAN_TAG, (_whole, attrs: string) => {
    const ref = attr(attrs, 'ref')
    const figure = ref ? quranFigure(x, ref, { cls: 'kit-ayah-inline', translation: attr(attrs, 'translation') !== 'none' }) : null
    if (!figure) { failed.push(`quran ${ref || '(no ref)'}: ${quranFor(kit) ? 'there is no such verse' : 'the Quran data pack is missing'}`); return '' }
    rendered++
    return figure
  })
  return {
    content: flavour === 'jsx' ? ensureImports(content, x.needsLink, x.needsKitForm) : content,
    rendered,
    failed,
  }
}

/** The stories and events a static site's pages promise a page of their own, so those
 *  pages get written, and written to match. */
export const listedPages = (kit: BrandKit): ListedPage[] => [...(storyPages.get(kit)?.values() ?? [])].sort((a, b) => a.rank - b.rank)

/** Pages that open from a list rather than the menu */
export const isDetailPage = (html: string) => /\bdata-kit="(?:article|event-detail)"/.test(html)

/** A page that never got written: its story leaves the list, its event keeps its
 *  listing but loses the link. Nobody should click through to a missing page. */
export function dropDeadListings(html: string, pages: string[]): string {
  const alive = (p: string) => pages.some((x) => x.toLowerCase() === p.toLowerCase())
  return html
    .replace(/<article\b[^>]*\bdata-kit-page="([^"]+)"[^>]*>[\s\S]*?<\/article>/g, (card, p: string) => (alive(p) ? card : ''))
    .replace(/<article\b[^>]*\bdata-kit-event-page="([^"]+)"[^>]*>[\s\S]*?<\/article>/g, (card, p: string) => (alive(p) ? card : card.replace(/<h3><a\b[^>]*>([\s\S]*?)<\/a><\/h3>/, '<h3>$1</h3>')))
    // Nothing left to list: the heading goes too
    .replace(/<div class="kit-story-list"><p[^>]*>[^<]*<\/p><\/div>/g, '')
    .replace(/<section\b[^>]*\bkit-sec-blog-index\b[^>]*>(?:(?!<\/section>)[\s\S])*?<div class="kit-posts"><\/div>[\s\S]*?<\/section>/g, '')
}

/** A button or link to a page that was never written ("rsvp.html") goes somewhere real:
 *  the RSVP form when this page has one, else the contact page, else home. */
export function repairDeadLinks(html: string, pages: string[]): { html: string; repaired: string[] } {
  const repaired: string[] = []
  const alive = (p: string) => pages.some((x) => x.toLowerCase() === p.toLowerCase())
  const form = /\bid="kit-rsvp"/.test(html)
  const out = html.replace(/(<a\b[^>]*\bhref=")\.?\/?([\w-]+\.html)(?:[?#][^"]*)?(")/g, (link, before: string, page: string, after: string) => {
    if (alive(page)) return link
    repaired.push(page)
    return `${before}${form ? '#kit-rsvp' : alive('contact.html') ? 'contact.html' : 'index.html'}${after}`
  })
  return { html: out, repaired }
}

/** Article and event pages open from their lists, whatever the model put in the top menu */
export function dropDetailNavLinks(html: string, detailPages: string[]): string {
  return html.replace(/<nav\b[\s\S]*?<\/nav>/i, (nav) => nav.replace(/\s*<a\b[^>]*\bhref="\.?\/?([\w-]+\.html)"[^>]*>[\s\S]*?<\/a>/g, (link, p: string) => (detailPages.includes(p) ? '' : link)))
}

/** The scaffold component behind hero search and booking forms in React apps */
export const KIT_FORM_JSX = `import { useNavigate } from 'react-router-dom'

// Hero and search forms: go to the page that handles them, carrying what the
// visitor typed as URL parameters (that page pre-fills its own form or filters).
export default function KitForm({ to, className, children }) {
  const navigate = useNavigate()
  const submit = (e) => {
    e.preventDefault()
    const params = new URLSearchParams()
    for (const [key, value] of new FormData(e.currentTarget)) {
      if (String(value).trim()) params.set(key, String(value).trim())
    }
    const query = params.toString()
    navigate(query ? \`\${to}?\${query}\` : to)
  }
  return <form className={className} onSubmit={submit}>{children}</form>
}
`
