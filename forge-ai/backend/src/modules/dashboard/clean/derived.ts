import type { CleanedRow } from './index'
import type { ColumnProfile } from '../profile/columnTypes'
import type { Change } from './changelog'

/**
 * Post-cleaning derived-column stage. Real BI dashboards live on calculated
 * measures — Revenue = price × qty, Cost = unit_cost × qty, Profit = the
 * difference. Raw source rows rarely have these as literal columns, so no
 * dashboard can show them without a derivation pass.
 *
 * We deliberately keep this narrow at MVP:
 *   - Match column names heuristically (price/cost/qty vocabulary)
 *   - Only compute derived columns when the trigger columns exist AND are
 *     numeric/currency in the cleaned schema
 *   - Never silently overwrite an existing column of the same name
 *
 * Every derivation is logged so the client sees exactly what was computed
 * and from which source columns.
 */

export interface DerivationResult {
  rows: CleanedRow[]
  addedColumns: {
    name: string
    kind: 'currency' | 'number'
    /** ISO code copied from the source column (if any) so downstream metrics
     *  can display "$1,234" not "1234". */
    currencyIso?: string | null
    /** Human-readable formula, surfaced in changelog + tooltip. */
    formula: string
    /** Source columns actually used — for auditability. */
    sources: string[]
  }[]
  changelog: Change[]
}

// Regex ordering matters: more specific patterns first. Test on normalized
// (spaces instead of _/-) column names for snake_case tolerance — same trick
// the metric inference uses.
const NORM = (n: string) => n.replace(/[_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase()

const PRICE_PATTERNS = [
  /\blist[_ ]?price\b/i,
  /\bretail[_ ]?price\b/i,
  /\bunit[_ ]?price\b/i,
  /\bprice\b/i,
  /\bamount\b/i,
]
const COST_PATTERNS = [
  /\bstandard[_ ]?cost\b/i,
  /\bunit[_ ]?cost\b/i,
  /\bcost\b/i,
  /\bcogs\b/i,
]
const QTY_PATTERNS = [
  /\bquantity\b/i,
  /\bqty\b/i,
  /\bunits?\b/i,
]

/** Find the FIRST numeric/currency column matching any of the given patterns. */
function pickColumn(schema: ColumnProfile[], patterns: RegExp[]): ColumnProfile | undefined {
  for (const pat of patterns) {
    for (const c of schema) {
      if (c.detectedType !== 'currency' && c.detectedType !== 'number') continue
      if (pat.test(NORM(c.name))) return c
    }
  }
  return undefined
}

export function deriveColumns(
  rows: CleanedRow[],
  schema: ColumnProfile[],
  currencyByColumn: Map<string, string | null>,
): DerivationResult {
  const changelog: Change[] = []
  const addedColumns: DerivationResult['addedColumns'] = []
  const existingNames = new Set(schema.map((c) => c.name))
  const priceCol = pickColumn(schema, PRICE_PATTERNS)
  const costCol = pickColumn(schema, COST_PATTERNS)
  const qtyCol = pickColumn(schema, QTY_PATTERNS)

  // Also try: bare "revenue"/"sales"/"total" already in the data — if present,
  // treat as the revenue column so downstream stages have a canonical name.
  const existingRevenue = schema.find((c) => (c.detectedType === 'currency' || c.detectedType === 'number') && /\b(revenue|net[_ ]?sales|gross[_ ]?sales)\b/i.test(NORM(c.name)))

  const addColumn = (
    name: string,
    kind: 'currency' | 'number',
    currencyIso: string | null | undefined,
    formula: string,
    sources: string[],
    compute: (r: CleanedRow) => number | null,
  ) => {
    if (existingNames.has(name)) return // don't clobber a real source column
    let filled = 0
    for (const r of rows) {
      const v = compute(r)
      r[name] = v === null || !Number.isFinite(v) ? null : v
      if (typeof r[name] === 'number') filled++
    }
    addedColumns.push({ name, kind, currencyIso, formula, sources })
    if (kind === 'currency' && currencyIso) currencyByColumn.set(name, currencyIso)
    changelog.push({
      kind: 'column_renamed', // reuse an existing changelog kind — surfaced as info
      severity: 'info',
      column: name,
      count: filled,
      message: `Derived new column "${name}" = ${formula}. Populated in ${filled} of ${rows.length} rows.`,
      details: { formula, sources, filled, total: rows.length },
    })
    existingNames.add(name)
  }

  // ── Revenue ──
  // Priority: use an already-present "revenue" column if we detected one.
  // Otherwise derive from price × qty if both are numeric.
  if (!existingRevenue && priceCol && qtyCol) {
    const iso = currencyByColumn.get(priceCol.name)
    addColumn(
      'revenue',
      priceCol.detectedType === 'currency' ? 'currency' : 'number',
      iso,
      `${priceCol.name} × ${qtyCol.name}`,
      [priceCol.name, qtyCol.name],
      (r) => {
        const p = r[priceCol.name], q = r[qtyCol.name]
        if (typeof p !== 'number' || typeof q !== 'number') return null
        return p * q
      },
    )
  }

  // ── Cost total ──
  if (costCol && qtyCol) {
    const iso = currencyByColumn.get(costCol.name)
    addColumn(
      'cost_total',
      costCol.detectedType === 'currency' ? 'currency' : 'number',
      iso,
      `${costCol.name} × ${qtyCol.name}`,
      [costCol.name, qtyCol.name],
      (r) => {
        const c = r[costCol.name], q = r[qtyCol.name]
        if (typeof c !== 'number' || typeof q !== 'number') return null
        return c * q
      },
    )
  }

  // ── Profit ── (needs revenue AND cost_total present, either derived or original)
  const revColName = existingRevenue?.name ?? (addedColumns.find((c) => c.name === 'revenue') ? 'revenue' : null)
  const costColName = addedColumns.find((c) => c.name === 'cost_total') ? 'cost_total' : null
  if (revColName && costColName) {
    const iso = currencyByColumn.get(revColName)
    addColumn(
      'profit',
      'currency',
      iso,
      `${revColName} − ${costColName}`,
      [revColName, costColName],
      (r) => {
        const rev = r[revColName], c = r[costColName]
        if (typeof rev !== 'number' || typeof c !== 'number') return null
        return rev - c
      },
    )
  }

  return { rows, addedColumns, changelog }
}
