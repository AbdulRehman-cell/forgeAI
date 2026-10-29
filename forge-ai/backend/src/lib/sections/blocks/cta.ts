import { SectionDef, plain } from '../markup'

export const cta: SectionDef = {
  type: 'cta',
  label: 'Closing call to action — EVERY page ends with one',
  variants: { band: 'band', photo: 'band', panel: 'band' },
  doc: '{"title","text","primary":{label,href},"secondary":{label,href},"photo"}',
  ownTone: true,
  leaves: (v) => (v === 'panel' ? 'bg' : 'dark'),
  render(c, v, x) {
    const words = `<div>${plain(c.title) ? `<h2>${x.text(c.title)}</h2>` : ''}${plain(c.text) ? `<p>${x.text(c.text)}</p>` : ''}</div>`
    const actions = `<div${x.cls('kit-actions')}>${x.link(c.primary, 'btn btn-primary')}${x.link(c.secondary, 'btn btn-secondary')}</div>`
    if (v === 'panel') {
      return `<section${x.cls('kit-section', 'kit-sec-cta', 'kit-v-panel')} data-kit="cta"><div${x.cls('container')}><div${x.cls('kit-cta-panel')}>${words}${actions}</div></div></section>`
    }
    const photo = v === 'photo' ? x.img(x.photo(c.photo), '', 'hero-bg') : ''
    return `<section${x.cls('kit-cta', 'kit-sec-cta', `kit-v-${v}`)} data-kit="cta">${photo}<div${x.cls('container', 'kit-cta-inner')}>${words}${actions}</div></section>`
  },
  css: `/* Closing band */
.kit-cta { position: relative; overflow: hidden; background: var(--ink); color: #fff; padding-block: clamp(56px, 8vw, 96px); }
.kit-cta::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--primary); z-index: 2; }
.kit-cta > .hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; max-width: none; border-radius: 0 !important; }
.kit-cta:has(> .hero-bg)::after { content: ''; position: absolute; inset: 0; z-index: 1; background: rgba(10,11,13,.78); }
.kit-cta > :not(.hero-bg) { position: relative; z-index: 2; }
.kit-cta-inner { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem 2.5rem; flex-wrap: wrap; }
.kit-cta h2 { color: #fff !important; margin: 0 0 .6rem; max-width: 22ch; }
.kit-cta p { color: rgba(255,255,255,.78) !important; margin: 0; max-width: 56ch; }
.kit-cta :is(.btn-secondary, .btn-ghost) { background: transparent !important; color: #fff !important; border: 1.5px solid rgba(255,255,255,.42) !important; }
.kit-cta-panel { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem 2.5rem; flex-wrap: wrap; background: var(--primary); color: var(--on-primary); border-radius: var(--radius-xl); padding: clamp(2rem, 5vw, 3.75rem); }
.kit-cta-panel h2 { color: var(--on-primary) !important; margin: 0 0 .6rem; max-width: 22ch; }
.kit-cta-panel p { color: var(--on-primary) !important; opacity: .86; margin: 0; max-width: 56ch; }
.kit-cta-panel .btn-primary:not(#_) { background: var(--ink) !important; border-color: var(--ink) !important; color: #fff !important; }
.kit-cta-panel .btn-secondary:not(#_) { background: transparent !important; color: var(--on-primary) !important; border: 1.5px solid currentColor !important; }
@media (max-width: 860px) { .kit-cta-inner, .kit-cta-panel { flex-direction: column; align-items: flex-start; } }
`,
}
