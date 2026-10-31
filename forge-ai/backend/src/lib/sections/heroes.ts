// Opening sections. Photo heroes (action, centered, search, countdown) sit on a
// dark photo under a floating header. Light openers (split, mosaic, statement,
// product, editorial) use "kit-intro" classes and never the word "hero": the
// hero contrast safety net paints all text inside any *hero* section white.

import { Content, Ctx, list, plain } from './markup'
import { t } from './strings'

export interface HeroDef {
  layout: string
  /** Shown in the prompt: when it fits and the content it takes */
  doc: string
  /** Dark photo opener (the header floats over it) or a light one */
  dark: boolean
  render(c: Content, x: Ctx): string
}

function h1(c: Content, x: Ctx): string {
  const title = plain(c.title) || 'Welcome'
  const accent = plain(c.accent)
  if (!accent) return `<h1>${x.text(title)}</h1>`
  const at = title.toLowerCase().indexOf(accent.toLowerCase())
  // An accent that is not part of the headline would add words to it — leave it out
  if (at < 0) return `<h1>${x.text(title)}</h1>`
  return `<h1>${x.frag(title.slice(0, at))}<span${x.cls('accent')}>${x.frag(title.slice(at, at + accent.length))}</span>${x.frag(title.slice(at + accent.length))}</h1>`
}

/** The lead sentence; one phrase may rotate through alternatives */
function lead(c: Content, x: Ctx, cls: string): string {
  const text = plain(c.lead ?? c.text)
  if (!text) return ''
  const words = list(c.rotate, 5).map(plain).filter(Boolean)
  const at = words.length > 1 ? text.indexOf(words[0]) : -1
  const body = at < 0
    ? x.text(text)
    : `${x.frag(text.slice(0, at))}<span${x.cls('kit-rotate')} data-words="${x.text(words.join('|'))}">${x.frag(words[0])}</span>${x.frag(text.slice(at + words[0].length))}`
  return `<p${x.cls(cls)}>${body}</p>`
}

const eyebrow = (c: Content, x: Ctx, cls: string) => (plain(c.eyebrow) ? `<span${x.cls(cls)}>${x.text(c.eyebrow)}</span>` : '')

function actions(c: Content, x: Ctx, cls: string): string {
  const a = `${x.link(c.primary, 'btn btn-primary')}${x.link(c.secondary, 'btn btn-secondary')}`
  return a ? `<div${x.cls(cls)}>${a}</div>` : ''
}

function heroStats(c: Content, x: Ctx): string {
  const stats = list(c.stats, 4).filter((s) => plain(s?.value))
  return stats.length ? `<div${x.cls('hero-stats')}>${stats.map((s) => `<div${x.cls('hero-stat')}><span${x.cls('hero-stat-value')}>${x.text(s.value)}</span><span${x.cls('hero-stat-label')}>${x.text(s.label)}</span></div>`).join('')}</div>` : ''
}

function fields(c: Content, x: Ctx, fallback: Content[]): string {
  const f = list(c.action?.fields, 3)
  return (f.length ? f : fallback).map((field, i) => x.field(field, i)).join('')
}

function photoHero(cls: string, c: Content, x: Ctx, inner: string): string {
  return `<section${x.cls('hero', 'hero-photo', cls)} data-kit="hero">${x.img(x.photo(c.photo), c.photoAlt ?? c.title, 'hero-bg', true)}<div${x.cls('hero-inner')}>${inner}</div></section>`
}

function introProof(c: Content, x: Ctx): string {
  const stats = list(c.stats, 3).filter((s) => plain(s?.value))
  if (stats.length) return `<div${x.cls('kit-intro-proof')}>${stats.map((s) => `<div><strong>${x.text(s.value)}</strong><span>${x.text(s.label)}</span></div>`).join('')}</div>`
  const points = list(c.points, 4).map(plain).filter(Boolean)
  return points.length ? `<ul${x.cls('kit-checks')}>${points.map((p) => `<li>${x.text(p)}</li>`).join('')}</ul>` : ''
}

function intro(cls: string, x: Ctx, inner: string): string {
  return `<section${x.cls('kit-intro', cls)} data-kit="hero"><div${x.cls('kit-intro-inner')}>${inner}</div></section>`
}

const introCopy = (c: Content, x: Ctx, extra = '') =>
  `<div${x.cls('kit-intro-copy')}>${eyebrow(c, x, 'kit-intro-eyebrow')}${h1(c, x)}${lead(c, x, 'kit-intro-lead')}${extra}</div>`

const PHOTO_FIELDS = '"eyebrow","title","accent":"the phrase of the title in brand colour","lead","primary":{label,href},"secondary":{label,href},"photo"'

export const HEROES: HeroDef[] = [
  {
    layout: 'action',
    dark: true,
    doc: `photo hero with the visitor's #1 task as a form card beside the headline — {${PHOTO_FIELDS},"rotate":["…"] (optional words that cycle in the lead; the first must appear in it),"stats":[{"value","label"}] ×3–4,"action":{"title","fields":[{"label","name","type","options"}] ×2–3,"button","href":"the page that handles it"}} — with no form-like task, give "cards":[{"icon","label","value"}] ×2 instead of "action"`,
    render(c, x) {
      const act = c.action && typeof c.action === 'object' ? c.action : null
      const cards = list(c.cards, 2).filter((k) => plain(k?.value))
      const glass = cards.map((k) => `<div${x.cls('hero-glass')}>${x.icon(k.icon, 'hero-glass-icon')}<div><span${x.cls('hero-glass-label')}>${x.text(k.label)}</span><span${x.cls('hero-glass-value')}>${x.text(k.value)}</span></div></div>`).join('')
      const card = act ? `<div${x.cls('hero-card')}>${plain(act.title) ? `<h3>${x.text(act.title)}</h3>` : ''}${x.goForm('hero-form', act.href, `${fields(c, x, [{ label: t(x.lang, 'whatNeed') }])}<button type="submit"${x.cls('btn btn-primary')}>${x.text(act.button || t(x.lang, 'continue'))}</button>`)}</div>` : ''
      const aside = glass || card ? `<aside${x.cls('hero-aside')}>${act ? '' : glass}${card}</aside>` : ''
      return photoHero('kit-hero-action', c, x, `<div${x.cls('hero-copy')}>${eyebrow(c, x, 'hero-eyebrow')}${h1(c, x)}${lead(c, x, 'hero-lead')}${actions(c, x, 'hero-actions')}</div>${aside}${heroStats(c, x)}`)
    },
  },
  {
    layout: 'centered',
    dark: true,
    doc: `big centred headline over a full photo — {${PHOTO_FIELDS},"stats":[{"value","label"}] ×0–4}`,
    render(c, x) {
      return photoHero('kit-hero-centered', c, x, `<div${x.cls('hero-copy')}>${eyebrow(c, x, 'hero-eyebrow')}${h1(c, x)}${lead(c, x, 'hero-lead')}${actions(c, x, 'hero-actions')}</div>${heroStats(c, x)}`)
    },
  },
  {
    layout: 'search',
    dark: true,
    doc: `centred headline and one wide search bar over a photo (jobs, property, listings, rooms) — {"eyebrow","title","accent","lead","photo","action":{"fields":[{"label","name","type","options"}] ×1–3,"button","href":"the results page"},"chips":["popular search"] ×3–5}`,
    render(c, x) {
      const href = c.action?.href
      const bar = x.goForm('kit-search', href, `${fields(c, x, [{ label: t(x.lang, 'lookingFor'), name: 'q' }])}<button type="submit"${x.cls('btn btn-primary')}>${x.text(c.action?.button || t(x.lang, 'search'))}</button>`)
      const chips = list(c.chips, 5).map(plain).filter(Boolean)
      const base = x.href(href || (x.jsx ? '/' : 'index.html')).split('?')[0]
      const chipRow = chips.length ? `<div${x.cls('kit-chips')}><span>${x.say('popular')}</span>${chips.map((ch) => x.link({ label: ch, href: `${base}?q=${encodeURIComponent(ch)}` }, '')).join('')}</div>` : ''
      return photoHero('kit-hero-centered kit-hero-search', c, x, `<div${x.cls('hero-copy')}>${eyebrow(c, x, 'hero-eyebrow')}${h1(c, x)}${lead(c, x, 'hero-lead')}<div${x.cls('kit-search-wrap')}>${bar}${chipRow}</div></div>`)
    },
  },
  {
    layout: 'countdown',
    dark: true,
    doc: `event hero: date, venue and a live countdown over a photo — {"title","accent","lead","date":"2026-11-20T18:00 (ISO, local time)","when":"20 November 2026 · 6pm","venue","primary":{label,href},"secondary":{label,href},"photo"}`,
    render(c, x) {
      const when = [plain(c.when), plain(c.venue)].filter(Boolean).join(' · ')
      const date = plain(c.date)
      const unit = (k: string, label: string) => `<div><span${x.cls('kit-cd-num')} data-unit="${k}">00</span><span${x.cls('kit-cd-label')}>${label}</span></div>`
      const timer = /^\d{4}-\d{2}-\d{2}/.test(date) ? `<div${x.cls('kit-countdown')} data-kit-countdown="${x.text(date)}">${unit('d', x.say('days'))}${unit('h', x.say('hours'))}${unit('m', x.say('minutes'))}${unit('s', x.say('seconds'))}</div>` : ''
      const top = when || plain(c.eyebrow) ? `<span${x.cls('hero-eyebrow')}>${x.text(when || c.eyebrow)}</span>` : ''
      return photoHero('kit-hero-centered kit-hero-countdown', c, x, `<div${x.cls('hero-copy')}>${top}${h1(c, x)}${lead(c, x, 'hero-lead')}${timer}${actions(c, x, 'hero-actions')}</div>`)
    },
  },
  {
    layout: 'split',
    dark: false,
    doc: `light opener: headline left, one tall photo right with a floating proof card — {${PHOTO_FIELDS},"stats":[{"value","label"}] ×2–3 or "points":["…"] ×3}`,
    render(c, x) {
      const stats = list(c.stats, 3).filter((s) => plain(s?.value))
      const float = stats[0] && plain(c.floatLabel ?? '') !== 'none' ? `<div${x.cls('kit-intro-float')}><strong>${x.text(stats[0].value)}</strong><span>${x.text(stats[0].label)}</span></div>` : ''
      const proof = introProof({ ...c, stats: stats.slice(1) }, x)
      return intro('kit-intro-split', x, `${introCopy(c, x, `${actions(c, x, 'kit-actions')}${proof}`)}<figure${x.cls('kit-intro-media')}>${x.img(x.photo(c.photo), c.title, '', true)}${float}</figure>`)
    },
  },
  {
    layout: 'mosaic',
    dark: false,
    doc: `light opener: headline left, a collage of three photos right — {${PHOTO_FIELDS.replace('"photo"', '"photos":["…"] ×3')},"stats":[{"value","label"}] ×2–3 or "points":["…"] ×3}`,
    render(c, x) {
      const given = list(c.photos, 3)
      const photos = [0, 1, 2].map((n) => x.photo(given[n] ?? (n === 0 ? c.photo : undefined))).filter(Boolean)
      return intro('kit-intro-collage', x, `${introCopy(c, x, `${actions(c, x, 'kit-actions')}${introProof(c, x)}`)}<div${x.cls('kit-intro-mosaic')}>${photos.map((p, n) => x.img(p, n === 0 ? c.title : '', '', n === 0)).join('')}</div>`)
    },
  },
  {
    layout: 'statement',
    dark: false,
    doc: `light opener: one huge centred statement, then a wide photo — {"eyebrow","title","accent","lead","primary":{label,href},"secondary":{label,href},"photo"} — for a waitlist or newsletter give "action":{"fields":[{"label":"Email","name":"email","type":"email"}],"button","href"} instead of the buttons`,
    render(c, x) {
      const act = c.action && typeof c.action === 'object' ? c.action : null
      const capture = act ? x.goForm('kit-intro-capture', act.href, `${fields(c, x, [{ label: t(x.lang, 'email'), name: 'email', type: 'email' }]).replace(/<label/, `<label${x.cls('kit-sr')}`)}<button type="submit"${x.cls('btn btn-primary')}>${x.text(act.button || t(x.lang, 'join'))}</button>`) : ''
      const photo = x.photo(c.photo)
      return intro('kit-intro-statement', x, `${introCopy(c, x, capture || actions(c, x, 'kit-actions'))}${photo ? `<figure${x.cls('kit-intro-wide')}>${x.img(photo, c.title, '', true)}</figure>` : ''}`)
    },
  },
  {
    layout: 'product',
    dark: false,
    doc: `light opener for ONE hero product: photo on a soft stage, price, rating and key points — {"eyebrow","title","accent","lead","photo","price":"£49","rating":"4.9 from 1,200 reviews","points":["…"] ×3–4,"primary":{label,href},"secondary":{label,href}}`,
    render(c, x) {
      const rating = plain(c.rating) ? `<div${x.cls('kit-intro-rating')}>${x.stars(5)}<span>${x.text(c.rating)}</span></div>` : ''
      const price = plain(c.price) ? `<p${x.cls('kit-intro-price')}>${x.text(c.price)}</p>` : ''
      const points = list(c.points, 4).map(plain).filter(Boolean)
      const checks = points.length ? `<ul${x.cls('kit-checks')}>${points.map((p) => `<li>${x.text(p)}</li>`).join('')}</ul>` : ''
      const copy = `<div${x.cls('kit-intro-copy')}>${eyebrow(c, x, 'kit-intro-eyebrow')}${h1(c, x)}${rating}${lead(c, x, 'kit-intro-lead')}${price}${checks}${actions(c, x, 'kit-actions')}</div>`
      return intro('kit-intro-product', x, `${copy}<figure${x.cls('kit-intro-media', 'kit-intro-stage')}>${x.img(x.photo(c.photo), c.title, '', true)}</figure>`)
    },
  },
  {
    layout: 'editorial',
    dark: false,
    doc: `magazine front page: the lead story large, the latest stories listed beside it — {"tag":"category","title":"the lead story headline","lead","photo","primary":{"label":"Read the story","href"},"eyebrow":"Latest","stories":[{"tag","title","href","photo"}] ×3–4}`,
    render(c, x) {
      const stories = list(c.stories, 4).filter((s) => plain(s?.title))
      const leadStory = `<article${x.cls('kit-story-lead')}><figure${x.cls('kit-story-media')}>${x.img(x.photo(c.photo), c.title, '', true)}</figure>${plain(c.tag) ? `<span${x.cls('kit-badge')}>${x.text(c.tag)}</span>` : ''}${h1(c, x)}${lead(c, x, 'kit-intro-lead')}${x.link(c.primary, 'kit-story-link')}</article>`
      const side = stories.length ? `<div${x.cls('kit-story-list')}><p${x.cls('kit-story-list-title')}>${x.text(c.eyebrow || t(x.lang, 'latest'))}</p>${stories.map((s) => `<article${x.cls('kit-story')}><figure>${x.img(x.photo(s.photo), s.title)}</figure><div>${plain(s.tag) ? `<span${x.cls('kit-story-tag')}>${x.text(s.tag)}</span>` : ''}<h3${x.cls('kit-story-title')}>${x.link({ label: s.title, href: s.href }, '')}</h3></div></article>`).join('')}</div>` : ''
      return intro('kit-intro-editorial', x, `${leadStory}${side}`)
    },
  },
  {
    layout: 'page',
    dark: true,
    doc: 'inner page header on a photo — {"eyebrow","title","lead","photo"}',
    render(c, x) {
      return `<section${x.cls('page-hero')} data-kit="page-hero">${x.img(x.photo(c.photo), '', 'hero-bg', true)}<div${x.cls('container')}>${eyebrow(c, x, 'eyebrow')}<h1>${x.text(c.title)}</h1>${plain(c.lead ?? c.text) ? `<p>${x.text(c.lead ?? c.text)}</p>` : ''}</div></section>`
    },
  },
  {
    layout: 'page-plain',
    dark: false,
    doc: 'inner page header on a tinted band — {"eyebrow","title","lead"}',
    render(c, x) {
      return `<section${x.cls('kit-intro', 'kit-intro-page')} data-kit="page-hero"><div${x.cls('container')}>${eyebrow(c, x, 'kit-intro-eyebrow')}<h1>${x.text(c.title)}</h1>${lead(c, x, 'kit-intro-lead')}</div></section>`
    },
  },
]

export const heroByLayout = (layout: string) => HEROES.find((h) => h.layout === layout)

// A light opener keeps the header in the page flow above it (never over it)
const LIGHT_FIRST = [
  ':is(header, .site-header) + :is(main, .site-main) > .kit-intro:first-child',
  ':is(header, .site-header) + :is(main, .site-main) > :first-child > .kit-intro:first-child',
  ':is(header, .site-header) + .kit-intro',
].join(', ')

export const HEROES_CSS = `/* ── Openers ── */
/* Centred photo heroes: centered, search, countdown */
.hero-photo.kit-hero-centered { text-align: center !important; }
.hero-photo.kit-hero-centered:has(.hero-bg)::after { background: linear-gradient(0deg, rgba(10,11,13,.84) 0%, rgba(10,11,13,.56) 55%, rgba(10,11,13,.64) 100%) !important; }
.hero-photo.kit-hero-centered .hero-inner { grid-template-columns: minmax(0, 1fr); justify-items: center; }
.hero-photo.kit-hero-centered .hero-copy { max-width: 900px; margin-inline: auto; }
.hero-photo.kit-hero-centered .hero-copy > * { margin-inline: auto !important; }
.hero-photo.kit-hero-centered .hero-actions { justify-content: center !important; }
.hero-photo.kit-hero-centered .hero-stats { justify-content: center; width: 100%; }
/* Search bar */
.kit-search-wrap { width: 100%; max-width: 920px; }
.hero-photo .kit-search { display: flex; align-items: flex-end; gap: .75rem; padding: .8rem; background: var(--bg); border-radius: calc(var(--radius-lg) + 4px); box-shadow: 0 30px 80px -24px rgba(0,0,0,.6); text-align: left; }
.hero-photo .kit-search .kit-field { flex: 1 1 0; }
.hero-photo .kit-search :is(input, select, option) { color: var(--text) !important; }
.hero-photo .kit-search label { color: var(--muted) !important; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; padding-left: .2rem; }
.hero-photo .kit-search :is(input, select) { border-color: transparent; background: var(--surface); min-height: 52px; }
.hero-photo .kit-search .btn { min-height: 52px; flex-shrink: 0; padding-inline: 1.6rem; }
.kit-chips { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: .5rem; margin-top: 1.1rem; font-size: .9rem; }
.hero-photo .kit-chips > span { color: rgba(255,255,255,.75) !important; margin-right: .25rem; }
.hero-photo .kit-chips a { padding: .4rem .9rem; border-radius: 999px; border: 1px solid rgba(255,255,255,.35); color: #fff !important; text-decoration: none !important; opacity: 1; }
.hero-photo .kit-chips a:hover { background: rgba(255,255,255,.12); }
/* Countdown */
.kit-countdown { display: flex; justify-content: center; gap: clamp(.5rem, 2vw, 1rem); margin: 0 auto 2rem; }
.kit-countdown > div { min-width: clamp(70px, 12vw, 104px); padding: .9rem .5rem; border-radius: var(--radius-lg); background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); }
.hero-photo .kit-cd-num { display: block; font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: clamp(1.8rem, 4vw, 2.8rem); line-height: 1; color: #fff !important; font-variant-numeric: tabular-nums; }
.hero-photo .kit-cd-label { display: block; margin-top: .4rem; font-size: .7rem; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.72) !important; }
.kit-countdown[hidden] { display: none; }
@media (max-width: 720px) { .hero-photo .kit-search { flex-direction: column; align-items: stretch; } }

/* Light openers */
section.kit-intro { position: relative; overflow: hidden; background: var(--bg); color: var(--text); padding: clamp(56px, 8vw, 104px) 0 clamp(56px, 8vw, 96px); text-align: left; }
.kit-intro-inner { width: 100%; max-width: var(--maxw, 1200px); margin: 0 auto; padding-inline: clamp(20px, 5vw, 40px); display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: clamp(2rem, 5vw, 4.5rem); align-items: center; }
.kit-intro-eyebrow { display: inline-flex; align-items: center; gap: .6rem; font-size: .78rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--primary-ink); margin: 0 0 1.2rem; }
.kit-intro-eyebrow::before { content: ''; width: 24px; height: 2px; background: currentColor; }
section.kit-intro h1 { font-size: clamp(2.5rem, 5.6vw, 4.8rem); line-height: var(--heading-leading); margin: 0 0 1.3rem; max-width: 16ch; color: var(--text); text-wrap: balance; }
.kit-intro-lead { font-size: clamp(1.05rem, 1.4vw, 1.22rem); line-height: 1.65; color: var(--muted); max-width: 52ch; margin: 0 0 2rem; }
section.kit-intro .kit-actions .btn { padding: 1rem 1.6rem; font-size: 1rem; }
.kit-intro-proof { display: flex; flex-wrap: wrap; gap: 1.25rem clamp(1.5rem, 4vw, 3rem); margin-top: 2.25rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
.kit-intro-proof strong { display: block; font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: clamp(1.6rem, 2.6vw, 2.1rem); line-height: 1; color: var(--text); }
.kit-intro-proof span { display: block; margin-top: .35rem; font-size: .88rem; color: var(--muted); }
.kit-intro-copy .kit-checks { margin: 0 0 1.75rem; }
.kit-intro-media { position: relative; margin: 0; }
.kit-intro-media > img { width: 100%; aspect-ratio: 4 / 5; max-height: 640px; object-fit: cover; display: block; border-radius: var(--radius-xl) !important; box-shadow: var(--shadow-xl); }
.kit-intro-float { position: absolute; left: clamp(-36px, -3vw, -12px); bottom: clamp(20px, 4vw, 40px); background: var(--bg); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); padding: 1rem 1.3rem; min-width: 180px; }
.kit-intro-float strong { display: block; font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: 1.9rem; line-height: 1; color: var(--primary-ink); }
.kit-intro-float span { display: block; font-size: .86rem; color: var(--muted); margin-top: .35rem; }
.kit-intro-mosaic { display: grid; grid-template-columns: 1.15fr 1fr; grid-template-rows: 1fr 1fr; gap: clamp(.6rem, 1.4vw, 1rem); height: clamp(420px, 46vw, 600px); }
.kit-intro-mosaic > img { width: 100%; height: 100%; min-height: 0; object-fit: cover; display: block; border-radius: var(--radius-lg) !important; }
.kit-intro-mosaic > img:first-child { grid-row: span 2; }
.kit-intro-mosaic > img:only-child { grid-column: span 2; }
.kit-intro-statement .kit-intro-inner { grid-template-columns: minmax(0, 1fr); justify-items: center; text-align: center; }
.kit-intro-statement .kit-intro-copy { max-width: 980px; display: flex; flex-direction: column; align-items: center; }
section.kit-intro-statement h1 { font-size: clamp(2.8rem, 7.4vw, 6.4rem); max-width: 18ch; }
.kit-intro-statement .kit-intro-eyebrow::before { display: none; }
.kit-intro-statement .kit-actions { justify-content: center; }
.kit-intro-capture { display: flex; gap: .6rem; width: min(100%, 520px); }
.kit-intro-capture .kit-field { flex: 1; }
.kit-intro-capture .btn { min-height: 48px; flex-shrink: 0; }
.kit-intro-wide { margin: clamp(2.5rem, 6vw, 4.5rem) 0 0; width: 100%; }
.kit-intro-wide img { width: 100%; aspect-ratio: 21 / 9; object-fit: cover; display: block; border-radius: var(--radius-xl) !important; }
section.kit-intro-product { background: var(--surface); }
.kit-intro-stage { border-radius: var(--radius-xl); background: var(--bg); padding: clamp(1rem, 3vw, 2rem); box-shadow: var(--shadow-lg); }
.kit-intro-stage > img { aspect-ratio: 1; box-shadow: none; border-radius: var(--radius-lg) !important; }
.kit-intro-rating { display: flex; align-items: center; gap: .6rem; margin: -.3rem 0 1.1rem; color: var(--muted); font-size: .92rem; }
.kit-intro-price { font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: clamp(1.8rem, 3vw, 2.4rem); line-height: 1; color: var(--text); margin: 0 0 1.25rem; }
.kit-intro-editorial .kit-intro-inner { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); align-items: start; }
.kit-story-media { margin: 0 0 1.25rem; border-radius: var(--radius-lg); overflow: hidden; aspect-ratio: 16 / 9; background: var(--surface-2); }
.kit-story-media img, .kit-story figure img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; }
section.kit-intro-editorial h1 { font-size: clamp(2.1rem, 4.2vw, 3.4rem); max-width: 22ch; margin-top: .9rem; }
.kit-story-lead .kit-intro-lead { margin-bottom: 1.25rem; }
.kit-story-link { font-weight: 700; color: var(--primary-ink); text-decoration: none; }
.kit-story-link::after { content: ' \\2192'; }
.kit-story-list { border-left: 1px solid var(--border); padding-left: clamp(1.5rem, 3vw, 2.5rem); }
.kit-story-list-title { font-size: .78rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin: 0 0 .5rem; }
.kit-story { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 1rem; align-items: center; padding: 1.1rem 0; border-bottom: 1px solid var(--border); }
.kit-story:last-child { border-bottom: 0; }
.kit-story figure { margin: 0; border-radius: var(--radius); overflow: hidden; aspect-ratio: 1; background: var(--surface-2); }
.kit-story-tag { font-size: .72rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--primary-ink); }
.kit-story-title { font-size: 1.05rem; line-height: 1.35; margin: .3rem 0 0; }
.kit-story-title a { color: var(--text); text-decoration: none; }
.kit-story-title a:hover { color: var(--primary-ink); }
section.kit-intro-page { background: var(--surface); border-bottom: 1px solid var(--border); padding: clamp(48px, 7vw, 88px) 0 clamp(40px, 6vw, 72px); }
.kit-intro-page > .container { width: 100%; max-width: var(--maxw, 1200px); margin-inline: auto; padding-inline: clamp(20px, 5vw, 40px); }
section.kit-intro-page h1 { font-size: clamp(2.2rem, 5vw, 3.6rem); max-width: 20ch; }
.kit-intro-page .kit-intro-lead { margin: 0; }
@media (max-width: 900px) {
  .kit-intro-inner, .kit-intro-editorial .kit-intro-inner { grid-template-columns: minmax(0, 1fr); }
  .kit-intro-media > img { aspect-ratio: 4 / 3; }
  .kit-intro-float { left: 12px; }
  .kit-intro-mosaic { height: clamp(300px, 70vw, 460px); }
  .kit-story-list { border-left: 0; padding-left: 0; border-top: 1px solid var(--border); padding-top: 1.25rem; }
}
@media (max-width: 560px) {
  section.kit-intro .kit-actions .btn { flex: 1 1 100%; }
  .kit-intro-capture { flex-direction: column; }
}
body:has(${LIGHT_FIRST}) :is(body > header, .site-header) { position: sticky !important; top: 0; }
`
