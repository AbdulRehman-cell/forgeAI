import { SectionDef, list, plain } from '../markup'

export const timeline: SectionDef = {
  type: 'timeline',
  label: 'Timeline — a history, milestones, or an event programme',
  variants: { vertical: 'list', horizontal: 'grid' },
  doc: '{"eyebrow","title","intro","items":[{"when":"2014 or 18:30","title","text"}] ×3–6}',
  render(c, v, x, tone) {
    const items = list(c.items, 8).filter((i) => plain(i?.title))
    const li = items.map((i) => `<li${x.cls('kit-moment')}><span${x.cls('kit-moment-when')}>${x.text(i.when ?? i.year ?? i.time ?? i.date)}</span><div><h3>${x.text(i.title)}</h3>${plain(i.text) ? `<p>${x.text(i.text)}</p>` : ''}</div></li>`).join('')
    return x.section('timeline', v, tone, c, `<ol${x.cls('kit-timeline')}>${li}</ol>`)
  },
  css: `/* Timeline */
.kit-timeline { list-style: none; margin: 0 auto; padding: 0; max-width: 820px; position: relative; }
.kit-v-vertical .kit-timeline::before { content: ''; position: absolute; left: 7px; top: .5rem; bottom: .5rem; width: 2px; background: var(--border-strong); }
.kit-moment { position: relative; display: grid; grid-template-columns: 8.5rem minmax(0, 1fr); gap: .25rem 1.5rem; padding: 0 0 2rem 2.5rem; }
.kit-moment::before { content: ''; position: absolute; left: 0; top: .35rem; width: 16px; height: 16px; border-radius: 50%; background: var(--primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 22%, transparent); }
.kit-moment-when { font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: 1.15rem; color: var(--primary-ink); line-height: 1.4; }
.kit-moment h3 { font-size: 1.12rem; margin: 0 0 .35rem; }
.kit-moment p { margin: 0; color: var(--muted); line-height: 1.6; }
.kit-v-horizontal .kit-timeline { max-width: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 2rem 1.5rem; }
.kit-v-horizontal .kit-moment { display: block; padding: 2.4rem 0 0; border-top: 2px solid var(--border-strong); }
.kit-v-horizontal .kit-moment::before { top: -9px; }
.kit-v-horizontal .kit-moment-when { display: block; margin-bottom: .5rem; }
@media (max-width: 640px) { .kit-v-vertical .kit-moment { grid-template-columns: 1fr; } }
`,
}
