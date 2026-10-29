import { SectionDef, list, plain } from '../markup'

export const logos: SectionDef = {
  type: 'logos',
  label: 'Client names — ONLY when the request or the brand\'s real site names actual clients; never invent company names',
  variants: { row: 'band', marquee: 'band' },
  doc: '{"title":"Trusted by …","names":["…"] ×4–8}',
  ownTone: true,
  leaves: () => 'bg',
  render(c, v, x) {
    const names = list(c.names ?? c.items, 8).map((n) => plain(n?.name ?? n)).filter(Boolean)
    const ul = (hidden: boolean) => `<ul${x.cls('kit-logos-list')}${hidden ? ' aria-hidden="true"' : ''}>${names.map((n) => `<li>${x.text(n)}</li>`).join('')}</ul>`
    const body = v === 'marquee' ? `<div${x.cls('kit-marquee')}>${ul(false)}${ul(true)}</div>` : ul(false)
    return `<section${x.cls('kit-logos', 'kit-sec-logos', `kit-v-${v}`)} data-kit="logos"><div${x.cls('container')}>${plain(c.title) ? `<p${x.cls('kit-logos-title')}>${x.text(c.title)}</p>` : ''}${body}</div></section>`
  },
  css: `/* Client names */
.kit-logos { padding-block: clamp(32px, 5vw, 48px); border-block: 1px solid var(--border); background: var(--bg); }
.kit-logos-title { text-align: center; font-size: .78rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); margin: 0 0 1.25rem; }
.kit-logos-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: .9rem clamp(1.75rem, 4vw, 3.25rem); }
.kit-logos-list > li { font-family: var(--font-heading); font-weight: var(--heading-weight); text-transform: uppercase; letter-spacing: .06em; font-size: clamp(1rem, 1.5vw, 1.2rem); color: var(--text); opacity: .55; white-space: nowrap; }
.kit-marquee { --kit-gap: 3rem; display: flex; gap: var(--kit-gap); overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); }
.kit-marquee > .kit-logos-list { flex-shrink: 0; flex-wrap: nowrap; gap: var(--kit-gap); animation: kit-marquee 30s linear infinite; }
@keyframes kit-marquee { to { transform: translateX(calc(-100% - var(--kit-gap))); } }
@media (prefers-reduced-motion: reduce) { .kit-marquee > .kit-logos-list { animation: none; } .kit-marquee > .kit-logos-list[aria-hidden] { display: none; } .kit-marquee { -webkit-mask-image: none; mask-image: none; justify-content: center; } }
`,
}
