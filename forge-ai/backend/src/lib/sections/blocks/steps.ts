import { SectionDef, list, plain } from '../markup'

export const steps: SectionDef = {
  type: 'steps',
  label: 'Steps — how it works, a process, a first visit',
  variants: { row: 'list', timeline: 'list', cards: 'grid' },
  doc: '{"eyebrow","title","intro","items":[{"title","text"}] ×3–4}',
  render(c, v, x, tone) {
    const items = list(c.items, 5).filter((i) => plain(i?.title))
    // The step number is drawn already — "1. Book online" loses its "1."
    const title = (t: unknown) => plain(t).replace(/^(step\s*)?\d+\s*[.):–—-]\s*/i, '')
    const li = items.map((i, n) => `<li${x.cls('kit-step')}><span${x.cls('kit-step-num')}>${String(n + 1).padStart(2, '0')}</span><h3>${x.text(title(i.title))}</h3>${plain(i.text) ? `<p>${x.text(i.text)}</p>` : ''}</li>`).join('')
    return x.section('steps', v, tone, c, `<ol${x.cls('kit-steps')}>${li}</ol>`)
  },
  css: `/* Steps */
.kit-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: clamp(1.5rem, 3vw, 2rem); }
.kit-step { position: relative; }
.kit-step-num { display: inline-grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; background: var(--primary); color: var(--on-primary); font-family: var(--font-heading); font-weight: 800; font-size: 1.15rem; position: relative; z-index: 1; box-shadow: 0 0 0 6px var(--bg); }
.kit-alt .kit-step-num { box-shadow: 0 0 0 6px var(--surface); }
.kit-dark .kit-step-num { box-shadow: 0 0 0 6px var(--ink); }
.kit-step h3 { font-size: 1.15rem; margin: 1.1rem 0 .45rem; }
.kit-step p { color: var(--muted); margin: 0; line-height: 1.6; }
@media (min-width: 900px) { .kit-step:not(:last-child)::after { content: ''; position: absolute; top: 25px; left: 66px; right: -1rem; height: 2px; background: var(--border-strong); } }
.kit-v-timeline .kit-steps { grid-template-columns: 1fr; max-width: 760px; margin-inline: auto; gap: 0; }
.kit-v-timeline .kit-step { display: grid; grid-template-columns: 52px minmax(0, 1fr); column-gap: 1.4rem; padding-bottom: 2.2rem; }
.kit-v-timeline .kit-step-num { grid-row: span 2; }
.kit-v-timeline .kit-step h3 { margin: .75rem 0 .4rem; }
.kit-v-timeline .kit-step:not(:last-child)::after { content: ''; position: absolute; left: 25px; right: auto; top: 58px; bottom: 6px; width: 2px; height: auto; background: var(--border-strong); }
.kit-v-cards .kit-step { background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); border-radius: var(--radius-lg); padding: clamp(1.4rem, 2.5vw, 1.9rem); }
.kit-v-cards .kit-step-num { display: block; width: auto; height: auto; background: none; color: var(--primary-ink); box-shadow: none !important; font-size: clamp(2.4rem, 4vw, 3.2rem); line-height: 1; }
.kit-v-cards .kit-step:not(:last-child)::after { content: none; }
`,
}
