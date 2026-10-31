import { SectionDef, list, plain } from '../markup'
import { t } from '../strings'

export const contact: SectionDef = {
  type: 'contact',
  label: 'Contact — details plus an enquiry or booking form',
  variants: { split: 'split', card: 'grid', map: 'split' },
  doc: '{"eyebrow","title","text","details":[{"icon","label":"Phone","value","href":"tel:…"}] ×2–4,"form":{"fields":[{"label","name","type":"text|email|tel|date|number|select|textarea","options":["…"]}] ×2–5,"button"},"address":"street, city"} — map shows "address" on a map',
  dataForm: true,
  render(c, v, x, tone) {
    const details = list(c.details, 4).filter((d) => plain(d?.value))
    const detailList = details.length ? `<ul${x.cls('kit-contact-list')}>${details.map((d) => {
      const href = plain(d.href)
      const value = /^(tel:|mailto:|https?:)/i.test(href) ? `<a href="${x.text(href)}">${x.text(d.value)}</a>` : `<span>${x.text(d.value)}</span>`
      return `<li>${x.icon(d.icon || d.label)}<div><strong>${x.text(d.label)}</strong>${value}</div></li>`
    }).join('')}</ul>` : ''
    const fields = list(c.form?.fields ?? c.fields, 6)
    const pairs: string[] = []
    const rendered = (fields.length ? fields : [{ label: t(x.lang, 'name') }, { label: t(x.lang, 'email'), type: 'email' }, { label: t(x.lang, 'message'), type: 'textarea' }]).map((f, i) => x.field(f, i))
    // Short fields pair up in rows; a textarea always gets its own row
    for (let i = 0; i < rendered.length; i++) {
      if (!/<textarea/.test(rendered[i]) && rendered[i + 1] && !/<textarea/.test(rendered[i + 1])) { pairs.push(`<div${x.cls('kit-form-row')}>${rendered[i]}${rendered[i + 1]}</div>`); i++ } else pairs.push(rendered[i])
    }
    // React apps save enquiries to their database — that form is written by hand
    const form = x.jsx ? '' : x.ownForm('kit-form', `${pairs.join('')}<button type="submit"${x.cls('btn btn-primary')}>${x.text(c.form?.button || c.button || t(x.lang, 'send'))}</button>`)
    const address = plain(c.address)
    const map = v === 'map' && address
      ? `<div${x.cls('kit-map')}><iframe src="https://maps.google.com/maps?q=${encodeURIComponent(address)}&amp;output=embed" title="${x.text(`Map of ${address}`)}" loading="lazy"></iframe></div>`
      : ''
    const intro = `${plain(c.eyebrow) ? `<span${x.cls('eyebrow')}>${x.text(c.eyebrow)}</span>` : ''}${plain(c.title) ? `<h2>${x.text(c.title)}</h2>` : ''}${plain(c.text ?? c.intro) ? `<p>${x.text(c.text ?? c.intro)}</p>` : ''}`
    let body: string
    if (v === 'card') {
      body = `<div${x.cls('kit-contact-card')}><div${x.cls('kit-head')}>${intro}</div>${form}${detailList}</div>`
    } else if (v === 'map') {
      body = `<div${x.cls('kit-contact')}><div>${intro}${detailList}${map}</div>${form || ''}</div>`
    } else {
      body = `<div${x.cls('kit-contact')}><div>${intro}${detailList}</div>${form}</div>`
    }
    return x.section('contact', v, tone, c, body, { noHead: true })
  },
  css: `/* Contact */
.kit-contact { display: grid; grid-template-columns: .9fr 1.1fr; gap: clamp(2rem, 5vw, 4rem); align-items: start; }
.kit-contact h2 { margin: .35rem 0 .9rem; }
.kit-contact > div > p { color: var(--muted); line-height: 1.7; }
.kit-contact-list { list-style: none; padding: 0; margin: 1.5rem 0 0; display: grid; gap: 1.1rem; }
.kit-contact-list > li { display: flex; gap: .9rem; align-items: flex-start; }
.kit-contact-list strong { display: block; font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 700; margin-bottom: .15rem; }
.kit-contact-list li :is(a, span:not(.kit-icon)) { color: var(--text); font-weight: 600; font-size: 1.05rem; text-decoration: none; }
.kit-form { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: clamp(1.4rem, 3vw, 2.2rem); box-shadow: var(--shadow); display: grid; gap: 1rem; }
.kit-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.kit-form label { display: block; font-size: .85rem; font-weight: 600; color: var(--text); margin: 0 0 .4rem; }
.kit-form .kit-field label { margin: 0; }
.kit-form :is(.btn, button[type="submit"]) { justify-self: start; }
.kit-contact-card { max-width: 760px; margin: 0 auto; }
.kit-contact-card .kit-head { margin-bottom: 2rem; }
.kit-contact-card .kit-contact-list { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-top: 2rem; }
.kit-map { margin-top: 1.75rem; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--border); aspect-ratio: 16 / 10; background: var(--surface-2); }
.kit-map iframe { width: 100%; height: 100%; border: 0; display: block; }
@media (max-width: 860px) { .kit-contact { grid-template-columns: 1fr; } .kit-form-row { grid-template-columns: 1fr; } }
`,
}
