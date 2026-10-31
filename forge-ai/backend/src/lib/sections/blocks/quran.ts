// Quran sections. The model only ever writes references ("2:255", "Al-Kahf");
// every verse is filled in from the verified pack (lib/quran), and the reader,
// bookmarks and search load the site's own copy of it in the browser
// (lib/quran/client.ts). Offered only to sites about the Quran or Islam.

import { Ctx, SectionDef, esc, list, plain } from '../markup'
import { translationFor } from '../../quran/editions'
import { splitBasmala } from '../../quran/pack'
import { arabicDigits, qt, surahName } from '../../quran/ui'

/** Well-known verses for "verse of the day" — references only; the text comes from the pack */
export const DAILY_AYAT = [
  '2:152', '2:153', '2:186', '2:201', '2:286', '3:8', '3:139', '3:173', '7:56', '9:51', '13:28', '14:7',
  '17:24', '20:114', '25:63', '29:69', '33:41', '39:53', '40:60', '49:13', '57:4', '65:3', '93:5', '94:6',
]

/** A quoted passage never runs longer than this — the reader is for whole surahs */
const MAX_AYAHS = 10

/**
 * A verified passage as a figure: the Arabic in the Quran face, right to
 * left with verse numbers, its translation, and the reference. Null when the
 * reference does not exist or its surah failed the pack's check.
 */
export function quranFigure(x: Ctx, ref: string, opts: { cls?: string; translation?: boolean; link?: unknown } = {}): string | null {
  const q = x.quranText?.()
  if (!q) return null
  let p = q.passage(ref)
  if (!p) return null
  if (p.verses.length > MAX_AYAHS) p = q.passage({ ...p.ref, to: p.ref.from + MAX_AYAHS - 1 })
  if (!p) return null
  const tr = opts.translation === false ? undefined : translationFor(x.lang)?.id
  const basmala = q.passage('1:1')?.verses[0].text['quran-uthmani'] ?? ''
  let lead = ''
  const arabic = p.verses.map((v) => {
    let text = v.text['quran-uthmani']
    // Tanzil's text opens ayah 1 with the Basmala; it is set on its own line, every letter unchanged
    const split = v.ayah === 1 && v.surah !== 1 && v.surah !== 9 ? splitBasmala(text, basmala) : null
    if (split) {
      lead = `<p${x.cls('kit-ayah-basmala')} lang="ar" dir="rtl">${esc(split[0])}</p>`
      text = split[1]
    }
    return `${esc(text)} <span${x.cls('kit-ayah-num')}>${arabicDigits(v.ayah)}</span>`
  }).join(' ')
  const many = p.verses.length > 1
  const translation = tr && p.verses.every((v) => v.text[tr])
    ? `<p${x.cls('kit-ayah-tr')}>${p.verses.map((v) => `${many ? `<span${x.cls('kit-ayah-n')}>${v.ayah}</span> ` : ''}${esc(v.text[tr])}`).join(' ')}</p>`
    : ''
  const span = p.ref.from === p.ref.to ? `${p.ref.surah}:${p.ref.from}` : `${p.ref.surah}:${p.ref.from}–${p.ref.to}`
  const words = `${surahName(x.lang, p.surah)} · ${span}`
  const caption = opts.link ? x.link({ label: words, href: opts.link }, 'kit-ayah-ref') : `<span${x.cls('kit-ayah-ref')}>${esc(words)}</span>`
  const id = p.ref.from === p.ref.to ? `${p.ref.surah}:${p.ref.from}` : `${p.ref.surah}:${p.ref.from}-${p.ref.to}`
  return `<figure${x.cls('kit-ayah', opts.cls)} data-quran="${id}">${lead}<p${x.cls('kit-ayah-ar')} lang="ar" dir="rtl">${arabic}</p>${translation}<figcaption>${caption}</figcaption></figure>`
}

const readerHref = (x: Ctx, v: unknown) => x.href(plain(v) || 'reader')

/** A link to the reader at a surah — a router <Link> in React apps */
function readerLink(x: Ctx, href: string, attrs: string, inner: string): string {
  if (x.jsx) {
    x.needsLink = true
    return `<Link${x.cls('kit-surah')} to="${esc(href)}"${attrs}>${inner}</Link>`
  }
  return `<a${x.cls('kit-surah')} href="${esc(href)}"${attrs}>${inner}</a>`
}

export const quranVerse: SectionDef = {
  type: 'quran-verse',
  label: 'Quran verse — one verse in large Arabic with its translation, or a verse of the day',
  variants: { card: 'band', banner: 'band' },
  doc: '{"eyebrow","title","ref":"2:255" (a range like "2:255-257" shows up to 10 ayahs),"note":"one sentence in your own words about the verse","link":{label,href}} — for a verse of the day give "daily":true instead of "ref" (ForgeAI rotates well-known verses), or "daily":true with "refs":["…"] ×3–30 of your choosing',
  ownTone: ['banner'],
  leaves: () => 'dark',
  quran: true,
  render(c, v, x, tone) {
    const own = list(c.refs, 30).map(plain).filter(Boolean)
    const daily = c.daily === true || c.daily === 'true'
    const refs = daily ? (own.length >= 2 ? own : DAILY_AYAT) : [plain(c.ref) || own[0] || '']
    const figures = refs.map((r) => (r ? quranFigure(x, r) : null)).filter((f): f is string => !!f)
    if (!figures.length) throw new Error(x.quranText?.() ? `there is no verse "${refs[0]}"` : 'the Quran data pack is missing')
    const body = figures.length > 1
      ? `<div${x.cls('kit-ayah-daily')} data-quran-daily="1">${figures.map((f, i) => `<div data-day="${i}"${i ? ' hidden' : ''}>${f}</div>`).join('')}</div>`
      : figures[0]
    const head = { ...c, eyebrow: plain(c.eyebrow) || (figures.length > 1 ? qt(x.lang, 'verseOfDay') : '') }
    const after = `${plain(c.note) ? `<p${x.cls('kit-ayah-note')}>${x.text(c.note)}</p>` : ''}${c.link ? `<div${x.cls('kit-actions', 'kit-ayah-actions')}>${x.link(c.link, v === 'banner' ? 'btn btn-primary' : 'btn btn-secondary')}</div>` : ''}`
    if (v === 'banner') {
      return `<section${x.cls('kit-section', 'kit-dark', 'kit-sec-quran-verse', 'kit-v-banner')} data-kit="quran-verse"><div${x.cls('container')}>${x.head(head)}${body}${after}</div></section>`
    }
    return x.section('quran-verse', v, tone, head, `<div${x.cls('kit-ayah-card')}>${body}${after}</div>`)
  },
  css: '',
}

export const quranSurahs: SectionDef = {
  type: 'quran-surahs',
  label: 'Surah list — all 114 surahs with names, meanings, ayah counts and Meccan/Medinan, a filter, and "continue reading"; each opens the reader',
  variants: { grid: 'grid', list: 'list' },
  doc: '{"eyebrow","title","intro","reader":"the reader page (default reader)"} — ForgeAI writes all 114 surahs',
  quran: true,
  render(c, v, x, tone) {
    const q = x.quranText?.()
    if (!q) throw new Error('the Quran data pack is missing')
    const reader = readerHref(x, c.reader)
    const en = x.lang !== 'ur' && x.lang !== 'ar'
    const items = q.surahs.map((s) => {
      const meta = `${en ? `${esc(s.meaning)} · ` : ''}${esc(qt(x.lang, s.type === 'Medinan' ? 'medinan' : 'meccan'))} · ${esc(qt(x.lang, 'ayahs', s.ayahs))}`
      const names = `<span${x.cls('kit-surah-names')}><strong${en ? '' : ' lang="ar"'}>${esc(surahName(x.lang, s))}</strong><small>${meta}</small></span>`
      const inner = `<span${x.cls('kit-surah-n')}>${s.n}</span>${names}${en ? `<span${x.cls('kit-surah-ar')} lang="ar" dir="rtl">${esc(s.ar)}</span>` : ''}`
      return readerLink(x, `${reader}?s=${s.n}`, ` data-n="${s.n}" data-find="${esc(`${s.n} ${s.name} ${s.meaning} ${s.ar}`)}"`, inner)
    }).join('')
    const id = x.uid('kq')
    const bar = `<div${x.cls('kit-surahs-bar')}><label${x.cls('kit-sr')} ${x.jsx ? 'htmlFor' : 'for'}="${id}">${esc(qt(x.lang, 'filter'))}</label><input id="${id}" type="search" data-quran-filter="1" placeholder="${esc(qt(x.lang, 'filter'))}" ${x.jsx ? 'autoComplete="off" />' : 'autocomplete="off">'}<div${x.cls('kit-surahs-continue')} data-quran-continue="1" data-reader="${esc(reader)}" hidden></div></div>`
    const none = `<p${x.cls('kit-q-empty')} data-quran-none="1" hidden>${esc(qt(x.lang, 'noSurah'))}</p>`
    return x.section('quran-surahs', v, tone, c, `${bar}<div${x.cls('kit-surahs')} data-quran="surahs" data-quran-pack="1">${items}</div>${none}`)
  },
  css: '',
}

export const quranReader: SectionDef = {
  type: 'quran-reader',
  label: 'Quran reader — any surah in Arabic with translation, recitation per ayah or the whole surah, bookmarks, copy/share, text size; remembers where the visitor stopped',
  variants: { page: 'list' },
  doc: '{"audio":true} — put it on its own page (the reader page), straight after the page hero; "audio":false leaves out the recitation',
  quran: true,
  render(c, v, x, tone) {
    const audio = c.audio !== false && c.audio !== 'false'
    // React renders the container empty: the script owns everything inside it
    const loading = x.jsx ? '' : `<p${x.cls('kit-q-status')}>${esc(qt(x.lang, 'loading'))}</p>`
    return x.section('quran-reader', v, tone, c, `<div${x.cls('kit-reader')} data-quran="reader" data-quran-pack="1" data-quran-reader="1"${audio ? ' data-quran-audio="1"' : ''}>${loading}</div>`)
  },
  css: '',
}

export const quranBookmarks: SectionDef = {
  type: 'quran-bookmarks',
  label: 'Bookmarks — the verses this visitor saved in the reader, kept on their device',
  variants: { list: 'list' },
  doc: '{"eyebrow","title","intro","reader":"the reader page (default reader)"} — on its own page (bookmarks)',
  quran: true,
  render(c, v, x, tone) {
    return x.section('quran-bookmarks', v, tone, c, `<div${x.cls('kit-bookmarks')} data-quran="bookmarks" data-quran-pack="1" data-quran-bookmarks="1" data-reader="${esc(readerHref(x, c.reader))}"></div>`)
  },
  css: '',
}

export const quranSearch: SectionDef = {
  type: 'quran-search',
  label: 'Quran search — search every verse, in Arabic or the translation; a reference like 2:255 opens the reader',
  variants: { bar: 'list' },
  doc: '{"eyebrow","title","intro","reader":"the reader page (default reader)"} — a search page receives ?q= from other search boxes',
  quran: true,
  render(c, v, x, tone) {
    const id = x.uid('kq')
    const form = `<form${x.cls('kit-q-search')} role="search" data-quran="search" data-quran-pack="1" data-quran-search="1" data-reader="${esc(readerHref(x, c.reader))}"><label${x.cls('kit-sr')} ${x.jsx ? 'htmlFor' : 'for'}="${id}">${esc(qt(x.lang, 'search'))}</label><input id="${id}" type="search" name="q" placeholder="${esc(qt(x.lang, 'searchPlaceholder'))}"${x.jsx ? ' />' : '>'}<button type="submit"${x.cls('btn btn-primary')}>${esc(qt(x.lang, 'search'))}</button></form>`
    return x.section('quran-search', v, tone, c, `${form}<div${x.cls('kit-q-results')} data-quran-results="1" aria-live="polite"></div>`)
  },
  css: '',
}

export const QURAN_SECTIONS = [quranVerse, quranSurahs, quranReader, quranBookmarks, quranSearch]

export const QURAN_CSS = `/* ── Quran ── */
:root { --kit-quran-font: 'Amiri Quran', 'Amiri', 'Noto Naskh Arabic', 'Scheherazade New', serif; }
/* Direction comes from each element's dir="rtl", never from CSS: a right-to-left site's whole
   sheet is mirrored by rtlcss, which would turn "direction: rtl" into "ltr" */
.kit-ayah-ar, .kit-ayah-basmala, .kit-q-ar, .kit-q-basmala, .kit-q-name-ar, .kit-surah-ar { font-family: var(--kit-quran-font) !important; font-weight: 400 !important; letter-spacing: 0 !important; font-style: normal !important; unicode-bidi: isolate; }
.kit-ayah { margin: 0 auto; max-width: 880px; text-align: center; }
.kit-ayah-basmala { font-size: clamp(1.35rem, 1.1rem + 1vw, 1.8rem); line-height: 2.1 !important; margin: 0 0 .5rem; color: var(--muted); text-align: center; }
.kit-ayah-ar { font-size: clamp(1.75rem, 1.2rem + 2vw, 2.7rem); line-height: 2.3 !important; color: var(--text); margin: 0 0 1.2rem; text-align: center; }
.kit-ayah-num { display: inline-grid; place-items: center; min-width: 1.8em; height: 1.8em; padding: 0 .3em; margin-inline: .2em; border: 1.5px solid color-mix(in srgb, var(--primary) 50%, transparent); border-radius: 999px; font-size: .5em; line-height: 1; vertical-align: .4em; color: var(--primary-ink); font-family: var(--kit-quran-font); }
.kit-ayah-tr { font-size: clamp(1.02rem, .96rem + .3vw, 1.2rem); line-height: 1.75; color: var(--muted); margin: 0 auto 1.1rem; max-width: 62ch; }
.kit-ayah-n { font-size: .75em; font-weight: 700; color: var(--primary-ink); vertical-align: .2em; }
.kit-ayah figcaption { margin: 0; }
.kit-ayah-ref { display: inline-block; font-size: .9rem; font-weight: 700; color: var(--primary-ink); text-decoration: none; letter-spacing: .02em; }
a.kit-ayah-ref:hover { text-decoration: underline; }
.kit-ayah-note { max-width: 60ch; margin: 1.25rem auto 0; text-align: center; color: var(--muted); }
.kit-ayah-actions { justify-content: center; margin-top: 1.5rem; }
.kit-ayah-card { max-width: 920px; margin: 0 auto; padding: clamp(1.75rem, 5vw, 3.5rem) clamp(1.25rem, 5vw, 3.5rem); background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); border-radius: var(--radius-xl); }
.kit-ayah-inline { margin: clamp(1.75rem, 4vw, 2.75rem) auto; padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1.1rem, 4vw, 2.5rem); background: color-mix(in srgb, var(--primary) 6%, var(--bg)); border-radius: var(--radius-lg); }
.kit-ayah-inline .kit-ayah-ar { font-size: clamp(1.5rem, 1.15rem + 1.4vw, 2.2rem); }
.kit-ayah-daily > [hidden] { display: none !important; }
.kit-v-banner .kit-ayah-ar:not(#_) { color: #fff; }
.kit-v-banner :is(.kit-ayah-basmala, .kit-ayah-tr, .kit-ayah-note):not(#_) { color: rgba(255,255,255,.78); }
.kit-v-banner :is(.kit-ayah-num, .kit-ayah-ref, .kit-ayah-n):not(#_) { color: var(--accent-on-dark); border-color: color-mix(in srgb, var(--accent-on-dark) 55%, transparent); }

/* Surah list */
.kit-surahs-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin: 0 0 1.5rem; }
.kit-surahs-bar input { flex: 1 1 280px; min-height: 50px; padding: .7rem 1rem; border-radius: var(--btn-radius, 10px); border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); font: inherit; }
.kit-surahs-continue[hidden] { display: none !important; }
.kit-q-continue { display: inline-flex; align-items: center; gap: .55rem; min-height: 50px; padding: .6rem 1.1rem; border-radius: 999px; background: color-mix(in srgb, var(--primary) 10%, var(--bg)); color: var(--primary-ink); text-decoration: none; font-weight: 600; }
.kit-q-continue strong { font-weight: 800; }
.kit-surahs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr)); gap: .75rem; }
.kit-v-list .kit-surahs { grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr)); gap: 0 2rem; }
.kit-surah { display: flex; align-items: center; gap: .9rem; min-width: 0; padding: .95rem 1.05rem; border-radius: var(--radius-lg); background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); color: var(--text); text-decoration: none !important; transition: border-color .2s ease, transform .2s ease; }
.kit-surah:hover { border-color: var(--primary); transform: translateY(-1px); }
.kit-v-list .kit-surah { border-radius: 0; background: none; border: 0; border-bottom: 1px solid var(--border); box-shadow: none; padding: .85rem .25rem; }
.kit-v-list .kit-surah:hover { transform: none; background: color-mix(in srgb, var(--primary) 5%, transparent); }
.kit-surah[hidden] { display: none !important; }
.kit-surah-n { flex-shrink: 0; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; background: color-mix(in srgb, var(--primary) 10%, var(--bg)); color: var(--primary-ink); font-weight: 800; font-size: .92rem; font-variant-numeric: tabular-nums; }
.kit-surah-names { display: flex; flex-direction: column; min-width: 0; gap: .1rem; }
.kit-surah-names strong { font-size: 1.02rem; color: var(--text); }
.kit-surah-names small { font-size: .8rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kit-surah-ar { margin-inline-start: auto; font-size: 1.45rem; line-height: 1.6 !important; color: var(--primary-ink); white-space: nowrap; }

/* Reader */
.kit-reader { max-width: 900px; margin: 0 auto; }
.kit-q-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; padding: .75rem; margin: 0 0 2.25rem; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
.kit-q-pick { flex: 1 1 240px; max-width: 100%; min-height: 46px; padding: .55rem .9rem; border-radius: var(--btn-radius, 10px); border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); font: inherit; }
.kit-q-tools { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
.kit-q-tool { min-width: 46px; min-height: 46px; padding: .45rem .9rem; border-radius: var(--btn-radius, 10px); border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); font: inherit; font-weight: 700; cursor: pointer; }
.kit-q-tool[aria-pressed="true"] { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.kit-q-all { display: inline-flex !important; align-items: center; gap: .5rem; min-height: 46px; cursor: pointer; }
.kit-q-head { text-align: center; margin: 0 0 2rem; }
.kit-q-name-ar { font-size: clamp(2.3rem, 1.6rem + 3vw, 3.4rem); line-height: 1.8 !important; margin: 0; color: var(--primary-ink); }
.kit-q-head h2 { margin: .1rem 0 .35rem; }
.kit-q-meta { margin: 0; color: var(--muted); }
.kit-q-basmala { text-align: center; font-size: calc(clamp(1.6rem, 1.2rem + 1.4vw, 2.2rem) * var(--kq-scale, 1)); line-height: 2.2 !important; margin: 0 0 1rem; color: var(--text); }
.kit-q-verse { padding: 1.4rem .75rem 1rem; border-bottom: 1px solid var(--border); border-radius: 0; scroll-margin-top: 120px; transition: background .3s ease; }
.kit-q-verse.is-playing { background: color-mix(in srgb, var(--primary) 8%, transparent); border-radius: var(--radius-lg); }
.kit-q-verse.is-target { animation: kit-q-flash 2.6s ease; }
@keyframes kit-q-flash { 0%, 40% { background: color-mix(in srgb, var(--primary) 14%, transparent); } 100% { background: transparent; } }
.kit-q-ar { font-size: calc(clamp(1.6rem, 1.15rem + 1.6vw, 2.25rem) * var(--kq-scale, 1)); line-height: 2.35 !important; text-align: start; margin: 0 0 .8rem; color: var(--text); }
.kit-q-tr { font-size: calc(clamp(1rem, .96rem + .2vw, 1.1rem) * (1 + (var(--kq-scale, 1) - 1) * .5)); line-height: 1.75; color: var(--muted); margin: 0 0 .8rem; max-width: 72ch; }
.kit-q-no-tr .kit-q-tr { display: none; }
.kit-q-tr mark { background: color-mix(in srgb, var(--primary) 22%, transparent); color: inherit; border-radius: 3px; padding: 0 .1em; }
.kit-q-acts { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; }
.kit-q-ref { margin-inline-end: auto; font-size: .85rem; font-weight: 800; color: var(--primary-ink); text-decoration: none; font-variant-numeric: tabular-nums; }
.kit-q-link { font-size: .85rem; font-weight: 700; color: var(--primary-ink); padding: .4rem .6rem; }
.kit-q-act { width: 42px; height: 42px; display: inline-grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; transition: background .2s ease, color .2s ease; }
.kit-q-act:hover { background: var(--surface-2); color: var(--text); }
.kit-q-act[aria-pressed="true"], .kit-q-verse.is-playing .kit-q-act[data-act="play"] { color: var(--primary-ink); }
.kit-q-act[aria-pressed="true"] svg { fill: currentColor; }
.kit-q-nav { display: flex; justify-content: space-between; gap: 1rem; margin-top: 2.5rem; }
.kit-q-nav .btn { display: inline-flex !important; align-items: center; gap: .4rem; cursor: pointer; }
[dir="rtl"] :is(.kit-q-nav, .kit-q-continue) svg { transform: scaleX(-1); }
.kit-q-status, .kit-q-empty { text-align: center; color: var(--muted); padding: 2rem 0; margin: 0; }
.kit-q-empty[hidden] { display: none !important; }
.kit-q-count, .kit-q-note { text-align: center; color: var(--muted); font-size: .92rem; margin: 0 0 1.25rem; }
.kit-q-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; }
.kit-q-list > li { padding: 1.25rem clamp(1rem, 3vw, 1.6rem) .9rem; background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); border-radius: var(--radius-lg); }
.kit-q-search { display: flex; flex-wrap: wrap; gap: .6rem; max-width: 780px; margin: 0 auto 2rem; }
.kit-q-search input { flex: 1 1 260px; min-height: 52px; padding: .75rem 1rem; border-radius: var(--btn-radius, 10px); border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); font: inherit; }
.kit-q-search .btn { min-height: 52px; }
.kit-q-results { max-width: 900px; margin: 0 auto; }
.kit-bookmarks { max-width: 900px; margin: 0 auto; }
.kit-q-toast { position: fixed; left: 0; right: 0; bottom: 24px; z-index: 200; width: max-content; max-width: calc(100% - 32px); margin: 0 auto; transform: translateY(16px); padding: .7rem 1.15rem; border-radius: 999px; background: var(--ink); color: #fff; font-weight: 600; font-size: .92rem; text-align: center; opacity: 0; pointer-events: none; transition: opacity .25s ease, transform .25s ease; }
.kit-q-toast.is-on { opacity: 1; transform: none; }
@media (max-width: 640px) {
  .kit-q-bar { padding: .6rem; }
  .kit-q-tools { width: 100%; }
  .kit-q-all { margin-inline-start: auto; }
  .kit-surah-ar { font-size: 1.25rem; }
}
`
