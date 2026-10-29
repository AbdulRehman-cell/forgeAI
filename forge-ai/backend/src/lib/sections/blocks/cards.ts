import { Content, Ctx, SectionDef, list, plain } from '../markup'

/** One listing card — also the reference React writers copy for database rows */
export function cardMarkup(i: Content, x: Ctx): string {
  const photo = i.photo ? x.photo(i.photo) : ''
  const badge = plain(i.badge) ? `<span${x.cls('kit-badge')}>${x.text(i.badge)}</span>` : ''
  const meta = list(i.meta, 3).map(plain).filter(Boolean)
  const price = plain(i.price)
  const button = x.link(i.button, 'btn btn-secondary')
  const foot = price || button ? `<div${x.cls('kit-card-foot')}>${price ? `<span${x.cls('kit-price')}>${x.text(price)}</span>` : '<span></span>'}${button}</div>` : ''
  return `<article${x.cls('kit-card')}>${photo ? `<div${x.cls('kit-card-media')}>${x.img(photo, i.title)}${badge}</div>` : ''}<div${x.cls('kit-card-body')}>${photo ? '' : badge}${meta.length ? `<p${x.cls('kit-card-meta')}>${meta.map((m) => `<span>${x.text(m)}</span>`).join('')}</p>` : ''}<h3>${x.text(i.title)}</h3>${plain(i.text) ? `<p>${x.text(i.text)}</p>` : ''}${foot}</div></article>`
}

export const cards: SectionDef = {
  type: 'cards',
  label: 'Cards — listings: jobs, products, rooms, dishes, services, people, posts',
  variants: { grid: 'grid', list: 'list', overlay: 'grid' },
  doc: '{"eyebrow","title","intro","link":{label,href},"items":[{"photo","badge","meta":["…"] ×0–3,"title","text","price","button":{label,href}}] ×3–6} — leave out what a listing does not have; "link" is the optional "View all" next to the heading',
  render(c, v, x, tone) {
    const items = list(c.items, 9).filter((i) => plain(i?.title))
    const action = c.link ? x.link(c.link, 'btn btn-secondary') : ''
    return x.section('cards', v, tone, c, `<div${x.cls('kit-cards')}>${items.map((i) => cardMarkup(i, x)).join('')}</div>`, { action })
  },
  css: `/* Cards */
.kit-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: clamp(1rem, 2vw, 1.5rem); }
.kit-card { display: flex; flex-direction: column; background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); border-radius: var(--radius-lg); overflow: hidden; transition: transform .2s ease, box-shadow .2s ease; }
.kit-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg); }
.kit-card-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; margin: 0; background: var(--surface-2); }
.kit-card-media img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; transition: transform .45s ease; }
.kit-card:hover .kit-card-media img { transform: scale(1.04); }
.kit-card-media .kit-badge { position: absolute; top: .85rem; left: .85rem; }
.kit-card-body > .kit-badge { align-self: flex-start; margin-bottom: .8rem; }
.kit-card-body { display: flex; flex-direction: column; flex: 1; padding: clamp(1.15rem, 2vw, 1.5rem); }
.kit-card-meta { display: flex; flex-wrap: wrap; gap: .25rem 1rem; font-size: .82rem; color: var(--muted); margin: 0 0 .45rem; }
.kit-card-body h3 { font-size: 1.15rem; margin: 0 0 .5rem; }
.kit-card-body > p:not(.kit-card-meta) { color: var(--muted); font-size: .95rem; line-height: 1.55; margin: 0 0 1.1rem; }
.kit-card-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.kit-price { font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: 1.25rem; color: var(--text); }
.kit-card-foot :is(.btn, .btn-primary, .btn-secondary, button) { padding: .6rem 1rem; font-size: .88rem; }
.kit-v-list .kit-cards { grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); }
.kit-v-list .kit-card { flex-direction: row; }
.kit-v-list .kit-card-media { flex: 0 0 38%; aspect-ratio: auto; min-height: 210px; }
.kit-v-overlay .kit-card { position: relative; isolation: isolate; min-height: 380px; justify-content: flex-end; border: 0; background: var(--ink); }
.kit-v-overlay .kit-card-media { position: absolute; inset: 0; aspect-ratio: auto; z-index: -2; }
.kit-v-overlay .kit-card::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(0deg, rgba(10,11,13,.92) 0%, rgba(10,11,13,.45) 45%, rgba(10,11,13,0) 75%); }
.kit-v-overlay .kit-card-body { flex: 0 0 auto; }
.kit-v-overlay .kit-card-body h3 { color: #fff !important; font-size: 1.3rem; }
.kit-v-overlay .kit-card-body > p:not(.kit-card-meta) { color: rgba(255,255,255,.82) !important; }
.kit-v-overlay .kit-card-meta { color: rgba(255,255,255,.72); }
.kit-v-overlay .kit-card-foot { border-top-color: rgba(255,255,255,.18); }
.kit-v-overlay .kit-price { color: #fff; }
.kit-v-overlay .kit-card-foot .btn-secondary:not(#_) { background: transparent !important; color: #fff !important; border-color: rgba(255,255,255,.5) !important; }
@media (max-width: 600px) {
  .kit-v-list .kit-card { flex-direction: column; }
  .kit-v-list .kit-card-media { flex-basis: auto; aspect-ratio: 16 / 10; min-height: 0; }
}
`,
}
