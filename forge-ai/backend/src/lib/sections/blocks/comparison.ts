import { SectionDef, list, plain } from '../markup'

export const comparison: SectionDef = {
  type: 'comparison',
  label: 'Comparison — this business against the usual alternative, row by row',
  variants: { table: 'list' },
  doc: '{"eyebrow","title","intro","columns":["Us","Typical agency"],"rows":[{"label","values":[true,false]}] ×4–8} — a value is true, false, or a short text like "24 hours"',
  render(c, v, x, tone) {
    const cols = list(c.columns, 3).map(plain).filter(Boolean)
    const rows = list(c.rows, 10).filter((r) => plain(r?.label))
    const cell = (val: unknown) => {
      if (val === true || /^(yes|true|✓)$/i.test(plain(val))) return `<span${x.cls('kit-yes')} aria-label="${x.say('yes')}">✓</span>`
      if (val === false || /^(no|false|✗|—|-)$/i.test(plain(val))) return `<span${x.cls('kit-no')} aria-label="${x.say('no')}">—</span>`
      return x.text(val)
    }
    const head = `<thead><tr><th></th>${cols.map((col, n) => `<th${x.cls(n === 0 && 'kit-compare-us')} scope="col">${x.text(col)}</th>`).join('')}</tr></thead>`
    const body = `<tbody>${rows.map((r) => `<tr><th scope="row">${x.text(r.label)}</th>${cols.map((_, n) => `<td${x.cls(n === 0 && 'kit-compare-us')}>${cell(list(r.values, 3)[n])}</td>`).join('')}</tr>`).join('')}</tbody>`
    return x.section('comparison', v, tone, c, `<div${x.cls('kit-compare-wrap')}><table${x.cls('kit-compare')}>${head}${body}</table></div>`)
  },
  css: `/* Comparison */
.kit-compare-wrap { max-width: 900px; margin: 0 auto; overflow-x: auto; border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--bg); }
.kit-compare { width: 100%; border-collapse: collapse; font-size: .98rem; }
.kit-compare :is(th, td) { padding: 1rem 1.25rem; text-align: center; border-bottom: 1px solid var(--border); }
.kit-compare tbody tr:last-child > * { border-bottom: 0; }
.kit-compare th[scope="row"] { text-align: left; font-weight: 600; color: var(--text); }
.kit-compare thead th { font-family: var(--font-heading); font-size: 1.05rem; color: var(--text); }
.kit-compare .kit-compare-us { background: color-mix(in srgb, var(--primary) 8%, transparent); font-weight: 700; }
.kit-compare thead .kit-compare-us { color: var(--primary-ink); }
.kit-yes { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: var(--on-primary); font-weight: 800; font-size: .85rem; }
.kit-no { color: var(--muted); font-weight: 700; }
`,
}
