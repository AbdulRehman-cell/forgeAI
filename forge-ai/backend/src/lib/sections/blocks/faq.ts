import { SectionDef, list, plain } from '../markup'

export const faq: SectionDef = {
  type: 'faq',
  label: 'FAQ — the questions customers really ask',
  variants: { accordion: 'list', split: 'split', columns: 'grid' },
  doc: '{"eyebrow","title","intro","link":{label,href},"items":[{"q","a"}] ×4–8} — "link" is an optional "Still have questions?" action',
  render(c, v, x, tone) {
    const items = list(c.items, 8).filter((i) => plain(i?.q ?? i?.question))
    const q = (i: any) => x.text(i.q ?? i.question)
    const a = (i: any) => x.text(i.a ?? i.answer)
    if (v === 'columns') {
      return x.section('faq', v, tone, c, `<div${x.cls('kit-faq-cols')}>${items.map((i) => `<div${x.cls('kit-faq-item')}><h3>${q(i)}</h3><p>${a(i)}</p></div>`).join('')}</div>`)
    }
    const accordion = `<div${x.cls('kit-faq')}>${items.map((i) => `<details><summary>${q(i)}</summary><p>${a(i)}</p></details>`).join('')}</div>`
    if (v === 'split') {
      const action = c.link ? `<div${x.cls('kit-actions')}>${x.link(c.link, 'btn btn-secondary')}</div>` : ''
      return x.section('faq', v, tone, c, `<div${x.cls('kit-faq-split')}><div${x.cls('kit-faq-side')}>${x.head(c)}${action}</div>${accordion}</div>`, { noHead: true })
    }
    return x.section('faq', v, tone, c, accordion)
  },
  css: `/* FAQ */
.kit-faq { max-width: 820px; margin: 0 auto; border-top: 1px solid var(--border); }
.kit-faq details { border-bottom: 1px solid var(--border); }
.kit-faq summary { list-style: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; padding: 1.3rem 0; font-weight: 600; font-size: 1.08rem; color: var(--text); }
.kit-faq summary::-webkit-details-marker { display: none; }
.kit-faq summary::after { content: '+'; flex-shrink: 0; width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; background: var(--surface-2); color: var(--text); font-size: 1.25rem; line-height: 1; transition: transform .25s ease, background .2s ease; }
.kit-faq details[open] summary::after { transform: rotate(45deg); background: var(--primary); color: var(--on-primary); }
.kit-faq details > :not(summary) { margin: 0 0 1.3rem; color: var(--muted); line-height: 1.7; max-width: 68ch; }
.kit-faq-split { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: clamp(2rem, 5vw, 4.5rem); align-items: start; }
.kit-faq-side { position: sticky; top: 104px; }
.kit-faq-side .kit-head { text-align: left; margin: 0 0 1.5rem; }
.kit-faq-side .kit-head > * { margin-inline: 0; }
.kit-faq-split .kit-faq { max-width: none; margin: 0; }
.kit-faq-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 0 clamp(2rem, 4vw, 3.5rem); }
.kit-faq-item { padding: 1.4rem 0; border-top: 1px solid var(--border); }
.kit-faq-item h3 { font-size: 1.08rem; margin: 0 0 .5rem; }
.kit-faq-item p { margin: 0; color: var(--muted); line-height: 1.7; }
@media (max-width: 860px) { .kit-faq-split { grid-template-columns: 1fr; } .kit-faq-side { position: static; } }
`,
}
