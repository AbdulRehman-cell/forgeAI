import type * as XLSXTypes from 'xlsx'
import type { RawTable } from './index'

// Loaded on first use: xlsx costs ~12 MB of heap and the server's heap is
// capped at 120 MB — keeping it out of startup leaves room for site builds.
const loadXlsx = (): typeof XLSXTypes => require('xlsx')

/**
 * Parse the FIRST sheet of an .xlsx / .xls file. Multi-sheet workbooks are
 * a Milestone 5+ concern (which sheet does the client want? do we join?);
 * for now we read sheet 0 and surface the other sheet names as a note so the
 * client can see we didn't just silently pick one.
 *
 * `raw: false` gives us formatted strings ("$1,234.56") the same way the user
 * sees them in Excel — matching CSV's stringly-typed input to the profiler.
 */
export function parseXlsx(buffer: Buffer, filename: string): RawTable {
  const XLSX = loadXlsx()
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellNF: false })
  const sheetNames = workbook.SheetNames
  if (!sheetNames.length) throw new Error('Workbook has no sheets')

  const primary = sheetNames[0]
  const sheet = workbook.Sheets[primary]
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
    raw: false, // formatted text, not native numbers, so mixed formats stay visible
    blankrows: false,
  })

  if (!aoa.length) throw new Error(`Sheet "${primary}" is empty`)

  const [headerRow, ...bodyRows] = aoa

  const seen = new Map<string, number>()
  const headerNotes: string[] = []
  const headers = headerRow.map((raw: any, i: number) => {
    const base = String(raw ?? '').trim() || `column_${i + 1}`
    const prior = seen.get(base) ?? 0
    seen.set(base, prior + 1)
    if (prior > 0) {
      const disambiguated = `${base}_${prior + 1}`
      headerNotes.push(`Duplicate header "${base}" at column ${i + 1} → renamed to "${disambiguated}"`)
      return disambiguated
    }
    if (!String(raw ?? '').trim()) headerNotes.push(`Blank header at column ${i + 1} → named "${base}"`)
    return base
  })

  const rows: Record<string, string>[] = bodyRows.map((cells) => {
    const row: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = String(cells[i] ?? '')
    }
    return row
  })

  const notes = [...headerNotes]
  if (sheetNames.length > 1) {
    notes.push(`Workbook has ${sheetNames.length} sheets — read the first ("${primary}"). Other sheets ignored: ${sheetNames.slice(1).join(', ')}`)
  }

  return { kind: 'xlsx', filename, bytes: buffer.byteLength, headers, rows, notes }
}
