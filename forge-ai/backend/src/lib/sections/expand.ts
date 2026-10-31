// Turns the model's <forge-section>/<forge-hero> content tags into finished
// markup — HTML for static pages, JSX for React pages — keeping the page's
// light/tinted rhythm and never letting two sections of the same shape touch.

import JSON5 from 'json5'
import type { BrandKit } from '../brandKit'
import { Backdrop, Content, Ctx, Flavour, Shape } from './markup'
import { heroByLayout } from './heroes'
import { ownsTone, sectionByType } from './registry'
import { chooseVariant } from './plan'

export interface ExpandResult {
  content: string
  rendered: number
  /** Tags whose content could not be read, as "type: reason" */
  failed: string[]
}

const TAG = /<forge-(section|hero)\b([^>]*)>([\s\S]*?)<\/forge-\1\s*>/gi

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
  if (!/<forge-(section|hero)\b/i.test(src)) return { content: src, rendered: 0, failed: [] }
  const x = new Ctx(flavour, kit.photos.length ? kit.photos : [kit.heroPhoto], [kit.heroPhoto], kit.lang)
  const failed: string[] = []
  let rendered = 0
  let backdrop: Backdrop = 'dark'
  let prevShape: Shape | '' = ''
  let index = 0
  const content = src.replace(TAG, (whole, kind: string, attrs: string, body: string) => {
    const data = parseLooseJson(body)
    if (kind.toLowerCase() === 'hero') {
      let layout = attr(attrs, 'layout') || attr(attrs, 'type')
      if (!heroByLayout(layout)) layout = /page/.test(layout) ? kit.plan.pageHero : kit.plan.hero
      const hero = heroByLayout(layout)!
      if (!data) { failed.push(`hero ${layout}: unreadable JSON ${preview(body)}`); return '' }
      // The landing opener's photo is the kit's hero photo unless the model named one
      if (!/^page/.test(layout) && !/^https?:/i.test(String(data.photo ?? ''))) data.photo = kit.heroPhoto
      rendered++
      backdrop = hero.dark ? 'dark' : layout === 'product' || layout === 'page-plain' ? 'alt' : 'bg'
      prevShape = hero.dark ? 'band' : 'split'
      return hero.render(data, x)
    }
    const type = attr(attrs, 'type')
    const def = sectionByType(type)
    if (!def) { failed.push(`${type || 'section'}: unknown type`); return '' }
    if (!data) { failed.push(`${type}: unreadable JSON ${preview(body)}`); return '' }
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
  return {
    content: flavour === 'jsx' ? ensureImports(content, x.needsLink, x.needsKitForm) : content,
    rendered,
    failed,
  }
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
