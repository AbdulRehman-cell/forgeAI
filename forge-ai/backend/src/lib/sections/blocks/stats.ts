import { SectionDef, list, plain } from '../markup'

export const stats: SectionDef = {
  type: 'stats',
  label: 'Stats — the numbers that prove it (they count up on scroll)',
  variants: { band: 'band', inline: 'list', photo: 'split' },
  doc: '{"eyebrow","title","intro","photo","items":[{"value":"500+","label"}] ×3–4} — values are short numbers; photo is used by the photo variant',
  ownTone: ['band'],
  render(c, v, x, tone) {
    const items = list(c.items, 4).filter((i) => plain(i?.value))
    const grid = `<div${x.cls('kit-stats-grid')}>${items.map((i) => `<div${x.cls('kit-stat')}><span${x.cls('kit-stat-value')}>${x.text(i.value)}</span><span${x.cls('kit-stat-label')}>${x.text(i.label)}</span></div>`).join('')}</div>`
    if (v === 'band') {
      return `<section${x.cls('kit-stats', 'kit-sec-stats', 'kit-v-band')} data-kit="stats"><div${x.cls('container')}>${x.head(c)}${grid}</div></section>`
    }
    if (v === 'photo') {
      const body = `<div${x.cls('kit-stats-split')}><figure${x.cls('kit-stats-media')}>${x.img(x.photo(c.photo), c.title)}</figure><div>${x.head(c)}${grid}</div></div>`
      return x.section('stats', v, tone, c, body, { noHead: true })
    }
    return x.section('stats', v, tone, c, grid)
  },
  css: `/* Stats */
.kit-stats { background: var(--ink); color: #fff; padding-block: clamp(48px, 7vw, 80px); }
.kit-stats :is(h2, h3) { color: #fff; }
.kit-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 2rem; text-align: center; }
.kit-stat-value { display: block; font-family: var(--font-heading); font-weight: var(--heading-weight); text-transform: var(--heading-case); font-size: clamp(2.4rem, 5vw, 3.6rem); line-height: 1; color: var(--accent-on-dark); font-variant-numeric: tabular-nums; }
.kit-stat-label { display: block; margin-top: .6rem; color: rgba(255,255,255,.72); font-size: .95rem; }
.kit-section.kit-sec-stats .kit-stat-value { color: var(--primary-ink); }
.kit-section.kit-sec-stats .kit-stat-label { color: var(--muted); }
.kit-v-inline .kit-stats-grid { gap: 1.5rem 0; }
.kit-v-inline .kit-stat { padding: .25rem clamp(1rem, 2.5vw, 2rem); }
.kit-v-inline .kit-stat + .kit-stat { border-left: 1px solid var(--border-strong); }
.kit-stats-split { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(2rem, 5vw, 4.5rem); align-items: center; }
.kit-stats-media { margin: 0; border-radius: var(--radius-lg); overflow: hidden; aspect-ratio: 4 / 5; max-height: 560px; width: 100%; background: var(--surface-2); }
.kit-stats-media img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; }
.kit-v-photo .kit-head { text-align: left; margin: 0 0 2rem; }
.kit-v-photo .kit-head > * { margin-inline: 0; }
.kit-v-photo .kit-stats-grid { grid-template-columns: 1fr 1fr; text-align: left; gap: 1.75rem 2rem; }
.kit-v-photo .kit-stat { border-left: 3px solid var(--primary); padding-left: 1rem; }
@media (max-width: 860px) { .kit-stats-split { grid-template-columns: 1fr; } .kit-stats-media { aspect-ratio: 16 / 10; } }
@media (max-width: 640px) {
  .kit-v-inline .kit-stats-grid { grid-template-columns: 1fr 1fr; }
  .kit-v-inline .kit-stat + .kit-stat { border-left: 0; }
  .kit-v-inline .kit-stat:nth-child(even) { border-left: 1px solid var(--border-strong); }
}
`,
}
