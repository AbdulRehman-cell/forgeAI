import { SectionDef, list, plain } from '../markup'

export const team: SectionDef = {
  type: 'team',
  label: 'Team — the people (staff, clinicians, coaches, speakers)',
  variants: { grid: 'grid', compact: 'list' },
  doc: '{"eyebrow","title","intro","items":[{"name","role","text","photo"}] ×3–8} — a "photo" only when the PHOTO LIBRARY has a fitting portrait; otherwise leave it out and initials are shown',
  render(c, v, x, tone) {
    const items = list(c.items, 8).filter((i) => plain(i?.name))
    const body = items.map((i) => {
      // Only a photo the content names — a random library photo is never a person
      const photo = v === 'grid' && plain(i.photo) ? x.photo(i.photo) : ''
      const face = photo
        ? `<div${x.cls('kit-person-photo')}>${x.img(photo, i.name)}</div>`
        : `<div${x.cls('kit-person-photo', 'kit-person-initials')}><span>${x.initials(i.name)}</span></div>`
      return `<article${x.cls('kit-person')}>${v === 'grid' ? face : `<span${x.cls('kit-avatar')}>${x.initials(i.name)}</span>`}<div><h3>${x.text(i.name)}</h3>${plain(i.role) ? `<p${x.cls('kit-person-role')}>${x.text(i.role)}</p>` : ''}${plain(i.text) ? `<p>${x.text(i.text)}</p>` : ''}</div></article>`
    }).join('')
    return x.section('team', v, tone, c, `<div${x.cls('kit-team')}>${body}</div>`)
  },
  css: `/* Team */
.kit-team { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); gap: clamp(1.25rem, 2.5vw, 2rem); }
.kit-person h3 { font-size: 1.1rem; margin: 0 0 .2rem; }
.kit-person p { margin: 0; color: var(--muted); font-size: .94rem; line-height: 1.55; }
.kit-person .kit-person-role { color: var(--primary-ink); font-weight: 600; font-size: .86rem; margin-bottom: .45rem; }
.kit-person-photo { aspect-ratio: 4 / 5; border-radius: var(--radius-lg); overflow: hidden; background: var(--surface-2); margin-bottom: 1rem; }
.kit-person-photo img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; }
.kit-person-initials { display: grid; place-items: center; background: color-mix(in srgb, var(--primary) 14%, var(--surface)); }
.kit-person-initials span { font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: clamp(2.4rem, 4vw, 3.2rem); color: var(--primary-ink); }
.kit-v-compact .kit-team { grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
.kit-v-compact .kit-person { display: flex; gap: 1rem; align-items: flex-start; padding: 1.25rem; border-radius: var(--radius-lg); background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); }
.kit-v-compact .kit-avatar { width: 52px; height: 52px; }
`,
}
