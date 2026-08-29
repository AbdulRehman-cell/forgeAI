import { detectDate, type DateFormat } from './dateDetection'
import { detectNumber } from './currencyDetection'

/**
 * Column-level typing. Every non-blank value in the column is classified
 * once, then the column's type is the winner subject to a confidence rule:
 * a mixed column ends up with a lower confidence and a flag, rather than a
 * silent "we picked the majority".
 */

export type CellType = 'blank' | 'number' | 'currency' | 'date' | 'boolean' | 'string'
export type ColumnType = Exclude<CellType, 'blank'> | 'category'

export interface CellClassification {
  type: CellType
  /** Present when a currency/number was detected */
  numeric?: number
  currencySymbol?: string | null
  /** Present when a date was detected */
  dateFormat?: DateFormat
  date?: Date
  /** Present when a boolean was detected */
  bool?: boolean
}

const BOOL_TRUE = new Set(['true', 'yes', 'y', '1', 't'])
const BOOL_FALSE = new Set(['false', 'no', 'n', '0', 'f'])

export function classifyCell(value: string): CellClassification {
  const v = value.trim()
  if (!v) return { type: 'blank' }

  // Boolean check first — narrow set, unambiguous
  const lower = v.toLowerCase()
  if (BOOL_TRUE.has(lower)) return { type: 'boolean', bool: true }
  if (BOOL_FALSE.has(lower)) return { type: 'boolean', bool: false }

  // Date before number — "2024" alone shouldn't beat a full date string,
  // but "2024-03-14" MUST beat number parsing
  const d = detectDate(v)
  if (d) return { type: 'date', dateFormat: d.format, date: d.date }

  // Number / currency
  const n = detectNumber(v)
  if (n) {
    return {
      type: n.currencySymbol ? 'currency' : 'number',
      numeric: n.value,
      currencySymbol: n.currencySymbol,
    }
  }

  return { type: 'string' }
}

export interface ColumnProfile {
  name: string
  detectedType: ColumnType
  confidence: number // 0..1
  totalRows: number
  blankRows: number
  uniqueValues: number
  sampleValues: string[]
  /** Distribution of per-cell types — the raw evidence behind detectedType */
  typeCounts: Record<CellType, number>
  /** For date columns: which formats appeared (mixed formats → cleaning flag) */
  dateFormats?: Partial<Record<DateFormat, number>>
  /** For currency columns: symbols seen (mixed → cleaning flag) */
  currencySymbols?: Record<string, number>
  /** For numeric columns: min/max/mean, for outlier awareness in metric pass */
  numericStats?: { min: number; max: number; mean: number }
  /** Human-readable notes: mixed formats, mixed currencies, high null rate, etc. */
  flags: { level: 'info' | 'warning'; message: string }[]
}

/**
 * Profile one column. We're stringly-typed at input, so this walks every
 * non-blank cell, tallies the winners, and produces a confidence based on
 * how dominant the winning type is.
 */
export function profileColumn(name: string, values: string[]): ColumnProfile {
  const typeCounts: Record<CellType, number> = {
    blank: 0, number: 0, currency: 0, date: 0, boolean: 0, string: 0,
  }
  const dateFormats: Partial<Record<DateFormat, number>> = {}
  const currencySymbols: Record<string, number> = {}
  const numericSamples: number[] = []
  const uniqueVals = new Set<string>()
  const sampleValues: string[] = []

  for (const raw of values) {
    if (raw && sampleValues.length < 5 && !sampleValues.includes(raw)) sampleValues.push(raw)
    if (raw) uniqueVals.add(raw)
    const c = classifyCell(raw)
    typeCounts[c.type]++
    if (c.type === 'date' && c.dateFormat) dateFormats[c.dateFormat] = (dateFormats[c.dateFormat] ?? 0) + 1
    if (c.type === 'currency' && c.currencySymbol) currencySymbols[c.currencySymbol] = (currencySymbols[c.currencySymbol] ?? 0) + 1
    if ((c.type === 'number' || c.type === 'currency') && typeof c.numeric === 'number') numericSamples.push(c.numeric)
  }

  const totalRows = values.length
  const blankRows = typeCounts.blank
  const nonBlank = totalRows - blankRows

  // Pick the winning NON-blank type. Currency wins over plain number when
  // BOTH are present (a column that's 60% "$1,200" + 40% "1200" is a currency
  // column that happens to have some rows without the symbol).
  const candidates: [Exclude<CellType, 'blank'>, number][] = [
    ['date', typeCounts.date],
    ['currency', typeCounts.currency],
    ['number', typeCounts.number + typeCounts.currency], // number-family total, for tiebreak
    ['boolean', typeCounts.boolean],
    ['string', typeCounts.string],
  ]
  candidates.sort((a, b) => b[1] - a[1])

  let detected: ColumnType = candidates[0][0]
  const dominant = candidates[0][1]
  let confidence = nonBlank ? dominant / nonBlank : 0

  // Number vs currency reconciliation: prefer currency if ANY row was one
  if ((detected === 'number' || detected === 'string') && typeCounts.currency > 0) {
    detected = 'currency'
    confidence = (typeCounts.currency + typeCounts.number) / Math.max(nonBlank, 1)
  }

  // Low-cardinality string → category (helpful for top-N breakdowns later).
  // Threshold is intentionally loose because casing/whitespace variance is a
  // cleaning-stage concern (Milestone 2) — "us-east" and "US-East" will collapse
  // to one label, so we should treat them as one category NOW too. Cap at 20
  // distinct values so we don't misclassify unique-name columns as categorical.
  const CATEGORY_MAX_UNIQUE = 20
  const CATEGORY_MAX_RATIO = 0.5 // categories should repeat — <=50% distinct
  if (
    detected === 'string' &&
    nonBlank >= 3 &&
    uniqueVals.size <= CATEGORY_MAX_UNIQUE &&
    uniqueVals.size / nonBlank <= CATEGORY_MAX_RATIO
  ) {
    detected = 'category'
    confidence = 1 - uniqueVals.size / nonBlank
  }

  const flags: ColumnProfile['flags'] = []

  if (blankRows > 0) {
    const pct = Math.round((blankRows / totalRows) * 100)
    flags.push({
      level: pct >= 30 ? 'warning' : 'info',
      message: `${blankRows} of ${totalRows} rows (${pct}%) are blank`,
    })
  }

  if (detected === 'date' && Object.keys(dateFormats).length > 1) {
    flags.push({
      level: 'warning',
      message: `Mixed date formats: ${Object.entries(dateFormats).map(([f, n]) => `${f}×${n}`).join(', ')}. Cleaning will normalize to ISO.`,
    })
  }

  if (detected === 'currency' && Object.keys(currencySymbols).length > 1) {
    flags.push({
      level: 'warning',
      message: `Mixed currency symbols: ${Object.entries(currencySymbols).map(([s, n]) => `${s}×${n}`).join(', ')}. Ambiguous — need explicit currency-code guidance before aggregating.`,
    })
  } else if (detected === 'currency' && typeCounts.number > 0 && typeCounts.currency > 0) {
    flags.push({
      level: 'info',
      message: `${typeCounts.number} row(s) had no currency symbol — will be treated as the majority symbol.`,
    })
  }

  if (nonBlank > 0 && confidence < 0.85 && detected !== 'category') {
    flags.push({
      level: 'warning',
      message: `Mixed types in this column — ${JSON.stringify(typeCounts)}. Best guess "${detected}" at ${Math.round(confidence * 100)}% confidence.`,
    })
  }

  return {
    name,
    detectedType: detected,
    confidence: Math.min(1, Math.max(0, confidence)),
    totalRows,
    blankRows,
    uniqueValues: uniqueVals.size,
    sampleValues,
    typeCounts,
    dateFormats: Object.keys(dateFormats).length ? dateFormats : undefined,
    currencySymbols: Object.keys(currencySymbols).length ? currencySymbols : undefined,
    // NB: iterate rather than spread — `Math.max(...arr)` throws
    // "Maximum call stack size exceeded" on arrays past ~10-100k elements
    // (JS engine argument-count limit). Real datasets hit this instantly.
    numericStats: numericSamples.length
      ? (() => {
          let min = numericSamples[0], max = numericSamples[0], sum = 0
          for (const n of numericSamples) {
            if (n < min) min = n
            if (n > max) max = n
            sum += n
          }
          return { min, max, mean: sum / numericSamples.length }
        })()
      : undefined,
    flags,
  }
}
