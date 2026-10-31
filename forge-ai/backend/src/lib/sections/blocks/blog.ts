// The blog engine: a story list visitors can filter and search, and a real
// long-form article page (the model writes blocks of text, never markup).

import { Content, Ctx, SectionDef, esc, list, plain } from '../markup'
import { t } from '../strings'

/** An article's body — also the long description on an event page */
export function proseBlocks(c: Content, x: Ctx): { html: string; words: number; toc: { id: string; title: string }[] } {
  let blocks = list(c.blocks, 60)
  // A model that wrote one long string: paragraphs split at blank lines
  if (!blocks.length && typeof c.body === 'string') blocks = c.body.split(/\n\s*\n/).map((p: string) => ({ p }))
  const toc: { id: string; title: string }[] = []
  let words = 0
  const count = (s: string) => { words += s.split(/\s+/).filter(Boolean).length; return s }
  const html = blocks.map((b) => {
    if (typeof b === 'string') return `<p>${x.text(count(b))}</p>`
    if (plain(b.h2 ?? b.h)) {
      const id = `kit-h-${toc.length + 1}`
      toc.push({ id, title: plain(b.h2 ?? b.h) })
      return `<h2 id="${id}">${x.text(count(plain(b.h2 ?? b.h)))}</h2>`
    }
    if (plain(b.h3)) return `<h3>${x.text(count(plain(b.h3)))}</h3>`
    if (plain(b.quote)) return `<blockquote${x.cls('kit-pull')}><p>${x.text(count(plain(b.quote)))}</p>${plain(b.by) ? `<cite>${x.text(b.by)}</cite>` : ''}</blockquote>`
    if (plain(b.note)) return `<aside${x.cls('kit-note')}>${plain(b.title) ? `<strong>${x.text(b.title)}</strong>` : ''}<p>${x.text(count(plain(b.note)))}</p></aside>`
    const items = list(b.list ?? b.steps, 20).map(plain).filter(Boolean)
    if (items.length) {
      const tag = b.steps ? 'ol' : 'ul'
      return `<${tag}>${items.map((i) => `<li>${x.text(count(i))}</li>`).join('')}</${tag}>`
    }
    if (b.photo) {
      const src = x.photo(b.photo)
      return src ? `<figure${x.cls('kit-figure')}>${x.img(src, b.caption)}${plain(b.caption) ? `<figcaption>${x.text(b.caption)}</figcaption>` : ''}</figure>` : ''
    }
    return plain(b.p ?? b.text) ? `<p>${x.text(count(plain(b.p ?? b.text)))}</p>` : ''
  }).join('')
  return { html, words, toc }
}

/** Copy-link and WhatsApp buttons; the engine script does the rest */
export function shareButtons(x: Ctx): string {
  return `<div${x.cls('kit-share')}><span>${x.say('share')}</span><button type="button"${x.cls('kit-share-btn')} data-kit-do="share" data-kit-via="whatsapp">WhatsApp</button><button type="button"${x.cls('kit-share-btn')} data-kit-do="share" data-kit-via="copy" data-kit-done="${x.say('copied')}">${x.say('copyLink')}</button></div>`
}

/** Structured data for search engines: a script tag in HTML, the same through React's escape hatch in JSX */
export function jsonLd(x: Ctx, data: Content): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return x.jsx
    ? `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ${JSON.stringify(json)} }} />`
    : `<script type="application/ld+json">${json}</script>`
}

/** Chips and a search box above a list; empty when a short list does not need them */
export function listControls(x: Ctx, cats: string[], searchLabel: string, withSearch: boolean): string {
  const chips = cats.length > 1
    ? `<div${x.cls('kit-chips')} role="group">${['', ...cats].map((cat, i) => `<button type="button"${x.cls('kit-chip')} data-kit-do="chip" data-kit-chip="${esc(cat)}" aria-pressed="${i ? 'false' : 'true'}">${cat ? esc(cat) : x.say('allTopics')}</button>`).join('')}</div>`
    : ''
  const id = x.uid('kl')
  const find = withSearch
    ? `<div${x.cls('kit-find')}><label${x.cls('kit-sr')} ${x.jsx ? 'htmlFor' : 'for'}="${id}">${esc(searchLabel)}</label><input id="${id}" type="search" data-kit-find="1" placeholder="${esc(searchLabel)}" ${x.jsx ? 'autoComplete="off" />' : 'autocomplete="off">'}</div>`
    : ''
  return chips || find ? `<div${x.cls('kit-list-bar')}>${chips}${find}</div>` : ''
}

function postMarkup(p: Content, x: Ctx, lead: boolean): string {
  const src = p.photo === false ? '' : x.photo(p.photo)
  const href = plain(p.href ?? p.url)
  const title = plain(p.title)
  const cat = plain(p.category ?? p.badge)
  const meta = [plain(p.date), plain(p.readTime ?? p.time), plain(p.author)].filter(Boolean)
  const page = x.localPage(href)
  const heading = x.anchor(href, '', x.text(title))
  const find = `${title} ${cat} ${plain(p.text)} ${plain(p.author)}`
  return `<article${x.cls('kit-post', lead && 'kit-post-lead')} data-kit-item="1" data-cat="${esc(cat)}" data-find="${esc(find)}"${page ? ` data-kit-page="${esc(page)}"` : ''}>${src ? `<div${x.cls('kit-post-media')}>${x.img(src, title)}</div>` : ''}<div${x.cls('kit-post-body')}>${cat ? `<span${x.cls('kit-post-cat')}>${esc(cat)}</span>` : ''}<h3>${heading}</h3>${plain(p.text) ? `<p>${x.text(p.text)}</p>` : ''}${meta.length ? `<p${x.cls('kit-post-meta')}>${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</p>` : ''}</div></article>`
}

export const blogIndex: SectionDef = {
  type: 'blog-index',
  label: 'Story list — articles, recipes or news with a photo, topic, date and teaser; 4+ stories get topic filters, search and "show more"',
  variants: { grid: 'grid', magazine: 'grid', list: 'list' },
  doc: '{"eyebrow","title","intro","link":{label,href},"posts":[{"title","href":"its article page","photo","category","date":"12 March 2026","readTime":"6 min read","author","text":"one-line teaser"}] ×3–12} — magazine makes the first story large; use 3 stories on an article page for "related stories"',
  render(c, v, x, tone) {
    const posts = list(c.posts ?? c.items, 24).filter((p) => plain(p?.title))
    const cats = [...new Set(posts.map((p) => plain(p.category ?? p.badge)).filter(Boolean))].slice(0, 8)
    const interactive = posts.length >= 4
    const controls = interactive ? listControls(x, cats, t(x.lang, 'searchStories'), posts.length >= 6) : ''
    const none = interactive ? `<p${x.cls('kit-list-none')} data-kit-none="1" hidden>${x.say('noResults')}</p>` : ''
    const more = posts.length > 9 ? `<div${x.cls('kit-list-more')}><button type="button"${x.cls('btn btn-secondary')} data-kit-do="more">${x.say('loadMore')}</button></div>` : ''
    const items = posts.map((p, i) => postMarkup(p, x, v === 'magazine' && i === 0)).join('')
    const action = c.link ? x.link(c.link, 'btn btn-secondary') : ''
    const attrs = interactive ? ' data-kit-engine="list" data-kit-page-size="9"' : ''
    return x.section('blog-index', v, tone, c, `<div${x.cls('kit-post-list')}${attrs}>${controls}<div${x.cls('kit-posts')}>${items}</div>${none}${more}</div>`, { action })
  },
  css: `/* Story list */
.kit-list-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .85rem 1.5rem; margin: 0 0 clamp(1.5rem, 3vw, 2.25rem); }
.kit-chips { display: flex; flex-wrap: wrap; gap: .45rem; }
.kit-chip { min-height: 42px; padding: .45rem 1rem; border-radius: 999px; border: 1px solid var(--border-strong); background: transparent; color: var(--text); font: inherit; font-size: .9rem; font-weight: 600; cursor: pointer; transition: background .2s ease, color .2s ease, border-color .2s ease; }
.kit-chip:hover { border-color: var(--primary); }
.kit-chip[aria-pressed="true"] { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.kit-find { flex: 0 1 300px; min-width: min(100%, 220px); }
.kit-find input { width: 100%; min-height: 46px; padding: .6rem 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); font: inherit; }
.kit-find input:focus { outline: none; border-color: var(--primary); box-shadow: var(--ring); }
.kit-list-none { text-align: center; color: var(--muted); padding: 2.5rem 0; margin: 0; }
.kit-list-more { display: flex; justify-content: center; margin-top: 2rem; }
.kit-posts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: clamp(1.5rem, 3vw, 2.5rem) clamp(1.25rem, 2.5vw, 2rem); }
.kit-post { display: flex; flex-direction: column; min-width: 0; position: relative; }
.kit-post-media { aspect-ratio: 3 / 2; border-radius: var(--radius-lg); overflow: hidden; background: var(--surface-2); margin: 0 0 1rem; }
.kit-post-media img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; transition: transform .45s ease; }
.kit-post:hover .kit-post-media img { transform: scale(1.04); }
.kit-post-body { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.kit-post-cat { font-size: .74rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--primary-ink); margin: 0 0 .45rem; }
.kit-post h3 { font-size: 1.22rem; line-height: 1.3; margin: 0 0 .5rem; }
.kit-post h3 a { color: inherit; text-decoration: none; }
/* The whole card opens the story */
.kit-post h3 a::after { content: ''; position: absolute; inset: 0; }
.kit-post:hover h3 a { color: var(--primary-ink); }
.kit-post-body > p:not(.kit-post-meta) { color: var(--muted); font-size: .96rem; line-height: 1.6; margin: 0 0 .7rem; }
.kit-post-meta { display: flex; flex-wrap: wrap; gap: .2rem .9rem; font-size: .82rem; color: var(--muted); margin: 0; }
.kit-v-magazine .kit-post-lead { grid-column: 1 / -1; flex-direction: row; align-items: center; gap: clamp(1.25rem, 4vw, 3rem); }
.kit-v-magazine .kit-post-lead .kit-post-media { flex: 0 0 56%; margin: 0; aspect-ratio: 16 / 10; }
.kit-v-magazine .kit-post-lead h3 { font-size: clamp(1.5rem, 1.1rem + 1.5vw, 2.2rem); line-height: 1.18; }
.kit-v-list .kit-posts { grid-template-columns: 1fr; gap: 0; max-width: 920px; margin-inline: auto; }
.kit-v-list .kit-post { flex-direction: row; gap: clamp(1rem, 3vw, 2rem); padding: 1.5rem 0; border-bottom: 1px solid var(--border); }
.kit-v-list .kit-post-media { flex: 0 0 min(30%, 240px); margin: 0; }
@media (max-width: 720px) {
  .kit-v-magazine .kit-post-lead { flex-direction: column; align-items: stretch; gap: 0; }
  .kit-v-magazine .kit-post-lead .kit-post-media { flex-basis: auto; margin-bottom: 1rem; }
  .kit-find { flex: 1 1 100%; }
}
@media (max-width: 480px) {
  .kit-v-list .kit-post { flex-direction: column; }
  .kit-v-list .kit-post-media { flex-basis: auto; }
}
`,
}

export const article: SectionDef = {
  type: 'article',
  label: 'Full article — the whole story on its own page: headline, author, photos, sub-headings, quotes, lists, contents, reading progress and sharing',
  variants: { column: 'list', sidebar: 'split' },
  doc: '{"category","title","lead":"one or two sentences under the headline","author":{"name","role","bio":"one sentence"},"date":"12 March 2026","photo","back":{label,href},"blocks":[{"p":"a paragraph"}, {"h2":"a sub-heading"}, {"h3":"…"}, {"quote":"…","by":"…"}, {"list":["…"]}, {"steps":["…"]}, {"note":"a tip or warning","title":"Tip"}, {"photo":"3","caption":"…"}] ×12–30,"tags":["…"]} — 500+ words of real writing; it OPENS its page, with NO <forge-hero> before it; sidebar adds a contents list beside the text',
  render(c, v, x, tone) {
    const { html, words, toc } = proseBlocks(c, x)
    if (!html) throw new Error('an article with no text')
    const author = c.author && typeof c.author === 'object' ? c.author as Content : { name: c.author }
    const name = plain(author.name)
    const minutes = Math.max(1, Math.round(words / 200))
    const meta = [esc(plain(c.date)), x.say('minRead', { n: minutes })].filter(Boolean)
    const src = c.photo === false ? '' : x.photo(c.photo)
    const back = c.back ? x.link(c.back, 'kit-article-back') : ''
    const top = `<div${x.cls('kit-article-top')}>${back}${plain(c.category) ? `<span${x.cls('kit-post-cat')}>${x.text(c.category)}</span>` : ''}<h1>${x.text(c.title)}</h1>${plain(c.lead ?? c.intro) ? `<p${x.cls('kit-article-lead')}>${x.text(c.lead ?? c.intro)}</p>` : ''}<div${x.cls('kit-article-by')}>${name ? `<span${x.cls('kit-avatar')}>${x.initials(name)}</span>` : ''}<div>${name ? `<strong>${esc(name)}</strong>` : ''}<span>${meta.join(' · ')}</span></div></div></div>`
    const cover = src ? `<figure${x.cls('kit-article-cover')}>${x.img(src, c.title, undefined, true)}</figure>` : ''
    const tags = list(c.tags, 8).map(plain).filter(Boolean)
    const foot = `<div${x.cls('kit-article-foot')}>${tags.length ? `<ul${x.cls('kit-tags')}>${tags.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}${shareButtons(x)}</div>`
    const bio = name && plain(author.bio) ? `<div${x.cls('kit-article-bio')}><span${x.cls('kit-avatar')}>${x.initials(name)}</span><div><strong>${esc(name)}</strong>${plain(author.role) ? `<span>${x.text(author.role)}</span>` : ''}<p>${x.text(author.bio)}</p></div></div>` : ''
    const contents = v === 'sidebar' && toc.length >= 2
      // Not a <nav>: site stylesheets style every nav as the top menu
      ? `<div${x.cls('kit-toc')} role="navigation" aria-label="${x.say('contents')}"><strong>${x.say('contents')}</strong><ol>${toc.map((h) => `<li><a href="#${h.id}" data-kit-do="jump" data-kit-to="${h.id}">${esc(h.title)}</a></li>`).join('')}</ol></div>`
      : ''
    const prose = `<div${x.cls('kit-prose')}>${html}${foot}${bio}</div>`
    const ld = jsonLd(x, {
      '@context': 'https://schema.org', '@type': 'Article', headline: plain(c.title), description: plain(c.lead ?? c.intro) || undefined,
      image: /^https?:/.test(src) ? src : undefined, author: name ? { '@type': 'Person', name } : undefined,
      wordCount: words,
    })
    return `<section${x.cls('kit-section', 'kit-sec-article', `kit-v-${v}`, tone)} data-kit="article"><div${x.cls('kit-progress')} data-kit-progress="1" aria-hidden="true"></div><div${x.cls('container')}><article${x.cls('kit-article')} data-kit-engine="article">${top}${cover}<div${x.cls('kit-article-main', contents && 'has-toc')}>${contents}${prose}</div></article></div>${ld}</section>`
  },
  css: `/* Article */
.kit-sec-article { padding-block: clamp(36px, 6vw, 72px) clamp(56px, 8vw, 96px); }
.kit-progress { position: fixed; inset-inline-start: 0; top: 0; z-index: 300; height: 3px; width: 100%; background: var(--primary); transform: scaleX(0); transform-origin: 0 50%; pointer-events: none; }
.kit-article-top { max-width: 780px; margin: 0 auto clamp(1.5rem, 3vw, 2.25rem); }
.kit-article-back { display: inline-block; font-size: .9rem; font-weight: 600; color: var(--muted); text-decoration: none; margin: 0 0 1.25rem; }
.kit-article-back:hover { color: var(--primary-ink); }
.kit-article-back::before { content: '←'; margin-inline-end: .4rem; }
.kit-article-top .kit-post-cat { display: block; }
.kit-article-top h1 { font-size: clamp(2rem, 1.3rem + 3vw, 3.4rem); line-height: 1.1; margin: 0 0 1rem; color: var(--text); }
.kit-article-lead { font-size: clamp(1.1rem, 1rem + .5vw, 1.35rem); line-height: 1.55; color: var(--muted); margin: 0 0 1.5rem; }
.kit-article-by { display: flex; align-items: center; gap: .8rem; }
.kit-article-by > div { display: flex; flex-direction: column; font-size: .9rem; color: var(--muted); line-height: 1.4; }
.kit-article-by strong { color: var(--text); font-size: .98rem; }
.kit-article-cover { margin: 0 auto clamp(2rem, 4vw, 3.25rem); max-width: 1040px; aspect-ratio: 16 / 9; border-radius: var(--radius-xl); overflow: hidden; background: var(--surface-2); }
.kit-article-cover img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 0 !important; }
.kit-article-main { max-width: 720px; margin: 0 auto; }
.kit-article-main.has-toc { max-width: 1040px; display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: clamp(2rem, 5vw, 4rem); align-items: start; }
.kit-toc { position: sticky; top: 104px; font-size: .9rem; display: block; }
.kit-toc strong { display: block; font-size: .76rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: .7rem; }
.kit-toc ol { list-style: none; margin: 0; padding: 0; display: grid; gap: .1rem; border-inline-start: 2px solid var(--border); }
.kit-toc a { display: block; padding: .4rem .85rem; margin-inline-start: -2px; border-inline-start: 2px solid transparent; color: var(--muted); text-decoration: none !important; line-height: 1.35; }
.kit-toc a:hover { color: var(--text); }
.kit-toc a.is-on { color: var(--primary-ink); border-inline-start-color: var(--primary); font-weight: 700; }
.kit-prose { font-size: clamp(1.05rem, 1rem + .2vw, 1.15rem); line-height: 1.8; color: var(--text); min-width: 0; }
.kit-prose > p { margin: 0 0 1.35em; color: var(--text); }
.kit-prose h2 { font-size: clamp(1.45rem, 1.2rem + 1vw, 1.95rem); line-height: 1.22; margin: 2em 0 .65em; scroll-margin-top: 104px; }
.kit-prose h3 { font-size: 1.22rem; line-height: 1.3; margin: 1.7em 0 .5em; }
.kit-prose > :is(ul, ol) { margin: 0 0 1.5em; padding-inline-start: 1.4em; display: grid; gap: .5em; }
.kit-prose > ul { list-style: disc; }
.kit-prose > ol { list-style: decimal; }
.kit-prose > :is(ul, ol) li { display: list-item; list-style: inherit; color: var(--text); }
.kit-prose li::marker { color: var(--primary-ink); font-weight: 700; }
.kit-pull { margin: 2em 0; padding: .25em 0 .25em 1.4em; border-inline-start: 3px solid var(--primary); background: none; box-shadow: none; }
.kit-pull p { font-family: var(--font-heading); font-size: 1.32em; line-height: 1.4; margin: 0; color: var(--text); }
.kit-pull cite { display: block; margin-top: .6em; font-size: .85em; font-style: normal; color: var(--muted); }
.kit-note { margin: 1.75em 0; padding: 1.1rem 1.3rem; border-radius: var(--radius); background: color-mix(in srgb, var(--primary) 9%, var(--bg)); }
.kit-note strong { display: block; color: var(--primary-ink); margin-bottom: .2rem; }
.kit-note p { margin: 0; font-size: .96em; line-height: 1.65; }
.kit-figure { margin: 2em 0; }
.kit-figure img { width: 100%; height: auto; display: block; border-radius: var(--radius-lg); }
.kit-figure figcaption { margin-top: .6em; font-size: .85rem; line-height: 1.5; color: var(--muted); }
.kit-article-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
.kit-tags { list-style: none; display: flex; flex-wrap: wrap; gap: .4rem; margin: 0; padding: 0; }
.kit-tags li { padding: .25rem .75rem; border-radius: 999px; background: var(--surface-2); font-size: .82rem; color: var(--muted); }
.kit-share { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem; font-size: .88rem; color: var(--muted); }
.kit-share-btn { min-height: 40px; padding: .35rem .9rem; border-radius: 999px; border: 1px solid var(--border-strong); background: transparent; color: var(--text); font: inherit; font-size: .86rem; font-weight: 600; cursor: pointer; }
.kit-share-btn:hover { border-color: var(--primary); color: var(--primary-ink); }
.kit-article-bio { display: flex; gap: 1rem; margin-top: 1.75rem; padding: 1.35rem; border-radius: var(--radius-lg); background: var(--surface); }
.kit-article-bio strong { display: block; font-size: 1rem; line-height: 1.3; }
.kit-article-bio span:not(.kit-avatar) { display: block; font-size: .85rem; color: var(--muted); }
.kit-article-bio p { margin: .5rem 0 0; font-size: .94rem; line-height: 1.6; color: var(--muted); }
@media (max-width: 900px) {
  .kit-article-main.has-toc { grid-template-columns: 1fr; gap: 1.75rem; max-width: 720px; }
  .kit-toc { position: static; padding: 1rem 1.2rem; border-radius: var(--radius); background: var(--surface); }
}
`,
}
