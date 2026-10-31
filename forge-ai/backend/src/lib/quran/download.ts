// ─── Quran data pack: download and verify ───────────────────────────────────
// Builds backend/data/quran by hand (npm run quran:pack), never during a site
// build. For each edition in editions.ts it:
// 1. downloads Tanzil's published file and keeps it byte for byte;
// 2. checks it against Tanzil's metadata: 114 surahs, the right number of
//    ayahs in each, numbered in order, none empty, the notice intact;
// 3. compares it with an independent copy: translations must match word for
//    word, and the Arabic letter for letter (Tanzil's later spelling
//    corrections, KNOWN_SPELLING_UPDATES, excepted — the copy is older);
// 4. refuses to replace a pack already on disk with a text that differs from
//    it, unless --accept-update is passed (read tanzil.net/updates first);
// 5. writes the files and manifest.json, with a hash of every surah.
// Nothing is written unless every edition passes.

import fs from 'fs'
import path from 'path'
import axios from 'axios'
import JSON5 from 'json5'
import { KNOWN_SPELLING_UPDATES, QURAN_EDITIONS, QURAN_METADATA_URL, type QuranEdition } from './editions'
import { editionHash, parseTanzil, QURAN_DATA_DIR, quranManifest, surahHash, type PackEdition, type QuranManifest, type SurahInfo } from './pack'

const TOTAL_AYAHS = 6236

async function download(url: string): Promise<Buffer> {
  const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 120_000, headers: { 'User-Agent': 'ForgeAI quran-pack (+https://tanzil.net terms respected)' } })
  return Buffer.from(res.data)
}

// ── Tanzil's metadata (quran-data.js): surah names, ayah counts, juz, sajda ──

function parseMetadata(js: string): QuranManifest['metadata'] {
  const array = (name: string) => {
    const m = new RegExp(`QuranData\\.${name}\\s*=\\s*(\\[[\\s\\S]*?\\]);`).exec(js)
    if (!m) throw new Error(`metadata: QuranData.${name} is missing`)
    return (JSON5.parse(m[1]) as unknown[][]).filter((row) => row.length)
  }
  // The list ends with a [6236, 1] end marker
  const suraRows = array('Sura')
  if (suraRows.length === 115 && suraRows[114].length === 2 && Number(suraRows[114][0]) === TOTAL_AYAHS) suraRows.pop()
  const surahs: SurahInfo[] = suraRows.map((r, i) => ({
    n: i + 1, start: Number(r[0]), ayahs: Number(r[1]), order: Number(r[2]),
    ar: String(r[4]), name: String(r[5]), meaning: String(r[6]), type: r[7] === 'Medinan' ? 'Medinan' : 'Meccan',
  }))
  const juz = array('Juz').map((r) => [Number(r[0]), Number(r[1])] as [number, number])
  const sajda = array('Sajda').map((r) => [Number(r[0]), Number(r[1]), String(r[2])] as [number, number, string])
  const problems: string[] = []
  if (surahs.length !== 114) problems.push(`${surahs.length} surahs, not 114`)
  let start = 0
  for (const s of surahs) {
    if (s.start !== start) problems.push(`surah ${s.n} starts at ayah ${s.start}, not ${start}`)
    if (!s.ar || !s.name || !s.meaning || s.ayahs < 3) problems.push(`surah ${s.n} has incomplete data`)
    start += s.ayahs
  }
  if (start !== TOTAL_AYAHS) problems.push(`${start} ayahs in all, not ${TOTAL_AYAHS}`)
  // The list may end with a [115, 1] end marker
  if (juz.filter(([s]) => s <= 114).length !== 30) problems.push(`${juz.length} juz, not 30`)
  if (sajda.length !== 15) problems.push(`${sajda.length} sajda positions, not 15`)
  if (problems.length) throw new Error(`metadata: ${problems.join('; ')}`)
  const notice = js.split('\n').filter((l) => l.startsWith('//')).slice(0, 3).map((l) => l.replace(/^\/\/\s?/, '').trim()).filter(Boolean).join('\n')
  if (!/Tanzil/.test(notice)) throw new Error('metadata: the Tanzil notice is missing')
  return { source: QURAN_METADATA_URL, notice, surahs, juz: juz.filter(([s]) => s <= 114), sajda }
}

// ── One edition ──

// The letters alone: drop vowel marks, Quranic annotation signs, tatweel and
// the hamza, and fold alef and hamza-seat variants — what differs between
// Tanzil's 1.0 and 1.1 texts is mostly how the marks are written
const lettersOnly = (s: string) => s.normalize('NFD')
  .replace(/[\p{Mn}\p{Lm}ـۖ-ۭء﻿]/gu, '')
  .replace(/[ٱآأإ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/\s+/g, ' ').trim()

// Arabic letters, marks and spaces only — anything else means a damaged file
const NOT_ARABIC = /[^؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ ]/u

interface Checked { def: QuranEdition; bytes: Buffer; pack: PackEdition }

async function checkEdition(def: QuranEdition, meta: QuranManifest['metadata'], log: (m: string) => void): Promise<Checked> {
  log(`↓ ${def.id} from Tanzil…`)
  const bytes = await download(def.download)
  const text = bytes.toString('utf8')
  const { surahs, notice, problems } = parseTanzil(text)
  const fail = (why: string) => { throw new Error(`${def.id}: ${why}`) }
  if (problems.length) fail(problems.slice(0, 5).join('; '))

  // The notice must be there, unchanged in substance — it travels with every copy
  const version = /^#\s*(Tanzil Quran Text \([^)]+\))/m.exec(notice)?.[1]
  if (def.kind === 'quran') {
    if (!version) fail('the Tanzil copyright notice is missing its version line')
    if (!/CHANGING IT IS NOT ALLOWED/.test(notice) || !/Creative Commons Attribution 3\.0/.test(notice)) fail('the Tanzil copyright notice is incomplete')
  } else if (!new RegExp(`ID:\\s*${def.id.replace('.', '\\.')}\\b`).test(notice)) fail(`the notice does not name ${def.id}`)

  // Structure against the metadata
  let verses = 0
  for (let s = 1; s <= 114; s++) {
    const want = meta.surahs[s - 1].ayahs
    if (surahs[s].length !== want) fail(`surah ${s} has ${surahs[s].length} ayahs, Tanzil's metadata says ${want}`)
    surahs[s].forEach((v, i) => {
      if (!v.trim()) fail(`${s}:${i + 1} is empty`)
      if (def.kind === 'quran' && NOT_ARABIC.test(v)) fail(`${s}:${i + 1} contains a character that is not Arabic: U+${v.match(NOT_ARABIC)![0].codePointAt(0)!.toString(16).toUpperCase()}`)
      if (def.kind === 'translation' && /[\u0000-\u0008\u000B-\u001F<>|]/.test(v)) fail(`${s}:${i + 1} contains markup or a control character`)
    })
    verses += want
  }
  if (verses !== TOTAL_AYAHS) fail(`${verses} ayahs, not ${TOTAL_AYAHS}`)

  // Against an independent copy
  log(`↓ ${def.id} cross-check copy…`)
  const other = JSON.parse((await download(def.crossCheck)).toString('utf8')) as { data?: { surahs?: { number: number; ayahs: { numberInSurah: number; text: string }[] }[] } }
  const copy = new Map<string, string>()
  for (const s of other.data?.surahs ?? []) for (const a of s.ayahs) copy.set(`${s.number}:${a.numberInSurah}`, a.text)
  if (copy.size !== TOTAL_AYAHS) fail(`the cross-check copy has ${copy.size} ayahs`)
  let identical = 0, marksDiffer = 0
  const spellingUpdates: string[] = [], mismatched: string[] = []
  for (let s = 1; s <= 114; s++) surahs[s].forEach((v, i) => {
    const key = `${s}:${i + 1}`, w = copy.get(key) ?? ''
    if (w.replace(/^﻿/, '').trim() === v.trim()) identical++
    else if (def.kind === 'quran' && lettersOnly(w) === lettersOnly(v)) marksDiffer++
    else if (def.kind === 'quran' && KNOWN_SPELLING_UPDATES.includes(key)) spellingUpdates.push(key)
    else mismatched.push(key)
  })
  if (mismatched.length) fail(`${mismatched.length} ayah(s) differ from the cross-check copy: ${mismatched.slice(0, 12).join(', ')}`)

  const hashes = Array.from({ length: 114 }, (_x, i) => surahHash(surahs[i + 1]))
  const updated = /Last Update:\s*([^\n]+)/.exec(notice)?.[1].trim()
  const versionLine = version ?? `Tanzil translation ${def.id}${updated ? `, last updated ${updated}` : ''}`
  return {
    def, bytes,
    pack: {
      id: def.id, kind: def.kind, lang: def.lang, file: `${def.id}.txt`, version: versionLine, verses,
      sha256: editionHash(hashes), surahs: hashes, source: def.download, downloaded: new Date().toISOString(),
      crossCheck: { source: def.crossCheck, identical, marksDiffer, spellingUpdates },
    },
  }
}

export interface PackBuildResult { changed: boolean; summary: string[] }

export async function buildQuranPack(opts: { acceptUpdate?: boolean; log?: (m: string) => void } = {}): Promise<PackBuildResult> {
  const log = opts.log ?? (() => {})
  log('↓ metadata from Tanzil…')
  const metadata = parseMetadata((await download(QURAN_METADATA_URL)).toString('utf8'))
  const checked: Checked[] = []
  for (const def of QURAN_EDITIONS) checked.push(await checkEdition(def, metadata, log))

  // A pack already on disk only changes on purpose
  const existing = quranManifest()
  const summary: string[] = []
  let changed = !existing
  for (const c of checked) {
    const before = existing?.editions.find((e) => e.id === c.def.id)
    const cc = c.pack.crossCheck
    const line = `✓ ${c.def.id}: ${c.pack.verses} ayahs, ${c.pack.version}; matches the cross-check copy in ${cc.identical} ayahs`
      + (cc.marksDiffer ? `, letters match in ${cc.marksDiffer} more (marks written differently)` : '')
      + (cc.spellingUpdates.length ? `, ${cc.spellingUpdates.length} known spelling update(s): ${cc.spellingUpdates.join(', ')}` : '')
    summary.push(line)
    if (!before) { changed = true; continue }
    if (before.sha256 === c.pack.sha256) { c.pack.downloaded = before.downloaded; continue }
    const surahs = c.pack.surahs.map((h, i) => (h === before.surahs[i] ? 0 : i + 1)).filter(Boolean)
    if (!opts.acceptUpdate) throw new Error(`${c.def.id}: Tanzil's text differs from the pack in surah ${surahs.join(', ')}. Read tanzil.net/updates, then run again with --accept-update.`)
    summary.push(`  ↺ ${c.def.id}: updated surah ${surahs.join(', ')}`)
    changed = true
  }
  if (existing && JSON.stringify(existing.metadata) !== JSON.stringify(metadata)) changed = true
  if (!changed) return { changed: false, summary: [...summary, 'The pack on disk is already up to date — nothing written.'] }

  fs.mkdirSync(QURAN_DATA_DIR, { recursive: true })
  for (const c of checked) fs.writeFileSync(path.join(QURAN_DATA_DIR, c.pack.file), c.bytes)
  const manifest: QuranManifest = { generated: new Date().toISOString(), editions: checked.map((c) => c.pack), metadata }
  fs.writeFileSync(path.join(QURAN_DATA_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)
  return { changed: true, summary: [...summary, `Wrote ${checked.length} edition(s) and manifest.json to ${QURAN_DATA_DIR}`] }
}

if (require.main === module) {
  buildQuranPack({ acceptUpdate: process.argv.includes('--accept-update'), log: (m) => console.log(m) })
    .then((r) => console.log(r.summary.join('\n')))
    .catch((e: Error) => { console.error(`✗ ${e.message}\nNothing was written.`); process.exit(1) })
}
