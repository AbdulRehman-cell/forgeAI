/**
 * The cleaning-stage output the client actually READS. Every decision the
 * cleaner made — silently or not — becomes a Change entry with a stable kind
 * (for programmatic filtering) plus a human sentence (for the UI). We render
 * the sentences into a bulleted changelog at the end.
 *
 * Design rule (from the milestone spec): "flag over guess" — if we did
 * anything the user might disagree with, it MUST show up here.
 */
export type ChangeKind =
  | 'date_normalized'
  | 'date_unparseable'
  | 'currency_normalized'
  | 'currency_assumed'
  | 'currency_mixed_unresolved'
  | 'number_coerced'
  | 'number_unparseable'
  | 'null_kept'
  | 'null_filled'
  | 'null_row_dropped'
  | 'duplicate_removed'
  | 'category_normalized'
  | 'column_renamed'

export type ChangeSeverity = 'info' | 'warning' | 'error'

export interface Change {
  kind: ChangeKind
  severity: ChangeSeverity
  /** Column the change applies to, or 'row' for whole-row changes. */
  column: string
  /** How many rows were affected. */
  count: number
  /** Plain-English sentence surfaced to the client. */
  message: string
  /** Structured details — original vs. resolved value, or a config knob the
   *  user could set to change our behavior next time. */
  details?: Record<string, unknown>
}

export class Changelog {
  private entries: Change[] = []

  add(entry: Change) {
    this.entries.push(entry)
  }

  /** Merge repeated per-row changes on the same column into one entry with a
   *  count, so the changelog stays scannable instead of listing 400 identical
   *  "row X: date normalized" lines. */
  compact(): Change[] {
    const key = (c: Change) => `${c.kind}:${c.column}:${JSON.stringify(c.details ?? {})}`
    const merged = new Map<string, Change>()
    for (const c of this.entries) {
      const k = key(c)
      const prior = merged.get(k)
      if (prior) prior.count += c.count
      else merged.set(k, { ...c })
    }
    return [...merged.values()].sort((a, b) => {
      // Errors/warnings first, then by column name
      const sev = { error: 0, warning: 1, info: 2 }
      return sev[a.severity] - sev[b.severity] || a.column.localeCompare(b.column)
    })
  }

  /** Bullet list the client sees ("We removed 4 duplicate rows", …). */
  humanSummary(): string[] {
    return this.compact().map((c) => `• ${c.message}`)
  }
}
