// Shared markup helpers for ForgeAI sections. Every section renders through a
// Ctx, so the same section file produces both static HTML and React JSX.

import { iconSvg } from './icons'
import { StringKey, t } from './strings'

export type Flavour = 'html' | 'jsx'
/** A variant's visual shape — two sections of the same shape never sit together */
export type Shape = 'grid' | 'split' | 'band' | 'list' | 'media'
export type Content = Record<string, any>
/** What a band paints: page colour, tinted surface, or dark/brand colour */
export type Backdrop = 'bg' | 'alt' | 'dark'

export interface SectionDef {
  type: string
  label: string
  /** variant → shape */
  variants: Record<string, Shape>
  /** The content the model writes, shown in the prompt */
  doc: string
  /** Paints its own background (all variants, or the listed ones), so it sits
   *  outside the page's light/tinted alternation */
  ownTone?: boolean | string[]
  /** The background it leaves behind, for the next section's alternation */
  leaves?: (variant: string) => Backdrop
  /** Holds a form a React app must wire to its database — React pages write it by hand */
  dataForm?: boolean
  render(c: Content, variant: string, x: Ctx, tone: string): string
  css: string
}

const ENTITY: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '{': '&#123;', '}': '&#125;' }
/** Safe in HTML text, HTML attributes, JSX text and JSX string attributes alike. */
export const esc = (s: string): string => s.replace(/[&<>"{}]/g, (ch) => ENTITY[ch])

/** Model text → plain text: tags dropped, the usual entities decoded. */
export function plain(v: unknown): string {
  if (typeof v === 'number') return String(v)
  if (typeof v !== 'string') return ''
  return v
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export const list = (v: unknown, max = 12): any[] => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined && x !== '').slice(0, max) : [])

let formSeq = 0

export class Ctx {
  /** Set when the markup uses <Link> or <KitForm>, so the page gets the import */
  needsLink = false
  needsKitForm = false
  private next = 0

  constructor(readonly flavour: Flavour, private readonly photos: string[], private readonly skip: string[] = [], readonly lang = 'en') {}

  /** One of ForgeAI's own strings in the site's language, escaped */
  say(key: StringKey, vars?: Record<string, string | number>): string { return esc(t(this.lang, key, vars)) }

  get jsx(): boolean { return this.flavour === 'jsx' }

  /** class="a b" / className="a b" — empty names give nothing */
  cls(...names: (string | false | undefined)[]): string {
    const v = names.filter(Boolean).join(' ').trim()
    return v ? ` ${this.jsx ? 'className' : 'class'}="${v}"` : ''
  }

  text(v: unknown): string { return esc(plain(v)) }

  /** A piece of a sentence — keeps its edge spaces ("for the " + accent) */
  frag(s: string): string { return esc(s.replace(/\s+/g, ' ')) }

  /** A photo from the content, or the next library photo nobody else on the page used */
  photo(v?: unknown): string {
    const s = plain(v)
    if (/^https?:\/\/[^\s"'<>]+$/i.test(s)) return s
    if (!this.photos.length) return ''
    // "3" or "photo 3" — a PHOTO LIBRARY number
    const n = Number(/^(?:photo\s*#?)?(\d+)$/i.exec(s)?.[1])
    if (n >= 1 && n <= this.photos.length) return this.photos[n - 1]
    const fresh = this.photos.filter((p) => !this.skip.includes(p))
    const pool = fresh.length ? fresh : this.photos
    return pool[this.next++ % pool.length]
  }

  img(src: string, alt: unknown, cls?: string, eager = false): string {
    if (!src) return ''
    return `<img${this.cls(cls)} src="${esc(src)}" alt="${this.text(alt)}"${eager ? '' : ' loading="lazy"'}${this.jsx ? ' />' : '>'}`
  }

  /** A site link in this flavour's form: about.html for static pages, /about for React routes */
  href(v: unknown): string {
    const raw = plain(v)
    if (/^(https?:|mailto:|tel:|#|\/\/)/i.test(raw)) return raw
    const m = /^([^?#]*)([?#].*)?$/.exec(raw) ?? ['', raw, '']
    const slug = m[1].replace(/^\.?\/+/, '').replace(/\/+$/, '').replace(/\.html?$/i, '').replace(/\/index$/i, '')
    const rest = m[2] ?? ''
    if (this.jsx) return `/${slug === 'index' ? '' : slug}${rest}`
    return `${!slug || slug === 'index' ? 'index' : slug}.html${rest}`
  }

  link(l: unknown, cls: string, fallback = ''): string {
    const o = l && typeof l === 'object' ? (l as Content) : { label: l }
    const label = plain(o.label ?? o.text) || fallback
    if (!label) return ''
    const href = this.href(o.href ?? o.url ?? o.to)
    if (this.jsx && href.startsWith('/') && !href.startsWith('//')) {
      this.needsLink = true
      return `<Link${this.cls(cls)} to="${esc(href)}">${esc(label)}</Link>`
    }
    const out = /^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ''
    return `<a${this.cls(cls)} href="${esc(href)}"${out}>${esc(label)}</a>`
  }

  icon(name: unknown, cls = 'kit-icon'): string {
    return `<span${this.cls(cls)}>${iconSvg(name, this.flavour)}</span>`
  }

  /** Section heading block; with `action` the heading sits left and the link right */
  head(c: Content, action?: string): string {
    const eyebrow = plain(c.eyebrow)
    const title = plain(c.title)
    const intro = plain(c.intro ?? c.text)
    if (!eyebrow && !title && !intro) return ''
    const head = `<div${this.cls('kit-head')}>${eyebrow ? `<span${this.cls('eyebrow')}>${esc(eyebrow)}</span>` : ''}${title ? `<h2>${esc(title)}</h2>` : ''}${intro ? `<p>${esc(intro)}</p>` : ''}</div>`
    return action ? `<div${this.cls('kit-head-row')}>${head}${action}</div>` : head
  }

  /** A standard section: tone band → container → heading → body */
  section(type: string, variant: string, tone: string, c: Content, body: string, opts: { action?: string; extra?: string; noHead?: boolean } = {}): string {
    return `<section${this.cls('kit-section', tone, `kit-sec-${type}`, `kit-v-${variant}`, opts.extra)} data-kit="${type}"><div${this.cls('container')}>${opts.noHead ? '' : this.head(c, opts.action)}${body}</div></section>`
  }

  /** A form that takes the visitor to another page with what they typed as URL
   *  parameters — a plain GET form in HTML, the scaffold's KitForm in React. */
  goForm(cls: string, to: unknown, inner: string): string {
    const href = this.href(to || (this.jsx ? '/contact' : 'contact.html'))
    if (this.jsx) {
      this.needsKitForm = true
      return `<KitForm${this.cls(cls)} to="${esc(href.split('?')[0])}">${inner}</KitForm>`
    }
    return `<form${this.cls(cls)} action="${esc(href.split('?')[0])}" method="get">${inner}</form>`
  }

  /** A form the page handles itself (contact, newsletter) — static sites only */
  ownForm(cls: string, inner: string): string {
    return `<form${this.cls(cls)} data-kit-form>${inner}</form>`
  }

  field(f: unknown, i: number): string {
    const o = f && typeof f === 'object' ? (f as Content) : { label: f }
    const label = plain(o.label) || `Field ${i + 1}`
    const name = (plain(o.name) || label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || `field_${i + 1}`
    const options = list(o.options, 12).map(plain).filter(Boolean)
    const type = options.length ? 'select' : (/^(email|tel|date|number|time|textarea)$/.exec(plain(o.type).toLowerCase())?.[0] ?? 'text')
    const id = `kf${++formSeq}-${name}`
    const ph = plain(o.placeholder)
    const phAttr = ph ? ` placeholder="${esc(ph)}"` : ''
    const control = type === 'select'
      ? `<select id="${id}" name="${name}">${options.map((op) => `<option>${esc(op)}</option>`).join('')}</select>`
      : type === 'textarea'
        ? `<textarea id="${id}" name="${name}" rows="4"${phAttr}></textarea>`
        : `<input id="${id}" name="${name}" type="${type}"${phAttr}${this.jsx ? ' />' : '>'}`
    return `<div${this.cls('kit-field')}><label ${this.jsx ? 'htmlFor' : 'for'}="${id}">${esc(label)}</label>${control}</div>`
  }

  /** A page-unique id for label/input pairs */
  uid(prefix: string): string { return `${prefix}${++formSeq}` }

  /** Stars for a rating 1–5 (default 5) */
  stars(v: unknown): string {
    const n = Math.max(1, Math.min(5, Math.round(Number(v) || 5)))
    return `<div${this.cls('kit-stars')} aria-label="${this.say('stars', { n })}">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</div>`
  }

  initials(name: unknown): string {
    // "Dr Sana Iqbal" → SI: titles are not initials
    const words = plain(name).split(/\s+/).filter((w) => /^\p{L}/u.test(w) && !/^(dr|mr|mrs|ms|miss|prof|sir|chef|coach|rev)\.?$/i.test(w))
    return esc(((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() || '★')
  }
}
