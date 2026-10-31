import { SectionDef, plain } from '../markup'
import { t } from '../strings'

export const newsletter: SectionDef = {
  type: 'newsletter',
  label: 'Newsletter — email sign-up for updates, offers or a waitlist',
  variants: { band: 'band', inline: 'split' },
  doc: '{"title","text","placeholder":"you@example.com","button":"Subscribe","note":"one line, e.g. no spam"}',
  ownTone: ['band'],
  leaves: () => 'dark',
  dataForm: true,
  render(c, v, x, tone) {
    const id = x.uid('kn')
    const form = x.jsx ? '' : x.ownForm('kit-newsletter-form', `<label${x.cls('kit-sr')} for="${id}">${x.say('emailAddress')}</label><input id="${id}" type="email" name="email" required placeholder="${x.text(c.placeholder || 'you@example.com')}"><button type="submit"${x.cls('btn btn-primary')}>${x.text(c.button || t(x.lang, 'subscribe'))}</button>`)
    const words = `<div>${plain(c.title) ? `<h2>${x.text(c.title)}</h2>` : ''}${plain(c.text) ? `<p>${x.text(c.text)}</p>` : ''}</div>`
    const side = `<div>${form}${plain(c.note) ? `<p${x.cls('kit-newsletter-note')}>${x.text(c.note)}</p>` : ''}</div>`
    if (v === 'band') {
      return `<section${x.cls('kit-newsletter', 'kit-sec-newsletter', 'kit-v-band')} data-kit="newsletter"><div${x.cls('container', 'kit-newsletter-inner')}>${words}${side}</div></section>`
    }
    return x.section('newsletter', v, tone, c, `<div${x.cls('kit-newsletter-inner', 'kit-newsletter-box')}>${words}${side}</div>`, { noHead: true })
  },
  css: `/* Newsletter */
.kit-newsletter { background: var(--primary); color: var(--on-primary); padding-block: clamp(48px, 7vw, 80px); }
.kit-newsletter-inner { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.5rem clamp(2rem, 5vw, 4rem); align-items: center; }
.kit-newsletter-inner h2 { margin: 0 0 .5rem; }
.kit-newsletter-inner p { margin: 0; line-height: 1.6; }
.kit-newsletter :is(h2, p) { color: var(--on-primary) !important; }
.kit-newsletter-form { display: flex; gap: .6rem; flex-wrap: wrap; }
.kit-newsletter-form input { flex: 1 1 220px; min-height: 52px; padding: .75rem 1rem; border-radius: var(--btn-radius, 10px); border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); font: inherit; }
.kit-newsletter .kit-newsletter-form input { border-color: transparent; background: #fff; color: #16181c; }
.kit-newsletter-form .btn { min-height: 52px; }
.kit-newsletter .kit-newsletter-form .btn-primary:not(#_) { background: var(--ink) !important; border-color: var(--ink) !important; color: #fff !important; }
.kit-newsletter-note { font-size: .85rem; opacity: .8; margin-top: .6rem !important; }
.kit-newsletter-box { background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); border-radius: var(--radius-xl); padding: clamp(1.75rem, 4vw, 3rem); }
.kit-newsletter-box p { color: var(--muted); }
@media (max-width: 760px) { .kit-newsletter-inner { grid-template-columns: 1fr; } }
`,
}
