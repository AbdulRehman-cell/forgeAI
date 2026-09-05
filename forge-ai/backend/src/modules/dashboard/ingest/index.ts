import { parseCsv } from './csv'
import { parseXlsx } from './xlsx'

/**
 * A parsed source table — the common shape every ingest emits and every
 * downstream stage (profile, clean, metric) consumes. Rows are stringly-typed
 * because coercion is a cleaning-stage decision (Milestone 2), not an ingest
 * one — silently converting "$1,234.56" to a number here would hide the
 * currency-mixing signal we want to detect.
 */
export interface RawTable {
  kind: 'csv' | 'xlsx'
  filename: string
  bytes: number
  headers: string[]
  rows: Record<string, string>[]
  /** Human-readable notes from the parser (blank headers, dropped sheets, …).
   *  Every note ends up in the schema report so nothing about the parse is
   *  invisible to the client. */
  notes: string[]
}

const CSV_MIMES = new Set([
  'text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'text/x-csv',
])
const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/octet-stream', // some clients upload xlsx with a generic mime
])

/** Dispatch on mime type + filename extension. Filename wins for ambiguous
 *  cases (`text/plain` for a .csv, `application/octet-stream` for an .xlsx). */
export function ingest(buffer: Buffer, filename: string, mimeType: string): RawTable {
  const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
  if (ext === 'csv' || (CSV_MIMES.has(mimeType) && ext !== 'xlsx' && ext !== 'xls')) {
    return parseCsv(buffer, filename)
  }
  if (ext === 'xlsx' || ext === 'xls' || XLSX_MIMES.has(mimeType)) {
    return parseXlsx(buffer, filename)
  }
  throw new Error(`Unsupported file type: mime="${mimeType}" filename="${filename}". Upload a .csv or .xlsx file.`)
}
