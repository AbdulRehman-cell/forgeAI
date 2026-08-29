import { detectDate } from '../profile/dateDetection'
import type { Changelog } from './changelog'

/**
 * Normalize a date column. Every non-blank cell that WAS a recognizable date
 * becomes ISO ("2024-03-14"). Unparseable cells become null and get logged as
 * `date_unparseable` — never silently dropped, never left as raw text that
 * would poison downstream aggregation.
 *
 * We keep the ISO string form (not Date) because it round-trips through JSON
 * cleanly and is what the rendering layer wants to display anyway.
 */
export function cleanDateColumn(
  column: string,
  values: (string | null)[],
  log: Changelog,
): (string | null)[] {
  let normalized = 0
  const unparseable: { row: number; raw: string }[] = []
  const formats = new Set<string>()

  const out = values.map((v, i) => {
    if (v === null || v === '') return null
    const match = detectDate(v)
    if (!match) {
      unparseable.push({ row: i + 1, raw: v })
      return null
    }
    formats.add(match.format)
    normalized++
    // Emit as YYYY-MM-DD (UTC) — cleaning-stage dates are date-only, times
    // stay in the original column as a string suffix if the source had them.
    return match.date.toISOString().slice(0, 10)
  })

  if (normalized > 0 && (formats.size > 1 || (formats.size === 1 && !formats.has('iso')))) {
    log.add({
      kind: 'date_normalized',
      severity: 'info',
      column,
      count: normalized,
      message: `${column}: normalized ${normalized} date value(s) from ${[...formats].join(', ')} to ISO (YYYY-MM-DD).`,
      details: { formats: [...formats] },
    })
  }

  if (unparseable.length) {
    log.add({
      kind: 'date_unparseable',
      severity: 'warning',
      column,
      count: unparseable.length,
      message: `${column}: ${unparseable.length} value(s) could not be parsed as dates and were kept as null (examples: ${unparseable.slice(0, 3).map((u) => `row ${u.row}="${u.raw}"`).join('; ')}).`,
      details: { examples: unparseable.slice(0, 5) },
    })
  }

  return out
}
