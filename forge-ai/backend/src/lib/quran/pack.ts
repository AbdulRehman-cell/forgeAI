// ─── Quran data pack: the verified text, for builds ─────────────────────────
// backend/data/quran holds Tanzil's files exactly as published, plus the
// manifest of hashes that download.ts wrote after checking them. Every read is
// checked against those hashes: a surah whose text no longer matches is never
// put on a site. Nothing here is cached between builds — the server runs on a
// small heap, and a build needs the text for a few seconds at most.

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { QURAN_EDITIONS, QURAN_RECITERS, translationFor } from './editions'
import { t } from '../sections/strings'

export const QURAN_DATA_DIR = path.resolve(__dirname, '../../../data/quran')

export interface SurahInfo {
  n: number
  /** Arabic name, e.g. الكهف */
  ar: string
  /** Transliterated name, e.g. Al-Kahf */
  name: string
  /** English meaning, e.g. The Cave */
  meaning: string
  ayahs: number
  type: 'Meccan' | 'Medinan'
  /** Order of revelation */
  order: number
  /** Ayahs before this surah — ayah a is number start + a in the whole Quran */
  start: number
}

export interface PackEdition {
  id: string
  kind: 'quran' | 'translation'
  lang: string
  file: string
  /** First line of Tanzil's notice, e.g. "Tanzil Quran Text (Uthmani, Version 1.1)" */
  version: string
  verses: number
  /** Hash of the surah hashes below */
  sha256: string
  /** sha256 of each surah's ayahs joined by "\n", surah 1 first */
  surahs: string[]
  source: string
  downloaded: string
  crossCheck: { source: string; identical: number; marksDiffer: number; spellingUpdates: string[] }
}

export interface QuranManifest {
  generated: string
  editions: PackEdition[]
  metadata: { source: string; notice: string; surahs: SurahInfo[]; juz: [number, number][]; sajda: [number, number, string][] }
}

// ── Reading Tanzil's files ──

/** Tanzil's txt-2 format: "sura|aya|text" lines, then a block of "#" notice lines */
export function parseTanzil(text: string): { surahs: string[][]; notice: string; problems: string[] } {
  const surahs: string[][] = Array.from({ length: 115 }, () => [])
  const notice: string[] = []
  const problems: string[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '')
    if (line.startsWith('#')) { notice.push(line); continue }
    if (!line.trim()) continue
    const m = /^(\d{1,3})\|(\d{1,3})\|(.*)$/.exec(line)
    if (!m) { problems.push(`line ${i + 1} is not "sura|aya|text"`); continue }
    const s = Number(m[1]), a = Number(m[2])
    if (s < 1 || s > 114) { problems.push(`line ${i + 1}: there is no surah ${s}`); continue }
    if (a !== surahs[s].length + 1) problems.push(`${s}:${a} is out of order (expected ${s}:${surahs[s].length + 1})`)
    surahs[s].push(m[3])
  }
  return { surahs, notice: notice.join('\n'), problems }
}

export const surahHash = (verses: string[]) => createHash('sha256').update(verses.join('\n'), 'utf8').digest('hex')
export const editionHash = (surahHashes: string[]) => createHash('sha256').update(surahHashes.join('\n')).digest('hex')

/** The pack's manifest, or null when the pack is missing (run npm run quran:pack) */
export function quranManifest(): QuranManifest | null {
  try { return JSON.parse(fs.readFileSync(path.join(QURAN_DATA_DIR, 'manifest.json'), 'utf8')) as QuranManifest } catch { return null }
}

export interface VerifiedEdition {
  edition: PackEdition
  /** Index 1–114; null where the surah failed its check */
  surahs: (string[] | null)[]
  failed: number[]
  notice: string
}

/** Reads one edition, keeping only the surahs whose text still matches the manifest */
export function loadEdition(id: string, manifest = quranManifest()): VerifiedEdition | null {
  const edition = manifest?.editions.find((e) => e.id === id)
  if (!manifest || !edition) return null
  let text: string
  try { text = fs.readFileSync(path.join(QURAN_DATA_DIR, edition.file), 'utf8') } catch { return null }
  const parsed = parseTanzil(text)
  const surahs: (string[] | null)[] = [null]
  const failed: number[] = []
  for (let s = 1; s <= 114; s++) {
    const verses = parsed.surahs[s]
    const ok = verses.length === manifest.metadata.surahs[s - 1].ayahs && surahHash(verses) === edition.surahs[s - 1]
    surahs.push(ok ? verses : null)
    if (!ok) failed.push(s)
  }
  return { edition, surahs, failed, notice: parsed.notice }
}

// ── References ── the AI writes "2:255" or "Al-Kahf 1-10"; ForgeAI looks the text up

export interface QuranRef { surah: number; from: number; to: number }

const toLatinDigits = (s: string) => s
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))

const SURAH_WORD = /^(?:surah|surat|sura|soorah|سورة|سورہ|سوره)\s*/iu

// "Al-Faatiha", "Al-Fatihah" and "Fatiha" all become "fatiha"; Urdu letters
// fold to their Arabic forms, so "سورہ کہف" finds الكهف
function nameKeys(name: string): string[] {
  const base = name.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase()
    .replace(SURAH_WORD, '').replace(/^the\s+/, '').replace(/['’ʿʾ`]/g, '')
    .replace(/ک/g, 'ك').replace(/[یى]/g, 'ي').replace(/[ہۃة]/g, 'ه').replace(/[أإآٱ]/g, 'ا')
  const squash = (s: string) => s.replace(/[^\p{L}]/gu, '')
    .replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/([aiu])\1+/g, '$1').replace(/([aiu])h$/, '$1')
  const keys = [squash(base)]
  // With and without the article: "Al-Kahf" → alkahf, kahf; "الكهف" → الكهف, كهف
  const bare = base.replace(/^(?:a[lnrstdzh]|adh|ash|ath|aal)[-\s]/, '').replace(/^ال/, '')
  if (bare !== base) keys.push(squash(bare))
  return keys
}

/** Surah number from a name in English transliteration, English meaning or Arabic */
export function findSurah(name: string, surahs: SurahInfo[]): number | null {
  const want = nameKeys(name)
  if (!want[0]) return null
  for (const s of surahs) {
    const have = [...nameKeys(s.name), ...nameKeys(s.ar), nameKeys(s.meaning)[0]]
    if (want.some((k) => have.includes(k))) return s.n
  }
  return null
}

/**
 * "2:255", "2:255-257", "18" (whole surah), "Al-Kahf", "Surah Al-Kahf 1-10",
 * "Al-Baqarah 255", "سورة الكهف". Null when the reference does not exist —
 * a wrong ayah number is never quietly moved to a nearby one.
 */
export function parseRef(input: string, surahs: SurahInfo[]): QuranRef | null {
  const s = toLatinDigits(input.normalize('NFC')).replace(/\s+/g, ' ').trim().replace(SURAH_WORD, '')
  let surah: number | null = null
  let from: number | undefined, to: number | undefined
  const numeric = /^(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?$/.exec(s)
  if (numeric) {
    surah = Number(numeric[1])
    if (numeric[2]) { from = Number(numeric[2]); to = numeric[3] ? Number(numeric[3]) : from }
  } else {
    const tail = /[\s,:]+(?:(?:ayahs?|ayat|verses?|v\.)\s*)?(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/i.exec(s)
    surah = findSurah(tail ? s.slice(0, tail.index) : s, surahs)
    if (tail) { from = Number(tail[1]); to = tail[2] ? Number(tail[2]) : from }
  }
  const info = surah ? surahs[surah - 1] : undefined
  if (!info) return null
  from ??= 1
  to ??= info.ayahs
  if (from < 1 || to < from || to > info.ayahs) return null
  return { surah: info.n, from, to }
}

// ── Looking verses up ──

export interface QuranVerse {
  surah: number
  ayah: number
  /** Number in the whole Quran (1–6236) — the audio file's name */
  n: number
  /** Edition id → text, exactly as Tanzil published it */
  text: Record<string, string>
}

export interface QuranPassage { ref: QuranRef; surah: SurahInfo; label: string; verses: QuranVerse[] }

export interface QuranText {
  surahs: SurahInfo[]
  /** Editions that are missing or have surahs that failed their check */
  problems: string[]
  /** The verified text, or null when the reference is wrong or any of its surah failed its check */
  passage(ref: string | QuranRef): QuranPassage | null
}

/** Opens the pack for one build. Arabic always; translations by edition id. */
export function openQuran(translations: string[] = []): QuranText | null {
  const manifest = quranManifest()
  if (!manifest) return null
  const surahs = manifest.metadata.surahs
  const problems: string[] = []
  const editions: VerifiedEdition[] = []
  for (const id of ['quran-uthmani', ...translations.filter((x) => x !== 'quran-uthmani')]) {
    const e = loadEdition(id, manifest)
    if (!e) { problems.push(`${id}: not in the pack`); continue }
    if (e.failed.length) problems.push(`${id}: surah ${e.failed.join(', ')} failed the check`)
    editions.push(e)
  }
  if (!editions.some((e) => e.edition.id === 'quran-uthmani')) return null
  return {
    surahs,
    problems,
    passage(input) {
      const ref = typeof input === 'string' ? parseRef(input, surahs) : input
      const info = ref ? surahs[ref.surah - 1] : undefined
      if (!ref || !info) return null
      if (editions.some((e) => !e.surahs[ref.surah])) return null
      const verses: QuranVerse[] = []
      for (let a = ref.from; a <= ref.to; a++) {
        const text: Record<string, string> = {}
        for (const e of editions) text[e.edition.id] = e.surahs[ref.surah]![a - 1]
        verses.push({ surah: ref.surah, ayah: a, n: info.start + a, text })
      }
      const span = ref.from === 1 && ref.to === info.ayahs ? `${ref.surah}` : ref.from === ref.to ? `${ref.surah}:${ref.from}` : `${ref.surah}:${ref.from}–${ref.to}`
      return { ref, surah: info, label: `${info.name} ${span}`, verses }
    },
  }
}

// ── What a site carries ──

export interface SitePackResult { files: number; editions: string[]; skipped: string[] }

const pad3 = (n: number) => String(n).padStart(3, '0')

/**
 * Writes the files a site's reader pages load: <dir>/<edition>/001.json … 114.json,
 * <dir>/surahs.json and <dir>/NOTICE.txt. Each surah is checked again right
 * before it is written; one that fails is left out and listed in `skipped`.
 */
export function writeSitePack(root: string, lang: string, dir = 'quran'): SitePackResult | null {
  const manifest = quranManifest()
  if (!manifest) return null
  const out = path.join(root, dir)
  const translation = translationFor(lang)
  const ids = ['quran-uthmani', ...(translation ? [translation.id] : [])]
  const result: SitePackResult = { files: 0, editions: [], skipped: [] }
  const notices: string[] = []
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true })
    fs.writeFileSync(path.join(out, rel), content, 'utf8')
    result.files++
  }
  for (const id of ids) {
    const e = loadEdition(id, manifest)
    if (!e) { result.skipped.push(`${id} (not in the pack)`); continue }
    const def = QURAN_EDITIONS.find((x) => x.id === id)
    const source = e.edition.kind === 'quran'
      ? `${e.edition.version}. Copyright (C) Tanzil Project. License: Creative Commons Attribution 3.0. https://tanzil.net — see NOTICE.txt`
      : `Translation by ${def?.credit.en ?? id} (${def?.licence ?? 'see NOTICE.txt'}), from Tanzil.net — see NOTICE.txt`
    for (let s = 1; s <= 114; s++) {
      const verses = e.surahs[s]
      if (!verses) { result.skipped.push(`${id} surah ${s}`); continue }
      write(`${id}/${pad3(s)}.json`, JSON.stringify({ edition: id, surah: s, verses, source }))
    }
    result.editions.push(id)
    notices.push(e.notice.trim())
  }
  const name = (c: Record<string, string>) => c[lang] ?? c.en
  write('surahs.json', JSON.stringify({
    editions: result.editions.map((id) => {
      const def = QURAN_EDITIONS.find((x) => x.id === id)!
      return { id, kind: def.kind, lang: def.lang, name: name(def.credit) }
    }),
    reciters: QURAN_RECITERS.map((r) => ({ id: r.id, name: name(r.credit), audio: r.audio })),
    surahs: manifest.metadata.surahs,
    juz: manifest.metadata.juz,
    sajda: manifest.metadata.sajda,
    source: `${manifest.metadata.notice.split('\n')[0]} — Tanzil Project, CC BY 3.0, https://tanzil.net`,
  }))
  write('NOTICE.txt', [
    'The Quran text on this site is Tanzil\'s, unchanged. Its notices follow.',
    '',
    ...notices.flatMap((n) => [n, '']),
    manifest.metadata.notice,
    '',
    ...QURAN_RECITERS.map((r) => `Recitation: ${r.credit.en} — ${r.licence}`),
    '',
  ].join('\n'))
  return result
}

// ── Credits ── Tanzil's licence requires a visible credit with a link

/** Page code that shows pack text carries data-quran; pages that play recitations, data-quran-audio */
export const usesQuran = (code: string) => /\bdata-quran\b/.test(code)
export const usesQuranAudio = (code: string) => /\bdata-quran-audio\b/.test(code)

export function quranCreditsHtml(lang: string, audio: boolean): string {
  const name = (c: Record<string, string>) => c[lang] ?? c.en
  const tanzil = QURAN_EDITIONS.find((e) => e.id === 'quran-uthmani')!
  const translation = translationFor(lang)
  const parts = [`${t(lang, 'quranText')}: <a href="https://tanzil.net" target="_blank" rel="noopener">${name(tanzil.credit)}</a> (CC BY 3.0)`]
  if (translation) parts.push(`${t(lang, 'translation')}: ${name(translation.credit)}`)
  if (audio) parts.push(`${t(lang, 'recitation')}: ${name(QURAN_RECITERS[0].credit)}`)
  return `<p class="kit-credits" data-forge-credits>${parts.join(' · ')}</p>`
}

/** Adds the credit line once, under the page footer (a new one replaces the old) */
export function applyQuranCredits(html: string, lang: string, audio: boolean): string {
  const line = quranCreditsHtml(lang, audio)
  const old = /<p class="kit-credits" data-forge-credits>[\s\S]*?<\/p>/
  if (old.test(html)) return html.replace(old, () => line)
  const end = html.lastIndexOf('</footer>')
  if (end >= 0) return `${html.slice(0, end + 9)}\n${line}${html.slice(end + 9)}`
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => `${line}\n</body>`) : `${html}\n${line}`
}
