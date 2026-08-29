import type { Changelog } from './changelog'

/**
 * Row-level exact-match deduplication after all columns have been cleaned.
 * We hash on the STRING form of the whole row so post-cleaning duplicates
 * (e.g. two rows that differed only in date format but resolved to the same
 * ISO date) get caught. First occurrence wins; every removal shows up in the
 * changelog with an example so the client can sanity-check the dedup rule.
 */
export function deduplicateRows<T extends Record<string, unknown>>(
  rows: T[],
  log: Changelog,
): T[] {
  const seen = new Map<string, number>() // key → original row index
  const kept: T[] = []
  const removed: { rowIndex: number; matchingFirstIndex: number; keyPreview: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const key = JSON.stringify(row)
    const firstIdx = seen.get(key)
    if (firstIdx === undefined) {
      seen.set(key, i)
      kept.push(row)
    } else {
      removed.push({ rowIndex: i + 1, matchingFirstIndex: firstIdx + 1, keyPreview: key.slice(0, 120) })
    }
  }

  if (removed.length) {
    log.add({
      kind: 'duplicate_removed',
      severity: 'info',
      column: 'row',
      count: removed.length,
      message: `Removed ${removed.length} duplicate row(s) (kept the first occurrence). Example: row ${removed[0].rowIndex} matched row ${removed[0].matchingFirstIndex}.`,
      details: { examples: removed.slice(0, 5) },
    })
  }

  return kept
}
