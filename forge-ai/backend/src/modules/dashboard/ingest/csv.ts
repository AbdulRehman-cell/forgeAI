import Papa from 'papaparse'
import type { RawTable } from './index'

/**
 * Parse a CSV buffer. We treat everything as strings at this stage — the
 * profiler needs to see the raw text ("$1,234.56", "3/14/24") to classify
 * types. Coercion happens later, in the cleaning pipeline (Milestone 2).
 *
 * Papa's dynamicTyping is deliberately OFF for the same reason: silent number
 * coercion here would hide the mixed-format signal we want to detect.
 */
export function parseCsv(buffer: Buffer, filename: string): RawTable {
  // BOM stripping — Excel-exported CSVs frequently start with U+FEFF, which
  // otherwise ends up as the first character of the first header ("﻿id").
  const text = buffer.toString('utf-8').replace(/^﻿/, '')

  const parsed = Papa.parse<string[]>(text, {
    header: false,      // headers handled below so we can trim/dedupe them
    skipEmptyLines: 'greedy', // drop rows that are pure commas/whitespace
    dynamicTyping: false,
  })

  const parseWarnings = parsed.errors.map((e) => `row ${e.row}: ${e.message}`)

  const [headerRow, ...bodyRows] = parsed.data as string[][]
  if (!headerRow) throw new Error('CSV has no rows to read')

  // De-dup blank/duplicate headers by suffixing (Excel does this too). Silent
  // duplicates would collapse into the same column and lose data.
  const seen = new Map<string, number>()
  const headerNotes: string[] = []
  const headers = headerRow.map((raw, i) => {
    const base = (raw ?? '').trim() || `column_${i + 1}`
    const prior = seen.get(base) ?? 0
    seen.set(base, prior + 1)
    if (prior > 0) {
      const disambiguated = `${base}_${prior + 1}`
      headerNotes.push(`Duplicate header "${base}" at column ${i + 1} → renamed to "${disambiguated}"`)
      return disambiguated
    }
    if (!raw?.trim()) headerNotes.push(`Blank header at column ${i + 1} → named "${base}"`)
    return base
  })

  const rows: Record<string, string>[] = bodyRows.map((cells) => {
    const row: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (cells[i] ?? '').toString()
    }
    return row
  })

  return {
    kind: 'csv',
    filename,
    bytes: buffer.byteLength,
    headers,
    rows,
    notes: [...headerNotes, ...parseWarnings.slice(0, 10)],
  }
}
