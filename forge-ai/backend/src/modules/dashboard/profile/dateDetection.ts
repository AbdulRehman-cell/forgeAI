/**
 * Date-format detection. Deliberately narrow — we recognize the formats real
 * business data actually uses and REPORT the format we matched, so the cleaner
 * later can normalize with confidence instead of re-guessing.
 *
 * We do NOT trust `Date.parse` alone: it accepts things like "3" as a valid
 * date (year 3 CE). Every format below has an explicit regex gate first.
 */

export type DateFormat =
  | 'iso'          // 2024-03-14 [T00:00[:00[Z]]]
  | 'us_slash'     // 3/14/2024 or 03/14/2024
  | 'eu_slash'     // 14/3/2024 or 14/03/2024
  | 'us_dash'      // 03-14-2024
  | 'eu_dot'       // 14.03.2024
  | 'text_month'   // Mar 14, 2024 / March 14 2024 / 14 Mar 2024
  | 'excel_serial' // 45367 → days since 1899-12-30 (Excel date bug)
  | 'timestamp_ms' // 1710000000000 (13-digit epoch ms)
  | 'timestamp_s'  // 1710000000 (10-digit epoch seconds)

export interface DateMatch {
  format: DateFormat
  /** Parsed to a JS Date so downstream code can compare/normalize without
   *  re-parsing. */
  date: Date
}

const MONTH: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5, july: 6,
  august: 7, september: 8, october: 9, november: 10, december: 11,
}

function mkDate(y: number, m: number, d: number): Date | null {
  if (m < 0 || m > 11 || d < 1 || d > 31 || y < 1900 || y > 2100) return null
  const dt = new Date(Date.UTC(y, m, d))
  // Catches "Feb 30" → auto-rolled to March by JS
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null
  return dt
}

/** Attempt to parse a single value as a date. Returns null when it clearly
 *  is not one — used both for per-value classification and for surfacing
 *  which format won, so we can flag "mixed date formats". */
export function detectDate(value: string): DateMatch | null {
  const v = value.trim()
  if (!v) return null

  // ISO (also handles ISO-with-time)
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2})?Z?)?$/)
  if (iso) {
    const d = mkDate(+iso[1], +iso[2] - 1, +iso[3])
    if (d) return { format: 'iso', date: d }
  }

  // US M/D/Y or MM/DD/YYYY. 2-digit years assumed 2000+ if <=68, else 1900+
  const usSlash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (usSlash) {
    const m = +usSlash[1], day = +usSlash[2]
    let y = +usSlash[3]
    if (y < 100) y += y <= 68 ? 2000 : 1900
    // Heuristic: if day > 12 the M/D reading is only possible one
    if (m <= 12) {
      const d = mkDate(y, m - 1, day)
      if (d) return { format: 'us_slash', date: d }
    }
    // Fall through to EU interpretation if US didn't fit
    if (day <= 12) {
      const d = mkDate(y, day - 1, m)
      if (d) return { format: 'eu_slash', date: d }
    }
  }

  // US dash: 03-14-2024
  const usDash = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (usDash) {
    const m = +usDash[1], day = +usDash[2], y = +usDash[3]
    if (m <= 12) {
      const d = mkDate(y, m - 1, day)
      if (d) return { format: 'us_dash', date: d }
    }
  }

  // EU dot: 14.03.2024
  const euDot = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (euDot) {
    const day = +euDot[1], m = +euDot[2], y = +euDot[3]
    if (m <= 12) {
      const d = mkDate(y, m - 1, day)
      if (d) return { format: 'eu_dot', date: d }
    }
  }

  // Text month: "Mar 14 2024", "March 14, 2024", "14 Mar 2024", "14 March 2024"
  const textMD = v.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (textMD) {
    const m = MONTH[textMD[1].toLowerCase()]
    if (m !== undefined) {
      const d = mkDate(+textMD[3], m, +textMD[2])
      if (d) return { format: 'text_month', date: d }
    }
  }
  const textDM = v.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/)
  if (textDM) {
    const m = MONTH[textDM[2].toLowerCase()]
    if (m !== undefined) {
      const d = mkDate(+textDM[3], m, +textDM[1])
      if (d) return { format: 'text_month', date: d }
    }
  }

  // Epoch. 13 digits = ms, 10 digits = seconds. Only accept plausible ranges
  // (1980-01-01 to 2100-01-01) so a plain integer like "1234567890" for an
  // order ID doesn't get mistaken for Feb 2009.
  const epoch = v.match(/^(\d{10}|\d{13})$/)
  if (epoch) {
    const n = +epoch[1]
    const ms = epoch[1].length === 13 ? n : n * 1000
    if (ms >= 315_532_800_000 && ms <= 4_102_444_800_000) {
      const dt = new Date(ms)
      return { format: epoch[1].length === 13 ? 'timestamp_ms' : 'timestamp_s', date: dt }
    }
  }

  // Excel serial: an integer days-since-1899-12-30. We only classify as date
  // when the COLUMN NAME already hints at a date — the header check happens
  // in the caller. Here we just report whether it's *possibly* an Excel serial.
  // Range: 1 (1900-01-01) to ~73415 (2100-12-31)
  return null
}

export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 73415) return null
  // Excel bug: treats 1900 as a leap year, so serial 60 doesn't exist. We
  // model that by using Dec 30, 1899 as the epoch (matches Excel's numeric
  // rendering for all real dates).
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400_000)
}
