import { SectionDef, list, plain } from '../markup'

export const trust: SectionDef = {
  type: 'trust',
  label: 'Trust strip — reasons to trust the business, straight after the hero',
  variants: { row: 'band', badges: 'band' },
  doc: '{"items":[{"icon","title","text"}] ×3–4} — badges shows the titles only',
  ownTone: true,
  leaves: () => 'alt',
  render(c, v, x) {
    const items = list(c.items, 4).filter((i) => plain(i?.title ?? i))
    const li = items.map((i) => v === 'badges'
      ? `<li>${x.icon(i.icon)}<strong>${x.text(i.title ?? i)}</strong></li>`
      : `<li>${x.icon(i.icon)}<div><strong>${x.text(i.title ?? i)}</strong>${plain(i.text) ? `<span>${x.text(i.text)}</span>` : ''}</div></li>`).join('')
    return `<section${x.cls('kit-trust', 'kit-sec-trust', `kit-v-${v}`)} data-kit="trust"><div${x.cls('container')}><ul${x.cls('kit-trust-list')}>${li}</ul></div></section>`
  },
  css: `/* Trust strip */
.kit-trust { padding-block: clamp(28px, 4vw, 40px); background: var(--surface); border-bottom: 1px solid var(--border); }
.kit-trust-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 1.25rem 2rem; }
/* Four reasons never leave one stranded on its own row */
@media (max-width: 1000px) { .kit-trust-list:has(> :nth-child(4):last-child) { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .kit-trust-list:has(> :nth-child(4):last-child) { grid-template-columns: minmax(0, 1fr); } }
.kit-trust-list > li { display: flex; align-items: flex-start; gap: .9rem; }
.kit-trust-list strong { display: block; font-weight: 700; color: var(--text); line-height: 1.3; }
.kit-trust-list li span:not(.kit-icon) { display: block; color: var(--muted); font-size: .92rem; line-height: 1.5; margin-top: .15rem; }
.kit-trust.kit-v-badges { padding-block: clamp(18px, 2.6vw, 26px); }
.kit-v-badges .kit-trust-list { display: flex; flex-wrap: wrap; justify-content: center; gap: .75rem clamp(1.25rem, 4vw, 3rem); }
.kit-v-badges .kit-trust-list > li { align-items: center; gap: .55rem; }
.kit-v-badges .kit-trust-list .kit-icon { width: 34px; height: 34px; background: transparent; }
.kit-v-badges .kit-trust-list strong { font-size: .95rem; }
`,
}
