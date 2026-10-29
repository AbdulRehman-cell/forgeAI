import { SectionDef, list, plain } from '../markup'

export const menu: SectionDef = {
  type: 'menu',
  label: 'Menu — dishes or products in groups, with prices (restaurants, cafés, bakeries)',
  variants: { columns: 'list', boxed: 'grid' },
  doc: '{"eyebrow","title","intro","groups":[{"name":"Breakfast","items":[{"name","text","price","tag":"V / new / spicy"}] ×3–8}] ×1–4}',
  render(c, v, x, tone) {
    const groups = list(c.groups, 4).filter((g) => list(g?.items, 10).length)
    const body = groups.map((g) => `<div${x.cls('kit-menu-group')}>${plain(g.name) ? `<h3${x.cls('kit-menu-title')}>${x.text(g.name)}</h3>` : ''}<ul>${list(g.items, 10).filter((i) => plain(i?.name)).map((i) => `<li><div${x.cls('kit-menu-row')}><span${x.cls('kit-menu-name')}>${x.text(i.name)}${plain(i.tag) ? ` <small${x.cls('kit-menu-tag')}>${x.text(i.tag)}</small>` : ''}</span><span${x.cls('kit-pricelist-dots')} aria-hidden="true"></span><span${x.cls('kit-menu-price')}>${x.text(i.price)}</span></div>${plain(i.text) ? `<p>${x.text(i.text)}</p>` : ''}</li>`).join('')}</ul></div>`).join('')
    return x.section('menu', v, tone, c, `<div${x.cls('kit-menu')}>${body}</div>`)
  },
  css: `/* Menu */
.kit-menu { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: clamp(2rem, 4vw, 3rem) clamp(2rem, 5vw, 4.5rem); }
.kit-menu-title { font-size: 1.3rem; margin: 0 0 .5rem; padding-bottom: .6rem; border-bottom: 2px solid var(--primary); display: inline-block; }
.kit-menu ul { list-style: none; margin: 0; padding: 0; }
.kit-menu li { padding: .95rem 0; border-bottom: 1px solid var(--border); }
.kit-menu-row { display: flex; align-items: baseline; gap: .7rem; }
.kit-menu-name { font-weight: 700; color: var(--text); }
.kit-menu-tag { font-size: .68rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--primary-ink); margin-left: .25rem; }
.kit-menu-price { font-family: var(--font-heading); font-weight: var(--heading-weight); color: var(--primary-ink); white-space: nowrap; }
.kit-menu li > p { margin: .3rem 0 0; color: var(--muted); font-size: .93rem; line-height: 1.55; }
.kit-v-boxed .kit-menu-group { background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); border-radius: var(--radius-lg); padding: clamp(1.4rem, 3vw, 2rem); }
.kit-v-boxed .kit-menu li:last-child { border-bottom: 0; }
`,
}
