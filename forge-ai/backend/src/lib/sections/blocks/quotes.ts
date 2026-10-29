import { SectionDef, list, plain } from '../markup'

export const quotes: SectionDef = {
  type: 'quotes',
  label: 'Reviews — what customers say',
  variants: { cards: 'grid', spotlight: 'media', wall: 'grid' },
  doc: '{"eyebrow","title","intro","items":[{"quote","name","role":"role, place","rating":5}] ×3 (wall: 4–6)} — spotlight shows the FIRST quote large',
  render(c, v, x, tone) {
    const items = list(c.items, 6).filter((i) => plain(i?.quote))
    const figs = items.map((i, n) => `<figure${x.cls('kit-quote', v === 'spotlight' && n === 0 && 'kit-quote-lead')}>${x.stars(i.rating)}<blockquote>${x.text(i.quote)}</blockquote><figcaption><span${x.cls('kit-avatar')}>${x.initials(i.name)}</span><span><strong>${x.text(i.name)}</strong>${plain(i.role) ? `<small>${x.text(i.role)}</small>` : ''}</span></figcaption></figure>`).join('')
    return x.section('quotes', v, tone, c, `<div${x.cls('kit-quotes')}>${figs}</div>`)
  },
  css: `/* Reviews */
.kit-quotes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr)); gap: clamp(1rem, 2vw, 1.5rem); }
.kit-quote { margin: 0; display: flex; flex-direction: column; gap: 1rem; background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); border-radius: var(--radius-lg); padding: clamp(1.4rem, 2.5vw, 1.9rem); }
.kit-quote blockquote { margin: 0; font-size: 1.05rem; line-height: 1.65; color: var(--text); }
.kit-quote figcaption { margin-top: auto; display: flex; align-items: center; gap: .8rem; }
.kit-quote figcaption strong { display: block; font-size: .95rem; color: var(--text); }
.kit-quote figcaption small { display: block; color: var(--muted); font-size: .82rem; }
.kit-v-spotlight .kit-quotes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.kit-v-spotlight .kit-quote-lead { grid-column: 1 / -1; align-items: center; text-align: center; background: none; border: 0; box-shadow: none; padding: 0 0 clamp(1rem, 3vw, 2rem); }
.kit-v-spotlight .kit-quote-lead blockquote { font-size: clamp(1.35rem, 2.6vw, 2rem); line-height: 1.4; font-weight: 500; max-width: 34ch; }
.kit-v-spotlight .kit-quote-lead blockquote::before { content: '\\201C'; display: block; font-family: Georgia, serif; font-size: 4.5rem; line-height: .6; height: 2.2rem; color: var(--primary-ink); }
.kit-v-spotlight .kit-quote-lead figcaption { margin-top: .25rem; text-align: left; }
.kit-v-wall .kit-quotes { display: block; columns: 3 280px; column-gap: clamp(1rem, 2vw, 1.5rem); }
.kit-v-wall .kit-quote { break-inside: avoid; margin-bottom: clamp(1rem, 2vw, 1.5rem); }
@media (max-width: 760px) { .kit-v-spotlight .kit-quotes { grid-template-columns: 1fr; } }
`,
}
