import { SectionDef, list, plain } from '../markup'

export const duo: SectionDef = {
  type: 'duo',
  label: 'Duo — two audiences side by side (candidates and employers, buyers and sellers)',
  variants: { panels: 'split' },
  doc: '{"panels":[{"eyebrow","title","text","button":{label,href}}] ×2} — the first panel gets a photo, the second the brand colour',
  render(c, v, x, tone) {
    const panels = list(c.panels ?? c.items, 2).filter((p) => plain(p?.title))
    const body = panels.map((p, n) => {
      const photo = n === 0 ? x.img(x.photo(p.photo), '', 'hero-bg') : ''
      return `<div${x.cls('kit-duo-panel', n === 1 && 'kit-duo-brand')}>${photo}${plain(p.eyebrow) ? `<span${x.cls('eyebrow')}>${x.text(p.eyebrow)}</span>` : ''}<h3>${x.text(p.title)}</h3>${plain(p.text) ? `<p>${x.text(p.text)}</p>` : ''}${x.link(p.button, n === 0 ? 'btn btn-primary' : 'btn btn-secondary')}</div>`
    }).join('')
    return x.section('duo', v, tone, c, `<div${x.cls('kit-duo')}>${body}</div>`)
  },
  css: `/* Two audiences */
.kit-duo { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(1rem, 2vw, 1.5rem); }
.kit-duo-panel { position: relative; overflow: hidden; isolation: isolate; border-radius: var(--radius-lg); padding: clamp(1.75rem, 4vw, 3rem); min-height: 340px; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-start; background: var(--ink); color: #fff; }
.kit-duo-panel > .hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; max-width: none; border-radius: 0 !important; }
.kit-duo-panel:has(> .hero-bg)::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(0deg, rgba(10,11,13,.9) 0%, rgba(10,11,13,.35) 100%); }
.kit-duo-panel h3 { color: #fff !important; font-size: clamp(1.5rem, 2.6vw, 2.1rem); margin: .35rem 0 .6rem; text-transform: var(--heading-case); }
.kit-duo-panel p { color: rgba(255,255,255,.82) !important; margin: 0 0 1.5rem; max-width: 46ch; }
.kit-duo-panel .eyebrow { color: var(--accent-on-dark) !important; }
.kit-duo-panel.kit-duo-brand { background: var(--primary); }
.kit-duo-brand :is(h3, p, .eyebrow) { color: var(--on-primary) !important; }
.kit-duo-brand :is(.btn, .btn-primary, .btn-secondary, a.btn) { background: var(--ink) !important; color: #fff !important; border-color: var(--ink) !important; }
@media (max-width: 760px) { .kit-duo { grid-template-columns: 1fr; } .kit-duo-panel { min-height: 280px; } }
`,
}
