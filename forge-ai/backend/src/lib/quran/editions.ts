// ─── Quran data pack: what ForgeAI may ship ──────────────────────────────────
// The AI never writes Quranic text — sites get these verified files instead.
// Every edition here was licence-checked by hand before it was added
// (2026-10-31), because ForgeAI's sites are commercial:
// - Tanzil's Arabic text is CC BY 3.0: verbatim copies only, and every site
//   credits "Tanzil Project" with a link to tanzil.net.
// - Tanzil's translations page allows its translations for non-commercial use
//   only, unless the translator or publisher agrees. The two below are public
//   domain, so there is no rights-holder to ask. Saheeh International is NOT
//   here: it is under copyright, and needs its publisher's written permission.

export interface QuranEdition {
  /** Tanzil's id, also the pack's file name */
  id: string
  kind: 'quran' | 'translation'
  lang: string
  /** The name a site credits, in the languages ForgeAI writes credits in */
  credit: Record<string, string>
  /** Tanzil's published file (txt-2: "sura|aya|text" lines, then the notice) */
  download: string
  /** An independent copy of the same edition — catches a bad download */
  crossCheck: string
  /** Why a commercial site may carry it */
  licence: string
}

export const QURAN_EDITIONS: QuranEdition[] = [
  {
    id: 'quran-uthmani',
    kind: 'quran',
    lang: 'ar',
    credit: { en: 'Tanzil Project', ur: 'تنزیل پروجیکٹ', ar: 'مشروع تنزيل' },
    download: 'https://tanzil.net/pub/download/index.php?marks=true&sajdah=true&rub=true&alef=true&quranType=uthmani&outType=txt-2&agree=true',
    crossCheck: 'https://api.alquran.cloud/v1/quran/quran-uthmani',
    licence: 'Tanzil Quran Text, Creative Commons Attribution 3.0 — verbatim copies only; credit Tanzil Project with a link to tanzil.net',
  },
  {
    id: 'en.pickthall',
    kind: 'translation',
    lang: 'en',
    credit: { en: 'Mohammed Marmaduke Pickthall', ur: 'محمد مارماڈیوک پکتھال', ar: 'محمد مارمادوك بكتال' },
    download: 'https://tanzil.net/trans/?transID=en.pickthall&type=txt-2',
    crossCheck: 'https://api.alquran.cloud/v1/quran/en.pickthall',
    licence: 'Public domain — "The Meaning of the Glorious Koran", published 1930; the translator died in 1936',
  },
  {
    id: 'ur.jalandhry',
    kind: 'translation',
    lang: 'ur',
    credit: { en: 'Fateh Muhammad Jalandhry', ur: 'مولانا فتح محمد جالندھری', ar: 'فتح محمد جالندهري' },
    download: 'https://tanzil.net/trans/?transID=ur.jalandhry&type=txt-2',
    crossCheck: 'https://api.alquran.cloud/v1/quran/ur.jalandhry',
    licence: 'Public domain — "Fath al-Hameed", published 1900 in Amritsar; the translator was born in 1864',
  },
]

/** Surah names, ayah counts, juz and sajda positions (Tanzil Quran Metadata, CC BY 3.0) */
export const QURAN_METADATA_URL = 'https://tanzil.net/res/text/metadata/quran-data.js'

export interface QuranReciter {
  id: string
  credit: Record<string, string>
  /** One file per ayah; {n} is the ayah's number in the whole Quran (1–6236) */
  audio: string
  licence: string
}

export const QURAN_RECITERS: QuranReciter[] = [
  {
    id: 'ar.alafasy',
    credit: { en: 'Mishary Rashid Alafasy', ur: 'مشاری راشد العفاسی', ar: 'مشاري راشد العفاسي' },
    audio: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/{n}.mp3',
    // alquran.cloud terms, updated 2026-06-14
    licence: 'Streamed from the Islamic Network CDN (alquran.cloud). Commercial products may use it, but copyright stays with the reciter, who may ask for removal.',
  },
]

/**
 * Verses whose letters differ between Tanzil's current text (Uthmani 1.1) and
 * the cross-check copy (still Uthmani 1.0) — spelling corrections Tanzil made
 * in 1.1, e.g. "بعد ما" → "بعدما". Any other difference in letters stops the
 * pack being built.
 */
export const KNOWN_SPELLING_UPDATES = ['2:181', '8:6', '12:39', '12:41', '13:37']

/** The translation a site in this language shows under the Arabic */
export function translationFor(lang: string): QuranEdition | undefined {
  if (lang === 'ar') return undefined
  return QURAN_EDITIONS.find((e) => e.kind === 'translation' && e.lang === lang)
    ?? QURAN_EDITIONS.find((e) => e.id === 'en.pickthall')
}
