import { Content, SectionDef, list, plain } from '../markup'

export const split: SectionDef = {
  type: 'split',
  label: 'Split — a photo beside a short story (about, the team, the space, one service)',
  variants: { alternate: 'split', reverse: 'split', overlap: 'split' },
  doc: '{"items":[{"eyebrow","title","text","points":["…"] ×0–4,"photo","button":{label,href}}] ×1–3} — several items alternate sides',
  render(c, v, x, tone) {
    const items: Content[] = list(c.items, 3).length ? list(c.items, 3) : [c]
    const body = items.filter((i) => plain(i?.title)).map((i, n) => {
      const reverse = (v === 'reverse') !== (n % 2 === 1)
      const points = list(i.points, 5).map((p) => plain(p)).filter(Boolean)
      const button = x.link(i.button, 'btn btn-primary')
      return `<div${x.cls('kit-split', reverse && 'kit-split-reverse')}><figure${x.cls('kit-split-media')}>${x.img(x.photo(i.photo), i.title)}</figure><div${x.cls('kit-split-body')}>${plain(i.eyebrow) ? `<span${x.cls('eyebrow')}>${x.text(i.eyebrow)}</span>` : ''}<h2>${x.text(i.title)}</h2>${plain(i.text) ? `<p>${x.text(i.text)}</p>` : ''}${points.length ? `<ul${x.cls('kit-checks')}>${points.map((p) => `<li>${x.text(p)}</li>`).join('')}</ul>` : ''}${button ? `<div${x.cls('kit-actions')}>${button}</div>` : ''}</div></div>`
    }).join('')
    return x.section('split', v, tone, c, body, { noHead: !list(c.items, 3).length })
  },
  css: `/* Split */
.kit-split { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(2rem, 5vw, 4.5rem); align-items: center; }
.kit-split + .kit-split { margin-top: clamp(3rem, 7vw, 5.5rem); }
.kit-split-reverse > .kit-split-media { order: 2; }
.kit-split-media { margin: 0; border-radius: var(--radius-lg); overflow: hidden; aspect-ratio: 4 / 3; box-shadow: var(--shadow-lg); background: var(--surface-2); }
.kit-split-media img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; }
.kit-split-body h2 { margin: .35rem 0 1rem; }
.kit-split-body > p { color: var(--muted); font-size: 1.05rem; line-height: 1.7; }
.kit-v-overlap .kit-split { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 0; }
.kit-v-overlap .kit-split-reverse { grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr); }
.kit-v-overlap .kit-split-media { aspect-ratio: 5 / 4; box-shadow: none; }
.kit-v-overlap .kit-split-body { position: relative; z-index: 1; background: var(--bg); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); padding: clamp(1.75rem, 4vw, 3rem); margin-left: clamp(-120px, -8vw, -48px); }
.kit-v-overlap .kit-split-reverse .kit-split-body { margin-left: 0; margin-right: clamp(-120px, -8vw, -48px); }
.kit-alt.kit-v-overlap .kit-split-body { background: var(--bg); }
@media (max-width: 860px) {
  .kit-split, .kit-v-overlap .kit-split, .kit-v-overlap .kit-split-reverse { grid-template-columns: 1fr; }
  .kit-split-reverse > .kit-split-media { order: 0; }
  .kit-v-overlap .kit-split-body, .kit-v-overlap .kit-split-reverse .kit-split-body { margin: -56px 14px 0; }
}
`,
}
