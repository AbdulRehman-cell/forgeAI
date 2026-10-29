import { SectionDef, list, plain } from '../markup'

export const gallery: SectionDef = {
  type: 'gallery',
  label: 'Gallery — photos of the work, the place, the people',
  variants: { mosaic: 'media', strip: 'media', grid: 'grid' },
  doc: '{"eyebrow","title","intro","items":[{"photo","caption"}] ×3–8}',
  render(c, v, x, tone) {
    const items = list(c.items, 8)
    const figs = items.map((i) => {
      const src = x.photo(i?.photo ?? i)
      return src ? `<figure>${x.img(src, i?.caption ?? '')}${plain(i?.caption) ? `<figcaption>${x.text(i.caption)}</figcaption>` : ''}</figure>` : ''
    }).join('')
    return x.section('gallery', v, tone, c, `<div${x.cls('kit-gallery')}>${figs}</div>`)
  },
  css: `/* Gallery — mosaic: first photo large; every count from 2 to 8 fills the grid */
.kit-gallery { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: clamp(140px, 17vw, 230px); gap: clamp(.6rem, 1.2vw, 1rem); }
.kit-gallery > figure { margin: 0; position: relative; overflow: hidden; border-radius: var(--radius); background: var(--surface-2); }
.kit-gallery img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; transition: transform .5s ease; }
.kit-gallery > figure:hover img { transform: scale(1.05); }
.kit-gallery figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: 2rem 1rem .85rem; background: linear-gradient(0deg, rgba(0,0,0,.66), transparent); color: #fff; font-size: .88rem; font-weight: 600; opacity: 0; transition: opacity .25s ease; }
.kit-gallery > figure:hover figcaption { opacity: 1; }
.kit-gallery > :first-child { grid-column: span 2; grid-row: span 2; }
.kit-gallery:has(> :nth-child(2):last-child) { grid-template-columns: 1fr 1fr; }
.kit-gallery:has(> :nth-child(2):last-child) > * { grid-column: auto; grid-row: span 2; }
.kit-gallery:has(> :nth-child(3):last-child) > :not(:first-child) { grid-column: span 2; }
.kit-gallery:has(> :nth-child(4):last-child) > :last-child { grid-column: span 2; }
.kit-gallery:has(> :nth-child(6):last-child) { grid-template-columns: repeat(3, 1fr); }
.kit-gallery:has(> :nth-child(6):last-child) > :first-child { grid-column: auto; grid-row: auto; }
.kit-gallery:has(> :nth-child(7):last-child) > :nth-child(n+6) { grid-column: span 2; }
.kit-gallery:has(> :nth-child(8):last-child) > :last-child { grid-column: span 2; }
@media (max-width: 640px) {
  .kit-gallery { grid-template-columns: 1fr 1fr !important; grid-auto-rows: 150px; }
  .kit-gallery > * { grid-column: auto !important; grid-row: auto !important; }
  .kit-gallery > :first-child, .kit-gallery > :last-child:nth-child(even) { grid-column: span 2 !important; }
}
.kit-v-strip .kit-gallery { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: clamp(.75rem, 1.5vw, 1.1rem); padding-bottom: .75rem; scrollbar-width: thin; }
.kit-v-strip .kit-gallery > figure:nth-child(n) { flex: 0 0 min(78%, 360px); aspect-ratio: 4 / 5; scroll-snap-align: start; grid-column: auto !important; grid-row: auto !important; }
.kit-v-strip .kit-gallery figcaption { opacity: 1; }
.kit-v-grid .kit-gallery { grid-template-columns: repeat(3, 1fr) !important; grid-auto-rows: auto; }
.kit-v-grid .kit-gallery > figure:nth-child(n) { grid-column: auto !important; grid-row: auto !important; aspect-ratio: 1; }
@media (max-width: 640px) { .kit-v-grid .kit-gallery { grid-template-columns: 1fr 1fr !important; } }
`,
}
