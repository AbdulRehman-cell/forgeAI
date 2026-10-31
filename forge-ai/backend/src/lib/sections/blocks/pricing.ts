import { SectionDef, list, plain } from '../markup'
import { t } from '../strings'

export const pricing: SectionDef = {
  type: 'pricing',
  label: 'Pricing — plans or memberships (cards), or a price list of services (list)',
  variants: { cards: 'grid', list: 'list' },
  doc: '{"eyebrow","title","intro","plans":[{"name","price":"£29","period":"/month","text","features":["…"],"button":{label,href},"featured":true}] — cards: 2–4 plans, ONE featured; list: 4–12 priced services (name, price, text)}',
  render(c, v, x, tone) {
    const plans = list(c.plans ?? c.items, v === 'list' ? 12 : 4).filter((p) => plain(p?.name))
    if (v === 'list') {
      const rows = plans.map((p) => `<li><div${x.cls('kit-pricelist-row')}><h3>${x.text(p.name)}</h3><span${x.cls('kit-pricelist-dots')} aria-hidden="true"></span><span${x.cls('kit-price')}>${x.text(p.price)}${plain(p.period) ? `<small>${x.text(p.period)}</small>` : ''}</span></div>${plain(p.text) ? `<p>${x.text(p.text)}</p>` : ''}</li>`).join('')
      const action = c.link ? `<div${x.cls('kit-actions', 'kit-pricelist-action')}>${x.link(c.link, 'btn btn-primary')}</div>` : ''
      return x.section('pricing', v, tone, c, `<ul${x.cls('kit-pricelist')}>${rows}</ul>${action}`)
    }
    const featured = Math.max(0, plans.findIndex((p) => p.featured === true || p.featured === 'true'))
    const pick = plans.length === 3 && !plans.some((p) => p.featured) ? 1 : featured
    const cardsHtml = plans.map((p, n) => {
      const feats = list(p.features, 8).map(plain).filter(Boolean)
      return `<article${x.cls('kit-plan', n === pick && 'kit-plan-featured')}>${n === pick ? `<span${x.cls('kit-badge')}>${x.text(p.badge || t(x.lang, 'mostPopular'))}</span>` : ''}<h3>${x.text(p.name)}</h3><p${x.cls('kit-plan-price')}>${x.text(p.price)}${plain(p.period) ? `<small>${x.text(p.period)}</small>` : ''}</p>${plain(p.text) ? `<p>${x.text(p.text)}</p>` : ''}${feats.length ? `<ul${x.cls('kit-checks')}>${feats.map((f) => `<li>${x.text(f)}</li>`).join('')}</ul>` : ''}${x.link(p.button, n === pick ? 'btn btn-primary' : 'btn btn-secondary', t(x.lang, 'choose'))}</article>`
    }).join('')
    return x.section('pricing', v, tone, c, `<div${x.cls('kit-pricing')}>${cardsHtml}</div>`)
  },
  css: `/* Pricing */
.kit-pricing { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: clamp(1rem, 2vw, 1.5rem); align-items: stretch; }
.kit-plan { position: relative; display: flex; flex-direction: column; background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); border-radius: var(--radius-lg); padding: clamp(1.5rem, 3vw, 2.1rem); }
.kit-plan h3 { font-size: 1.1rem; margin: 0 0 .75rem; }
.kit-plan-price { font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: clamp(2.2rem, 4vw, 2.9rem); line-height: 1; color: var(--text); margin: 0 0 .6rem; }
.kit-plan-price small { font-family: var(--font-body); font-size: .9rem; font-weight: 500; color: var(--muted); margin-left: .25rem; }
.kit-plan > p:not(.kit-plan-price) { color: var(--muted); margin: 0 0 1rem; }
.kit-plan .kit-checks { margin: .5rem 0 1.75rem; }
.kit-plan > :is(.btn, a.btn, button) { margin-top: auto; width: 100%; justify-content: center; }
.kit-plan.kit-plan-featured { border: 2px solid var(--primary); box-shadow: var(--shadow-lg); }
.kit-plan > .kit-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); white-space: nowrap; }
.kit-pricelist { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 0 clamp(2rem, 5vw, 4rem); }
.kit-pricelist > li { padding: 1.1rem 0; border-bottom: 1px solid var(--border); }
.kit-pricelist-row { display: flex; align-items: baseline; gap: .75rem; }
.kit-pricelist-row h3 { font-size: 1.08rem; margin: 0; }
.kit-pricelist-dots { flex: 1; min-width: 1.5rem; border-bottom: 2px dotted var(--border-strong); transform: translateY(-.3em); }
.kit-pricelist .kit-price { white-space: nowrap; color: var(--primary-ink); }
.kit-pricelist .kit-price small { font-family: var(--font-body); font-size: .8rem; color: var(--muted); margin-left: .2rem; }
.kit-pricelist > li > p { margin: .35rem 0 0; color: var(--muted); font-size: .94rem; line-height: 1.55; max-width: 52ch; }
.kit-pricelist-action { justify-content: center; margin-top: 2.25rem; }
`,
}
