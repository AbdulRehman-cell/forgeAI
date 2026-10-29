import { SectionDef, list, plain } from '../markup'

export const features: SectionDef = {
  type: 'features',
  label: 'Features — what the business offers, services, benefits',
  variants: { grid: 'grid', bento: 'grid', rows: 'list', numbered: 'list' },
  doc: '{"eyebrow","title","intro","items":[{"icon","title","text"}] ×3–6} — bento: give the FIRST item a "photo"',
  render(c, v, x, tone) {
    const items = list(c.items, 6).filter((i) => plain(i?.title))
    const body = items.map((i, n) => {
      const words = `<h3>${x.text(i.title)}</h3>${plain(i.text) ? `<p>${x.text(i.text)}</p>` : ''}`
      if (v === 'bento' && n === 0) {
        return `<article${x.cls('kit-feature', 'kit-feature-lead')}>${x.img(x.photo(i.photo), i.title, 'kit-feature-photo')}<div${x.cls('kit-feature-body')}>${x.icon(i.icon)}${words}</div></article>`
      }
      if (v === 'numbered') return `<article${x.cls('kit-feature')}>${words}</article>`
      if (v === 'rows') return `<article${x.cls('kit-feature')}>${x.icon(i.icon)}<div>${words}</div></article>`
      return `<article${x.cls('kit-feature')}>${x.icon(i.icon)}${words}</article>`
    }).join('')
    return x.section('features', v, tone, c, `<div${x.cls('kit-features')}>${body}</div>`)
  },
  css: `/* Features */
.kit-features { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: clamp(1rem, 2vw, 1.5rem); }
.kit-feature { background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); border-radius: var(--radius); padding: clamp(1.4rem, 2.5vw, 1.9rem); transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
.kit-feature:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); }
.kit-feature h3 { font-size: 1.2rem; margin: 1rem 0 .5rem; }
.kit-feature p { color: var(--muted); margin: 0; line-height: 1.6; }
.kit-v-bento .kit-features { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.kit-v-bento .kit-features > :nth-child(4):last-child { grid-column: span 3; }
.kit-v-bento .kit-features:has(> :nth-child(5):last-child) > :last-child { grid-column: span 2; }
.kit-feature-lead { grid-column: span 2; grid-row: span 2; position: relative; overflow: hidden; isolation: isolate; min-height: 380px; display: flex; flex-direction: column; justify-content: flex-end; padding: 0; border: 0; background: var(--ink); }
.kit-feature-lead > .kit-feature-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; border-radius: 0 !important; max-width: none; }
.kit-feature-lead::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(0deg, rgba(10,11,13,.9) 0%, rgba(10,11,13,.2) 70%); }
.kit-feature-lead .kit-feature-body { padding: clamp(1.4rem, 3vw, 2.2rem); }
.kit-feature-lead h3 { color: #fff !important; font-size: clamp(1.4rem, 2.4vw, 1.9rem); }
.kit-feature-lead p { color: rgba(255,255,255,.84) !important; max-width: 46ch; }
.kit-feature-lead .kit-icon { background: rgba(255,255,255,.14); color: #fff; }
.kit-v-rows .kit-features { grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: clamp(1.75rem, 3vw, 2.5rem) clamp(2rem, 4vw, 3.5rem); }
.kit-v-rows .kit-feature { display: flex; gap: 1.1rem; align-items: flex-start; background: none; border: 0; box-shadow: none; padding: 0; border-radius: 0; }
.kit-v-rows .kit-feature:hover { transform: none; box-shadow: none; }
.kit-v-rows .kit-feature h3 { margin: .3rem 0 .4rem; }
.kit-v-numbered .kit-features { counter-reset: kit-feature; gap: 0 clamp(1.5rem, 3vw, 2.5rem); }
.kit-v-numbered .kit-feature { background: none; border: 0; border-top: 2px solid var(--text); border-radius: 0; box-shadow: none; padding: 1.4rem 0 1.8rem; }
.kit-v-numbered .kit-feature:hover { transform: none; box-shadow: none; }
.kit-v-numbered .kit-feature::before { counter-increment: kit-feature; content: counter(kit-feature, decimal-leading-zero); display: block; font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: clamp(2rem, 3.4vw, 2.6rem); line-height: 1; color: var(--primary-ink); }
.kit-v-numbered .kit-feature h3 { margin-top: 1.1rem; }
@media (max-width: 860px) {
  .kit-v-bento .kit-features { grid-template-columns: 1fr 1fr; }
  .kit-v-bento .kit-features > * { grid-column: auto !important; }
  .kit-v-bento .kit-features > .kit-feature-lead { grid-column: 1 / -1 !important; grid-row: auto; min-height: 320px; }
}
@media (max-width: 560px) { .kit-v-bento .kit-features { grid-template-columns: 1fr; } }
`,
}
