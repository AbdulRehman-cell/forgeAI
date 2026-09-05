import type { Changelog } from './changelog'

/**
 * Category normalization — collapse case/whitespace variance so "us-east",
 * "US-EAST" and "US-East" all map to a single canonical label. Uses the
 * most-frequent original casing as the canonical form so the client sees
 * their preferred capitalization in charts, not ours.
 *
 * The `changed` map lets downstream code (or a UI review pane) show the
 * mapping — "42 rows had 'US-EAST' or 'US-East' rewritten to 'us-east'".
 */
export function cleanCategoryColumn(
  column: string,
  values: (string | null)[],
  log: Changelog,
): (string | null)[] {
  const norm = (s: string) => s.trim().toLowerCase()
  const bucketCounts = new Map<string, Map<string, number>>() // normKey → (originalForm → count)

  for (const v of values) {
    if (v === null || v === '') continue
    const k = norm(v)
    if (!bucketCounts.has(k)) bucketCounts.set(k, new Map())
    const inner = bucketCounts.get(k)!
    inner.set(v, (inner.get(v) ?? 0) + 1)
  }

  // For each bucket that had >1 original spelling, elect the most-common one
  // and remember the rewrites.
  const canon = new Map<string, string>() // originalForm → canonicalForm
  const collapses: { canonical: string; variants: string[]; rowsAffected: number }[] = []

  for (const [key, forms] of bucketCounts.entries()) {
    if (forms.size <= 1) continue
    const sorted = [...forms.entries()].sort((a, b) => b[1] - a[1])
    const canonical = sorted[0][0]
    const variants = sorted.slice(1).map(([f]) => f)
    let affected = 0
    for (const [form, count] of forms.entries()) {
      canon.set(form, canonical)
      if (form !== canonical) affected += count
    }
    collapses.push({ canonical, variants, rowsAffected: affected })
    // Suppress unused var warning
    void key
  }

  if (!collapses.length) return values

  log.add({
    kind: 'category_normalized',
    severity: 'info',
    column,
    count: collapses.reduce((n, c) => n + c.rowsAffected, 0),
    message: `${column}: collapsed case/whitespace variants — ${collapses.map((c) => `${c.variants.map((v) => `"${v}"`).join(',')} → "${c.canonical}"`).join('; ')}.`,
    details: { collapses },
  })

  return values.map((v) => (v === null ? null : (canon.get(v) ?? v)))
}
