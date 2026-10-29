// Turns the model's <forge-section>/<forge-hero> content tags into finished
// markup — HTML for static pages, JSX for React pages — keeping the page's
// light/tinted rhythm and never letting two sections of the same shape touch.

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

/** JSON as models actually write it: fenced, wrapped in a JSX expression, with
 *  trailing commas, unquoted keys or raw line breaks inside strings. */
export function parseLooseJson(raw: string): Content | null {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  // JSX writers sometimes wrap it as an expression: {{ … }} or {( … )}
  if (/^\{\s*\{[\s\S]*\}\s*\}$/.test(s)) s = s.replace(/^\{\s*/, '').replace(/\s*\}$/, '')
  if (/^\{\s*\(/.test(s)) s = s.replace(/^\{\s*\(\s*/, '').replace(/\s*\)\s*\}$/, '')
  const attempts = [
    s,
    s.replace(/,\s*([}\]])/g, '$1').replace(/[\r\n\t]+/g, ' '),
    s.replace(/,\s*([}\]])/g, '$1').replace(/[\r\n\t]+/g, ' ').replace(/([{,]\s*)([A-Za-z_][\w-]*)\s*:/g, '$1"$2":'),
  ]
  for (const a of attempts) {
    try {
      const v = JSON.parse(a)
      if (v && typeof v === 'object' && !Array.isArray(v)) return v
      if (Array.isArray(v)) return { items: v }
    } catch { /* next attempt */ }
  }
  return null
}

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
  const x = new Ctx(flavour, kit.photos.length ? kit.photos : [kit.heroPhoto], [kit.heroPhoto])
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
      if (!data) { failed.push(`hero ${layout}: unreadable JSON`); return '' }
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
    if (!data) { failed.push(`${type}: unreadable JSON`); return '' }
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
