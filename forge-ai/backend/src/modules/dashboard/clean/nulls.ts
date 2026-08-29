import type { Changelog } from './changelog'
import type { ColumnProfile } from '../profile/columnTypes'

/**
 * Null-handling is a client-facing decision, not a silent one. The DEFAULT
 * is 'keep' — nulls stay as null and get reported per column. Callers can
 * pass overrides ({ 'Qty': 'zero' }) when they know a metric column should be
 * treated as zero-when-missing (typical for counters).
 *
 * Deliberately no 'mean' fill for now — imputing means silently biases the
 * data toward the wrong story. If callers really want that, they can compute
 * the mean externally and pass a scalar via 'fill'.
 */
export type NullStrategy = { kind: 'keep' } | { kind: 'zero' } | { kind: 'fill'; value: number | string }

export function applyNullStrategy(
  column: string,
  values: (number | string | null)[],
  profile: ColumnProfile,
  strategy: NullStrategy | undefined,
  log: Changelog,
): (number | string | null)[] {
  let nulls = 0
  for (const v of values) if (v === null) nulls++
  if (nulls === 0) return values

  if (!strategy || strategy.kind === 'keep') {
    log.add({
      kind: 'null_kept',
      severity: profile.blankRows / profile.totalRows >= 0.3 ? 'warning' : 'info',
      column,
      count: nulls,
      message: `${column}: ${nulls} null value(s) kept as null (default). To fill instead, set nullStrategy.${column} = {"kind":"zero"} or {"kind":"fill","value":X}.`,
    })
    return values
  }

  const fillValue = strategy.kind === 'zero' ? 0 : strategy.value
  log.add({
    kind: 'null_filled',
    severity: 'info',
    column,
    count: nulls,
    message: `${column}: filled ${nulls} null value(s) with ${JSON.stringify(fillValue)}.`,
    details: { strategy: strategy.kind, fillValue },
  })
  return values.map((v) => (v === null ? fillValue : v))
}
