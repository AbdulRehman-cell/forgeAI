// The events engine: a calendar that retires past events by itself, a full event
// page (with search-engine event data and add-to-calendar), a multi-day schedule
// and an RSVP form that lands in the owner's Leads inbox.

import { Content, Ctx, SectionDef, esc, list, plain } from '../markup'
import { jsonLd, listControls, proseBlocks, shareButtons } from './blog'
import { t } from '../strings'

interface When { date: string; endDate: string; start: string; end: string }

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/

/** "19:00", "7pm", "7:30 PM" → "19:00"; anything else → '' */
function clock(v: unknown): string {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])?\.?m?\.?/i.exec(plain(v))
  if (!m) return ''
  let h = Number(m[1])
  if (m[3]?.toLowerCase() === 'p' && h < 12) h += 12
  if (m[3]?.toLowerCase() === 'a' && h === 12) h = 0
  return h < 24 ? `${String(h).padStart(2, '0')}:${m[2] ?? '00'}` : ''
}

/** The model's dates, if they are real dates. Never invented: a bad date stays plain text. */
export function whenOf(e: Content): When | null {
  const m = ISO.exec(plain(e.date))
  if (!m || Number.isNaN(Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`))) return null
  const date = `${m[1]}-${m[2]}-${m[3]}`
  const endDate = ISO.exec(plain(e.endDate ?? e.end_date))?.[0].slice(0, 10) ?? date
  return { date, endDate: endDate < date ? date : endDate, start: clock(e.time ?? e.start) || (m[4] ? `${m[4]}:${m[5]}` : ''), end: clock(e.endTime ?? e.end_time ?? e.end) }
}

// Day first for English too: "4 December", as Pakistan and the UK write it
const fmt = (date: string, lang: string, o: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : lang, { timeZone: 'UTC', ...o })

/** "4 December 2026" or "4 – 6 December 2026" in the site's language */
export function dateWords(w: When, lang: string): string {
  const full = fmt(w.date, lang, { day: 'numeric', month: 'long', year: 'numeric' })
  return w.endDate === w.date ? full : `${fmt(w.date, lang, { day: 'numeric', month: 'short' })} – ${fmt(w.endDate, lang, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

const stamp = (date: string, time: string) => `${date.replace(/-/g, '')}${time ? `T${time.replace(':', '')}00` : ''}`
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
const twoHoursAfter = (time: string) => `${String(Math.min(23, Number(time.slice(0, 2)) + 2)).padStart(2, '0')}${time.slice(2)}`

function calendarRange(w: When): [string, string] {
  if (!w.start) return [stamp(w.date, ''), stamp(nextDay(w.endDate), '')]
  return [stamp(w.date, w.start), stamp(w.endDate, w.end || twoHoursAfter(w.start))]
}

/** Times stay as written, with no time zone: the event happens at that hour where it happens */
export function googleCalendarUrl(title: string, w: When, place: string, text: string): string {
  const [from, to] = calendarRange(w)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${from}/${to}&location=${encodeURIComponent(place)}&details=${encodeURIComponent(text.slice(0, 500))}`
}

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\s+/g, ' ')

export function icsHref(title: string, w: When, place: string, text: string): string {
  const [from, to] = calendarRange(w)
  const value = w.start ? '' : ';VALUE=DATE'
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ForgeAI//Site//EN', 'BEGIN:VEVENT', `UID:${from}-${encodeURIComponent(title).slice(0, 40)}@forgeai`, `DTSTAMP:${stamp(w.date, '00:00')}Z`, `DTSTART${value}:${from}`, `DTEND${value}:${to}`, `SUMMARY:${icsText(title)}`, place && `LOCATION:${icsText(place)}`, text && `DESCRIPTION:${icsText(text.slice(0, 500))}`, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n')
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
}

const filename = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'event'}.ics`

function placeOf(e: Content): string {
  return [plain(e.venue), plain(e.city)].filter(Boolean).join(', ')
}

function eventMarkup(e: Content, x: Ctx, v: string): string {
  const title = plain(e.title ?? e.name)
  const w = whenOf(e)
  const place = placeOf(e)
  const cat = plain(e.category)
  const sold = e.soldOut === true || e.soldOut === 'true'
  const src = v === 'cards' ? x.photo(e.photo) : ''
  const tile = w
    ? `<div${x.cls('kit-event-tile')}><strong>${esc(fmt(w.date, x.lang, { day: 'numeric' }))}</strong><span>${esc(fmt(w.date, x.lang, { month: 'short' }))}</span></div>`
    : ''
  const whenLine = [w ? dateWords(w, x.lang) : plain(e.date), plain(e.time) || w?.start].filter(Boolean).join(' · ')
  const href = plain(e.href ?? e.url)
  const page = x.localPage(href)
  const heading = href ? x.anchor(href, '', esc(title)) : esc(title)
  const ticket = sold
    ? `<span${x.cls('kit-badge', 'kit-event-sold')}>${x.say('soldOut')}</span>`
    : (e.ticket ? x.link(e.ticket, 'btn btn-primary') : '')
  const addCal = w ? `<a${x.cls('kit-event-add')} href="${esc(icsHref(title, w, place, plain(e.text)))}" download="${esc(filename(title))}">${x.say('addCalendar')}</a>` : ''
  const price = plain(e.price)
  const end = w ? ` data-end="${w.endDate}"` : ''
  const find = `${title} ${cat} ${place} ${plain(e.text)}`
  return `<article${x.cls('kit-event')} data-kit-item="1" data-cat="${esc(cat)}" data-find="${esc(find)}"${end}${page ? ` data-kit-event-page="${esc(page)}"` : ''}>${src ? `<div${x.cls('kit-event-media')}>${x.img(src, title)}${tile}</div>` : tile}<div${x.cls('kit-event-body')}>${cat ? `<span${x.cls('kit-post-cat')}>${esc(cat)}</span>` : ''}<h3>${heading}</h3><p${x.cls('kit-event-when')}>${esc(whenLine)}${place ? `<span>${esc(place)}</span>` : ''}</p>${plain(e.text) ? `<p>${x.text(e.text)}</p>` : ''}</div><div${x.cls('kit-event-side')}>${price ? `<span${x.cls('kit-event-price')}>${esc(price)}</span>` : ''}${ticket}${addCal}</div></article>`
}

export const eventsList: SectionDef = {
  type: 'events-list',
  label: 'Events calendar — upcoming events in date order with filters and add-to-calendar; past events retire by themselves',
  variants: { agenda: 'list', cards: 'grid' },
  doc: '{"eyebrow","title","intro","link":{label,href},"events":[{"title","date":"2026-12-04" (always YYYY-MM-DD),"endDate":"2026-12-06" (several days only),"time":"19:30","venue","city","category","price","text":"one or two lines","photo","href":"its own page, if it has one","ticket":{label,href},"soldOut":false}] ×3–12} — every date after TODAY; ForgeAI sorts them, formats the dates and hides an event once its day has passed',
  render(c, v, x, tone) {
    const all = list(c.events ?? c.items, 24).filter((e) => plain(e?.title ?? e?.name))
    if (!all.length) throw new Error('a calendar with no events')
    // Dated events in order; anything without a usable date stays after them
    const sorted = [...all].sort((a, b) => (whenOf(a)?.date ?? '9999').localeCompare(whenOf(b)?.date ?? '9999'))
    const cats = [...new Set(all.map((e) => plain(e.category)).filter(Boolean))].slice(0, 8)
    const controls = all.length >= 4 ? listControls(x, cats, t(x.lang, 'searchEvents'), all.length >= 8) : ''
    const pastToggle = `<div${x.cls('kit-list-more')}><button type="button"${x.cls('kit-events-past')} data-kit-do="past" data-kit-past="${x.say('showPast')}" data-kit-next="${x.say('showUpcoming')}" hidden>${x.say('showPast')}</button></div>`
    const action = c.link ? x.link(c.link, 'btn btn-secondary') : ''
    return x.section('events-list', v, tone, c, `<div${x.cls('kit-events-wrap')} data-kit-engine="list">${controls}<div${x.cls('kit-events')}>${sorted.map((e) => eventMarkup(e, x, v)).join('')}</div><p${x.cls('kit-list-none')} data-kit-none="1" hidden>${x.say('noEvents')}</p>${pastToggle}</div>`, { action })
  },
  css: `/* Events calendar */
.kit-events { display: grid; gap: .85rem; }
.kit-event { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: clamp(1rem, 3vw, 1.75rem); padding: clamp(1rem, 2.4vw, 1.5rem); background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); border-radius: var(--radius-lg); }
.kit-event-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 76px; height: 76px; border-radius: var(--radius); background: color-mix(in srgb, var(--primary) 11%, var(--bg)); color: var(--primary-ink); line-height: 1.1; flex-shrink: 0; }
.kit-event-tile strong { font-family: var(--font-heading); font-size: 1.7rem; font-weight: var(--heading-weight); }
.kit-event-tile span { font-size: .74rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.kit-event-body { min-width: 0; }
.kit-event-body .kit-post-cat { display: block; margin-bottom: .25rem; }
.kit-event h3 { font-size: 1.2rem; line-height: 1.28; margin: 0 0 .3rem; }
.kit-event h3 a { color: inherit; text-decoration: none; }
.kit-event h3 a:hover { color: var(--primary-ink); }
.kit-event-when { font-size: .92rem; font-weight: 600; color: var(--text); margin: 0 0 .35rem; display: flex; flex-wrap: wrap; gap: 0 .9rem; }
.kit-event-when span { font-weight: 500; color: var(--muted); }
.kit-event-body > p:not(.kit-event-when) { color: var(--muted); font-size: .94rem; line-height: 1.55; margin: 0; }
.kit-event-side { display: flex; flex-direction: column; align-items: flex-end; gap: .5rem; text-align: end; }
.kit-event-price { font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: 1.1rem; color: var(--text); white-space: nowrap; }
.kit-event-side .btn { padding: .6rem 1.05rem; font-size: .9rem; white-space: nowrap; }
.kit-event-sold { background: var(--surface-2); color: var(--muted); }
.kit-event-add { font-size: .82rem; font-weight: 600; color: var(--primary-ink); white-space: nowrap; }
.kit-events-past { min-height: 42px; padding: .4rem .9rem; border: 0; background: none; color: var(--muted); font: inherit; font-size: .92rem; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.kit-v-cards .kit-events { grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: clamp(1rem, 2vw, 1.5rem); }
.kit-v-cards .kit-event { display: flex; flex-direction: column; align-items: stretch; gap: 0; padding: 0; overflow: hidden; }
.kit-event-media { position: relative; aspect-ratio: 16 / 10; background: var(--surface-2); }
.kit-event-media img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; }
.kit-event-media .kit-event-tile { position: absolute; top: .8rem; inset-inline-start: .8rem; width: 62px; height: 62px; background: var(--bg); box-shadow: var(--shadow); }
.kit-event-media .kit-event-tile strong { font-size: 1.35rem; }
.kit-v-cards .kit-event-body { flex: 1; padding: 1.15rem 1.25rem .5rem; }
.kit-v-cards .kit-event > .kit-event-tile { margin: 1.15rem 1.25rem 0; }
.kit-v-cards .kit-event-side { flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; padding: .5rem 1.25rem 1.25rem; text-align: start; }
@media (max-width: 720px) {
  .kit-event { grid-template-columns: auto minmax(0, 1fr); align-items: start; }
  .kit-event-tile { width: 62px; height: 62px; }
  .kit-event-tile strong { font-size: 1.35rem; }
  .kit-event-side { grid-column: 1 / -1; flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; text-align: start; }
}
`,
}

export const eventDetail: SectionDef = {
  type: 'event-detail',
  label: 'Event page — one event in full: date, time, place, price, map, tickets, add-to-calendar and sharing, with event data for Google',
  variants: { split: 'split', poster: 'media' },
  doc: '{"category","title","lead":"one or two sentences","date":"2026-12-04" (YYYY-MM-DD),"endDate","time":"19:30","endTime":"22:00","venue","city","address":"street, city — shows a map","price","photo","ticket":{label,href},"soldOut":false,"facts":[{"icon","label":"Dress code","value":"…"}] ×0–3,"blocks":[{"p":"…"},{"h2":"…"},{"list":["…"]},{"photo":"3","caption":"…"}] ×3–12} — it OPENS its page, with NO <forge-hero> before it',
  ownTone: ['poster'],
  leaves: (v) => (v === 'poster' ? 'alt' : 'bg'),
  render(c, v, x, tone) {
    const title = plain(c.title ?? c.name)
    if (!title) throw new Error('an event with no title')
    const w = whenOf(c)
    const place = placeOf(c)
    const address = plain(c.address)
    const sold = c.soldOut === true || c.soldOut === 'true'
    const src = x.photo(c.photo)
    const timeWords = [plain(c.time) || w?.start, plain(c.endTime) || (w?.end ?? '')].filter(Boolean).join(' – ')
    const facts = [
      { icon: 'calendar', label: x.say('date'), value: w ? esc(dateWords(w, x.lang)) : x.text(c.date) },
      { icon: 'clock', label: x.say('time'), value: esc(timeWords) },
      { icon: 'map-pin', label: x.say('venue'), value: esc(place || address) },
      { icon: 'ticket', label: x.say('price'), value: x.text(c.price) },
      ...list(c.facts, 3).filter((f) => plain(f?.value)).map((f) => ({ icon: f.icon ?? 'info', label: x.text(f.label), value: x.text(f.value) })),
    ].filter((f) => f.value)
    const factList = `<ul${x.cls('kit-contact-list', 'kit-eventd-facts')}>${facts.map((f) => `<li>${x.icon(f.icon)}<div><strong>${f.label}</strong><span>${f.value}</span></div></li>`).join('')}</ul>`
    const ticket = sold ? `<span${x.cls('kit-badge', 'kit-event-sold')}>${x.say('soldOut')}</span>` : (c.ticket ? x.link(c.ticket, 'btn btn-primary') : '')
    const add = w
      ? `<a${x.cls('btn btn-secondary')} href="${esc(googleCalendarUrl(title, w, address || place, plain(c.lead)))}" target="_blank" rel="noopener">${x.say('googleCalendar')}</a><a${x.cls('btn btn-secondary')} href="${esc(icsHref(title, w, address || place, plain(c.lead)))}" download="${esc(filename(title))}">${x.say('appleCalendar')}</a>`
      : ''
    const until = w ? ` data-kit-until="${w.endDate}"` : ''
    const ended = w ? `<p${x.cls('kit-eventd-ended')} data-kit-ended="${w.endDate}" hidden>${x.say('eventEnded')}</p>` : ''
    const actions = `${ended}<div${x.cls('kit-actions', 'kit-eventd-actions')}${until}>${ticket}${add}</div>`
    const words = `${plain(c.category) ? `<span${x.cls('eyebrow')}>${x.text(c.category)}</span>` : ''}<h1>${esc(title)}</h1>${plain(c.lead ?? c.intro) ? `<p${x.cls('kit-article-lead')}>${x.text(c.lead ?? c.intro)}</p>` : ''}`
    const { html } = proseBlocks(c, x)
    const map = address ? `<div${x.cls('kit-map')}><iframe src="https://maps.google.com/maps?q=${encodeURIComponent(address)}&amp;output=embed" title="${x.text(`Map of ${address}`)}" loading="lazy"></iframe></div>` : ''
    const more = html || map
      ? `<div${x.cls('kit-eventd-more')}><div${x.cls('kit-prose')}>${html}${shareButtons(x)}</div>${map ? `<div>${map}</div>` : ''}</div>`
      : `<div${x.cls('kit-eventd-more')}>${shareButtons(x)}</div>`
    const ld = jsonLd(x, {
      '@context': 'https://schema.org', '@type': 'Event', name: title, description: plain(c.lead ?? c.intro) || undefined,
      startDate: w ? (w.start ? `${w.date}T${w.start}` : w.date) : undefined,
      endDate: w ? (w.end ? `${w.endDate}T${w.end}` : w.endDate) : undefined,
      image: /^https?:/.test(src) ? src : undefined,
      location: place || address ? { '@type': 'Place', name: plain(c.venue) || place, address: address || place } : undefined,
    })
    const engine = ' data-kit-engine="event"'
    if (v === 'poster') {
      return `<section${x.cls('kit-section', 'kit-sec-event-detail', 'kit-v-poster')} data-kit="event-detail"${engine}><div${x.cls('kit-eventd-poster')}>${src ? x.img(src, title, undefined, true) : ''}<div${x.cls('container')}>${words}${actions}</div></div><div${x.cls('container')}><div${x.cls('kit-eventd-card')}>${factList}</div>${more}</div>${ld}</section>`
    }
    return `<section${x.cls('kit-section', 'kit-sec-event-detail', 'kit-v-split', tone)} data-kit="event-detail"${engine}><div${x.cls('container')}><div${x.cls('kit-eventd-top')}><div>${words}${factList}${actions}</div>${src ? `<div${x.cls('kit-eventd-photo')}>${x.img(src, title, undefined, true)}</div>` : ''}</div>${more}</div>${ld}</section>`
  },
  css: `/* Event page */
.kit-sec-event-detail { padding-block: clamp(36px, 6vw, 72px) clamp(56px, 8vw, 96px); }
.kit-sec-event-detail h1 { font-size: clamp(2rem, 1.3rem + 3vw, 3.4rem); line-height: 1.1; margin: .35rem 0 1rem; color: var(--text); }
.kit-eventd-top { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr); gap: clamp(2rem, 5vw, 4rem); align-items: start; }
.kit-eventd-photo { border-radius: var(--radius-xl); overflow: hidden; aspect-ratio: 4 / 3; background: var(--surface-2); }
.kit-eventd-photo img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; }
.kit-eventd-actions { margin-top: 1.5rem; }
.kit-eventd-ended { margin: 1.25rem 0 0; padding: .7rem 1rem; border-radius: var(--radius); background: var(--surface-2); font-weight: 600; color: var(--text); }
.kit-eventd-more { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: clamp(2rem, 5vw, 4rem); align-items: start; margin-top: clamp(2.5rem, 5vw, 4rem); }
.kit-eventd-more .kit-prose > h2:first-child { margin-top: 0; }
.kit-eventd-more .kit-share { margin-top: 1.5rem; }
.kit-eventd-more .kit-map { margin-top: 0; }
.kit-v-poster.kit-sec-event-detail { padding-block: 0 clamp(56px, 8vw, 96px); }
.kit-eventd-poster { position: relative; isolation: isolate; background: var(--ink); padding-block: clamp(96px, 16vw, 190px) clamp(40px, 6vw, 72px); }
.kit-eventd-poster > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; border-radius: 0 !important; }
.kit-eventd-poster::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(0deg, rgba(10,11,13,.9) 0%, rgba(10,11,13,.5) 55%, rgba(10,11,13,.25) 100%); }
.kit-eventd-poster > .container { width: 100%; max-width: var(--maxw, 1200px); margin-inline: auto; padding-inline: clamp(20px, 5vw, 40px); }
.kit-eventd-poster h1:not(#_) { color: #fff; max-width: 18ch; }
.kit-eventd-poster .kit-article-lead:not(#_) { color: rgba(255,255,255,.84); max-width: 60ch; }
.kit-eventd-poster .eyebrow:not(#_) { color: var(--accent-on-dark); }
.kit-eventd-poster .btn-secondary:not(#_) { background: transparent !important; color: #fff !important; border-color: rgba(255,255,255,.5) !important; }
.kit-eventd-card { margin-top: clamp(-40px, -3vw, -24px); position: relative; padding: clamp(1.25rem, 3vw, 2rem); background: var(--bg); border: 1px solid var(--border); box-shadow: var(--shadow); border-radius: var(--radius-lg); }
.kit-eventd-card .kit-eventd-facts { margin: 0; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); }
.kit-eventd-facts li strong { font-size: .72rem; }
.kit-eventd-facts li span:not(.kit-icon) { font-size: .98rem !important; }
@media (max-width: 860px) { .kit-eventd-top { grid-template-columns: 1fr; } .kit-eventd-photo { order: -1; aspect-ratio: 16 / 10; } }
`,
}

export const eventSchedule: SectionDef = {
  type: 'event-schedule',
  label: 'Programme — a multi-day or multi-track schedule; several days get day tabs',
  variants: { tabs: 'list', stacked: 'list' },
  doc: '{"eyebrow","title","intro","days":[{"label":"Day 1 · Fri 4 Dec","slots":[{"time":"09:30","title":"…","speaker":"…","room":"Main hall","track":"Design","text":"one line"}] ×3–10}] ×1–4} — one day is fine: leave out "label"',
  render(c, v, x, tone) {
    let days = list(c.days, 5).filter((d) => list(d?.slots, 16).length)
    if (!days.length && list(c.slots ?? c.items, 16).length) days = [{ slots: c.slots ?? c.items }]
    if (!days.length) throw new Error('a schedule with no sessions')
    const tabs = v === 'tabs' && days.length > 1
    const panel = (d: Content, i: number) => {
      const rows = list(d.slots, 16).filter((s) => plain(s?.title)).map((s) => `<li${x.cls('kit-slot')}><span${x.cls('kit-slot-time')}>${x.text(s.time)}</span><div${x.cls('kit-slot-body')}><h4>${x.text(s.title)}</h4>${[plain(s.speaker), plain(s.room)].some(Boolean) ? `<p${x.cls('kit-slot-who')}>${[plain(s.speaker), plain(s.room)].filter(Boolean).map(esc).join(' · ')}</p>` : ''}${plain(s.text) ? `<p>${x.text(s.text)}</p>` : ''}</div>${plain(s.track) ? `<span${x.cls('kit-slot-track')}>${x.text(s.track)}</span>` : ''}</li>`).join('')
      return `<div${x.cls('kit-day')} data-kit-panel="${i}"${tabs && i ? ' hidden' : ''}>${!tabs && plain(d.label) ? `<h3${x.cls('kit-day-title')}>${x.text(d.label)}</h3>` : ''}<ol${x.cls('kit-slots')}>${rows}</ol></div>`
    }
    const bar = tabs ? `<div${x.cls('kit-day-tabs')} role="tablist">${days.map((d, i) => `<button type="button"${x.cls('kit-chip')} role="tab" data-kit-do="tab" data-kit-tab="${i}" aria-pressed="${i ? 'false' : 'true'}" aria-selected="${i ? 'false' : 'true'}">${plain(d.label) ? x.text(d.label) : i + 1}</button>`).join('')}</div>` : ''
    return x.section('event-schedule', v, tone, c, `<div${x.cls('kit-schedule')}${tabs ? ' data-kit-engine="tabs"' : ''}>${bar}${days.map(panel).join('')}</div>`)
  },
  css: `/* Programme */
.kit-schedule { max-width: 920px; margin: 0 auto; }
.kit-day-tabs { display: flex; flex-wrap: wrap; justify-content: center; gap: .45rem; margin: 0 0 1.75rem; }
.kit-day + .kit-day { margin-top: 2.5rem; }
.kit-day-title { font-size: 1.25rem; margin: 0 0 .5rem; padding-bottom: .6rem; border-bottom: 2px solid var(--primary); display: inline-block; }
.kit-slots { list-style: none; margin: 0; padding: 0; }
.kit-slot { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; gap: .35rem clamp(1rem, 3vw, 1.75rem); align-items: start; padding: 1.15rem 0; border-bottom: 1px solid var(--border); }
.kit-slot-time { font-family: var(--font-heading); font-weight: var(--heading-weight); color: var(--primary-ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.kit-slot-body { min-width: 0; }
.kit-slot h4 { font-size: 1.08rem; line-height: 1.32; margin: 0 0 .2rem; }
.kit-slot-who { font-size: .9rem; font-weight: 600; color: var(--text); margin: 0 0 .2rem; }
.kit-slot-body > p:not(.kit-slot-who) { font-size: .94rem; line-height: 1.55; color: var(--muted); margin: 0; }
.kit-slot-track { padding: .2rem .7rem; border-radius: 999px; background: color-mix(in srgb, var(--primary) 11%, var(--bg)); color: var(--primary-ink); font-size: .76rem; font-weight: 700; white-space: nowrap; }
@media (max-width: 600px) {
  .kit-slot { grid-template-columns: minmax(0, 1fr); }
  .kit-slot-track { justify-self: start; }
}
`,
}

export const rsvp: SectionDef = {
  type: 'rsvp',
  label: 'RSVP — register for an event or reserve seats; each reply lands in the owner\'s Leads inbox',
  variants: { card: 'band', split: 'split' },
  doc: '{"eyebrow","title","text","events":["…"] (a choice of events, when there are several),"guests":true,"fields":[{"label","name","type","options":["…"]}] ×0–2 (extra questions only — name, email and phone are always asked),"button":"Reserve my seat","note":"one line, e.g. free entry, doors at 7","photo" (split only)} — a page linking here with ?event=… pre-selects that event',
  render(c, v, x, tone) {
    const events = list(c.events, 12).map(plain).filter(Boolean)
    const fields: Content[] = [
      { label: t(x.lang, 'name'), name: 'name', required: true },
      { label: t(x.lang, 'email'), name: 'email', type: 'email' },
      { label: t(x.lang, 'phone'), name: 'phone', type: 'tel' },
      ...(c.guests === false || c.guests === 'false' ? [] : [{ label: t(x.lang, 'guests'), name: 'guests', options: ['1', '2', '3', '4', '5', '6+'] }]),
      ...(events.length > 1 ? [{ label: t(x.lang, 'whichEvent'), name: 'event', options: events }] : []),
      ...list(c.fields, 2).filter((f) => f && typeof f === 'object'),
    ]
    const rendered = fields.map((f, i) => x.field(f, i))
    const rows: string[] = []
    for (let i = 0; i < rendered.length; i += 2) rows.push(rendered[i + 1] ? `<div${x.cls('kit-form-row')}>${rendered[i]}${rendered[i + 1]}</div>` : rendered[i])
    const hidden = events.length === 1 ? `<input type="hidden" name="event" value="${esc(events[0])}"${x.jsx ? ' />' : '>'}` : ''
    const form = `<form id="kit-rsvp"${x.cls('kit-form', 'kit-rsvp-form')} data-kit-engine="post" data-kit-post="1" data-kit-form-title="${esc(plain(c.title) || 'RSVP')}">${hidden}${rows.join('')}<button type="submit"${x.cls('btn btn-primary')}>${plain(c.button) ? x.text(c.button) : x.say('reserve')}</button><p${x.cls('kit-rsvp-error')} data-kit-error="1" role="alert" hidden></p></form><p${x.cls('kit-thanks')} data-kit-thanks="1" role="status" hidden></p>`
    const note = plain(c.note) ? `<p${x.cls('kit-rsvp-note')}>${x.text(c.note)}</p>` : ''
    if (v === 'split') {
      const src = x.photo(c.photo)
      return x.section('rsvp', v, tone, c, `<div${x.cls('kit-rsvp-split')}><div>${x.head(c)}${note}${src ? x.img(src, c.title, 'kit-quiz-cover') : ''}</div><div>${form}</div></div>`, { noHead: true })
    }
    return x.section('rsvp', v, tone, c, `<div${x.cls('kit-rsvp')}>${form}${note}</div>`)
  },
  css: `/* RSVP */
.kit-rsvp { max-width: 680px; margin: 0 auto; }
#kit-rsvp { scroll-margin-top: 104px; }
.kit-rsvp-note { text-align: center; font-size: .92rem; color: var(--muted); margin: 1rem 0 0; }
.kit-rsvp-error { margin: 0; color: #b91c1c; font-size: .92rem; font-weight: 600; }
.kit-dark .kit-rsvp-error { color: #fecaca; }
.kit-rsvp-split { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: clamp(2rem, 5vw, 4rem); align-items: start; }
.kit-rsvp-split .kit-head { text-align: start; margin: 0 0 1.25rem; }
.kit-rsvp-split .kit-head > * { margin-inline: 0; }
.kit-rsvp-split .kit-rsvp-note { text-align: start; margin: 0 0 1.5rem; }
@media (max-width: 860px) { .kit-rsvp-split { grid-template-columns: 1fr; } .kit-rsvp-split .kit-quiz-cover { display: none; } }
`,
}

export const EVENT_SECTIONS = [eventsList, eventDetail, eventSchedule, rsvp]
