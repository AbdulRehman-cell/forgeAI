// Picks each site's opener, section variants and surface style, seeded by the
// brand name: two bakeries get different layouts, a rebuild of the same bakery
// gets the same one. Also writes the SECTIONS part of the prompt.

import type { BrandKit } from '../brandKit'
import type { Playbook } from '../blocks'
import { Flavour, SectionDef, Shape } from './markup'
import { HEROES, heroByLayout } from './heroes'
import { SECTIONS, sectionByType } from './registry'
import { ICON_NAMES } from './icons'
import { SiteType } from './siteTypes'

export interface PlannedSection { type: string; variant: string; note: string }

export interface SitePlan {
  hero: string
  pageHero: 'page' | 'page-plain'
  sections: PlannedSection[]
  pages: string
  /** Site-wide looks: centred or left-aligned section headings; card surfaces */
  knobs: { head: 'center' | 'left'; surface: 'outline' | 'raised' | 'tinted' }
}

/** A stable, well-mixed number from a string: FNV-1a, then murmur3's finaliser
 *  (FNV's low bits alone are just the parity of the input — "% 2" barely varies) */
export function seed(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

const pick = <T>(items: T[], key: string): T => items[seed(key) % items.length]

/** A variant that suits the slot and differs in shape from the section before it */
export function chooseVariant(def: SectionDef, allowed: string[] | undefined, prev: Shape | '', key: string): string {
  const ok = (allowed ?? Object.keys(def.variants)).filter((v) => v in def.variants)
  const options = ok.length ? ok : Object.keys(def.variants)
  const fresh = options.filter((v) => def.variants[v] !== prev)
  return pick(fresh.length ? fresh : options, key)
}

export function planSite(name: string, playbook: Playbook, siteType: SiteType): SitePlan {
  const key = name.toLowerCase().trim() || 'site'
  const recipe = siteType.recipe ?? playbook.sections
  const fits = playbook.heroes.filter((h) => siteType.heroes.includes(h))
  const hero = pick(siteType.recipe || !fits.length ? siteType.heroes : fits, `${key}|hero`)
  const dark = heroByLayout(hero)?.dark ?? true
  const sections: PlannedSection[] = []
  let prev: Shape | '' = dark ? 'band' : 'split'
  for (const [i, slot] of recipe.entries()) {
    const def = sectionByType(slot.type)
    if (!def) continue
    const variant = chooseVariant(def, slot.variants, prev, `${key}|${slot.type}|${i}`)
    prev = def.variants[variant]
    sections.push({ type: slot.type, variant, note: slot.note })
  }
  return {
    hero,
    pageHero: dark ? 'page' : pick(['page', 'page-plain'] as const, `${key}|page`),
    sections,
    pages: siteType.recipe ? (siteType.pages ?? playbook.pages) : playbook.pages,
    knobs: {
      head: pick(['center', 'left'] as const, `${key}|head`),
      surface: pick(['outline', 'raised', 'tinted'] as const, `${key}|surface`),
    },
  }
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function typeLine(def: SectionDef): string {
  return `${def.type} (${Object.keys(def.variants).join(' | ')}): ${def.doc} — ${def.label}`
}

/** The SECTIONS part of the brief: format, opener, landing recipe, library. */
export function sectionsBrief(kit: BrandKit, flavour: Flavour): string {
  const plan = kit.plan
  const jsx = flavour === 'jsx'
  const page = (slug: string) => (jsx ? `/${slug}` : `${slug}.html`)
  const hero = heroByLayout(plan.hero) ?? HEROES[0]
  const pageHero = heroByLayout(plan.pageHero)!
  const usesAction = ['action', 'search'].includes(hero.layout)
  const recipe = plan.sections.map((s, i) => {
    const def = sectionByType(s.type)!
    const byHand = jsx && def.dataForm
    return `${i + 1}. <forge-section type="${s.type}" variant="${s.variant}"> — ${s.note}${byHand ? ' (React: this form saves to the database — write it by hand, see DATABASE CONTENT)' : ''}${jsx && s.type === 'cards' ? ' (React: when a table holds these, write them by hand from its rows — see DATABASE CONTENT)' : ''}`
  }).join('\n')
  const library = SECTIONS.filter((s) => !s.quran || kit.quran).map(typeLine).join('\n')
  const quran = kit.quran ? `

QURAN — NEVER write Quranic text yourself: no verse, phrase or Basmala, in Arabic or in translation. ForgeAI fills in the verified text (Tanzil) from a reference:
- a verse anywhere on a page: <forge-quran ref="2:255"></forge-quran> — or a range "2:255-257" (up to 10 ayahs), or a short surah "112". It renders as a framed quote with its translation and reference.
- the quran-* section types above: quran-verse (a highlighted verse, or a verse of the day), quran-surahs (all 114 surahs, each opening the reader), quran-reader (alone on its own page, ${page('reader')}), quran-bookmarks (its own page, ${page('bookmarks')}), quran-search (its own page, ${page('search')}).
Write ABOUT verses in your own words ("Ayat al-Kursi, the Throne Verse, 2:255"), but put a verse itself on the page only through these tags. ForgeAI adds the credits for the text, translation and recitation.` : ''
  const react = jsx ? `

REACT PAGES: put the tags straight into your JSX exactly as above, with the plain JSON between them — ForgeAI replaces every tag before the JSX is compiled and adds any imports they need. So do NOT make the JSON "valid JSX": no {'{'} or &#123; escapes, no {…}, {{…}} or JSON.stringify wrapper.
DATABASE CONTENT IS NOT A TAG. Rows from a table (products, jobs, rooms, posts, bookings) and every form that saves to the database (contact, booking, sign-up, newsletter) are JSX you write, with this markup so they match:
<section className="kit-section kit-sec-cards kit-v-grid"><div className="container"><div className="kit-head"><span className="eyebrow">…</span><h2>…</h2><p>…</p></div><div className="kit-cards">{rows.map((r) => (<article className="kit-card" key={r.id}><div className="kit-card-media"><img src={…} alt={…} /><span className="kit-badge">…</span></div><div className="kit-card-body"><p className="kit-card-meta"><span>…</span><span>…</span></p><h3>…</h3><p>…</p><div className="kit-card-foot"><span className="kit-price">…</span><Link className="btn btn-secondary" to="…">…</Link></div></div></article>))}</div></div></section>
(kit-v-grid, kit-v-list or kit-v-overlay on the section picks the card layout; leave out kit-card-media when rows have no photo.)
<section className="kit-section kit-sec-contact"><div className="container"><div className="kit-contact"><div><span className="eyebrow">…</span><h2>…</h2><p>…</p></div><form className="kit-form" onSubmit={…}><div className="kit-form-row"><div className="kit-field"><label htmlFor="…">…</label><input id="…" … /></div><div className="kit-field">…</div></div><div className="kit-field"><label htmlFor="…">…</label><textarea id="…" … /></div><button type="submit" className="btn btn-primary">…</button></form></div></div></section>
A page that a hero form or search links to reads its URL search params (useSearchParams) to pre-fill its own filters or form.
A TAG'S JSON IS FIXED TEXT, read once when the site is built: it can never hold a variable, a {…} expression or a field of a row. Anything that shows a row — a list from a table, or a page for one story or event — is JSX written by hand, with this markup:
Stories: <div className="kit-posts">{rows.map(…<article className="kit-post" key={…}><div className="kit-post-media"><img … /></div><div className="kit-post-body"><span className="kit-post-cat">…</span><h3><Link to="…">…</Link></h3><p>…</p><p className="kit-post-meta"><span>…</span></p></div></article>)}</div>
One story: <section className="kit-section kit-sec-article"><div className="container"><article className="kit-article"><div className="kit-article-top"><span className="kit-post-cat">…</span><h1>…</h1><p className="kit-article-lead">…</p></div><figure className="kit-article-cover"><img … /></figure><div className="kit-article-main"><div className="kit-prose"><p>…</p></div></div></article></div></section>
Events: <div className="kit-events">{rows.map(…<article className="kit-event" key={…}><div className="kit-event-tile"><strong>day</strong><span>month</span></div><div className="kit-event-body"><span className="kit-post-cat">…</span><h3><Link to="…">…</Link></h3><p className="kit-event-when">date · time<span>venue</span></p><p>…</p></div><div className="kit-event-side"><span className="kit-event-price">…</span><Link className="btn btn-primary" to="…">…</Link></div></article>)}</div> — show upcoming rows only, soonest first.
One event: <section className="kit-section kit-sec-event-detail kit-v-split"><div className="container"><div className="kit-eventd-top"><div><span className="eyebrow">…</span><h1>…</h1><p className="kit-article-lead">…</p><ul className="kit-contact-list kit-eventd-facts"><li><div><strong>Date</strong><span>…</span></div></li></ul><div className="kit-actions kit-eventd-actions">…</div></div><div className="kit-eventd-photo"><img … /></div></div></div></section>
quiz and rsvp tags need no database and no wiring: their replies go to the owner's Leads inbox, so use those tags unless the app must save the replies itself. A blog-index, events-list or cards tag links only to routes this app really has.` : ''
  // Every story and event promises a page, and the model has no calendar of its own
  const engines = `

TODAY is ${new Date().toISOString().slice(0, 10)}: event dates are after it, story dates on or before it.
DETAIL PAGES: a page that opens with an article or event-detail section has no <forge-hero> and is not a nav link — people reach it from its list. Every story in a blog-index and every event with an "href" links to a page you really write${jsx ? ' (a route in this app)' : ` — one page per story, never a shared page like articles.html. The site has 5 stories at most: use the SAME stories, with the same titles, in the opener and in every list. ForgeAI writes their pages, so leave them out of EXTRA PAGES`}.`
  return `═══ SECTIONS — written by you as content, rendered by ForgeAI ═══
You write each section's CONTENT as JSON inside a tag; ForgeAI renders the markup and its stylesheet styles it (layout, colours, spacing, phone layout). Write NO CSS for these sections, no markup inside a tag, and nothing else between a tag's lines.
FORMAT:
<forge-section type="features" variant="grid">
{"eyebrow":"Why families choose us","title":"Care that fits your week","intro":"…","items":[{"icon":"calendar-check","title":"Same-week appointments","text":"…"}]}
</forge-section>
JSON RULES: valid JSON — double quotes, no comments, no trailing commas; plain text in every string (no HTML, no markdown); leave a field out rather than writing filler.
LINKS: {"label":"Book a table","href":"${page('booking')}"} — a real page of this site${jsx ? ' (its route path)' : ''}, or tel:/mailto:.
PHOTOS: a URL from the PHOTO LIBRARY, or its number ("3"). Never invent photo URLs.
COPY: specific to this business — numbers, places, hours, prices. Section titles 8 words or fewer.
ICONS (use these names): ${ICON_NAMES.join(', ')}

LANDING HERO — the home page opens with exactly:
<forge-hero layout="${hero.layout}">
{…}
</forge-hero>
${hero.layout}: ${hero.doc}${usesAction && kit.heroAction ? `\nHERO ACTION: ${kit.heroAction} — "href" is the page that handles it; it receives the fields as URL parameters.` : ''}
Photo: ${kit.heroPhoto}

EVERY OTHER PAGE opens with:
<forge-hero layout="${pageHero.layout}">{…}</forge-hero>
${pageHero.layout}: ${pageHero.doc}

LANDING PAGE RECIPE — ${kit.siteType.label}${kit.siteType.recipe ? '' : ` · ${kit.playbook.label}`}. After the hero, exactly these sections in this order (ForgeAI chose the variants):
${recipe}

OTHER PAGES: ${plan.pages} Build every page from the SECTION TYPES below (any listed variant; vary them). Every page ends with a cta section.

SECTION TYPES — type (variants): content — use
${library}${engines}${quran}${react}`
}
