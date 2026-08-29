import type { RawTable } from '../ingest'
import type { SchemaReport } from '../profile/schemaReport'
import type { ColumnProfile } from '../profile/columnTypes'
import { cleanDateColumn } from './cleanDates'
import { cleanNumberColumn, type CurrencyDecision } from './cleanNumbers'
import { cleanCategoryColumn } from './cleanCategories'
import { applyNullStrategy, type NullStrategy } from './nulls'
import { deduplicateRows } from './dedupe'
import { deriveColumns } from './derived'
import { Changelog, type Change } from './changelog'

/**
 * Config knobs — everything the client can pre-declare so the cleaner doesn't
 * have to guess. Every unset knob falls back to the safest default (keep
 * nulls, warn on ambiguous currency, dedupe on).
 */
export interface CleaningConfig {
  /** Force a column to be treated as a specific ISO currency (USD, EUR, …). */
  currencyOverrides?: Record<string, string>
  /** Per-column null strategy. Default across all columns is { kind: 'keep' }. */
  nullStrategy?: Record<string, NullStrategy>
  /** Turn dedup off if the source legitimately has repeatable rows. */
  dedupe?: boolean
}

/** A single cleaned row — the value shape now matches the column's inferred
 *  type: dates are ISO strings, numbers are number, categories/strings are
 *  string, nulls stay null. */
export type CleanedRow = Record<string, string | number | null>

export interface CleaningResult {
  cleanedRows: CleanedRow[]
  changelog: Change[]
  /** For every currency column: what ISO code we treated it as and why.
   *  Milestone 3+ metric aggregation MUST reject cross-currency sums using this. */
  currencyDecisions: CurrencyDecision[]
  /** Human-readable bullet list — safe to render verbatim in the UI. */
  humanChangelog: string[]
  /** Post-cleaning derived columns (revenue/cost/profit) added by the pipeline.
   *  Downstream stages (planner/aggregator) treat them like any other column. */
  derivedColumns: {
    name: string
    kind: 'currency' | 'number'
    currencyIso?: string | null
    formula: string
    sources: string[]
  }[]
  stats: {
    rowsIn: number
    rowsOut: number
    duplicatesRemoved: number
    columnsProcessed: number
    warnings: number
    errors: number
  }
}

/**
 * Run every cleaning pass in order. Each column stage is independent so we
 * can swap/add stages (e.g. text-column PII redaction) without touching the
 * others. Any errors surface as changelog entries — the pipeline never
 * throws for a single bad cell, because one messy row shouldn't kill the
 * whole dashboard.
 */
export function cleanTable(
  table: RawTable,
  schema: SchemaReport,
  config: CleaningConfig = {},
): CleaningResult {
  const log = new Changelog()
  const columns = schema.columns
  const columnByName = new Map(columns.map((c) => [c.name, c]))
  const currencyDecisions: CurrencyDecision[] = []

  // Per-column cleaned value arrays, keyed by column name. Same length as
  // input rows — dedup happens after column cleaning.
  const cleaned: Record<string, (string | number | null)[]> = {}

  for (const col of columns) {
    // Read raw column values as (string | null)
    const rawValues: (string | null)[] = table.rows.map((r) => {
      const v = r[col.name]
      return v === undefined || v === '' ? null : v
    })

    let processed: (string | number | null)[]

    if (col.detectedType === 'date') {
      processed = cleanDateColumn(col.name, rawValues, log)
    } else if (col.detectedType === 'currency' || col.detectedType === 'number') {
      const { values, decision } = cleanNumberColumn(
        col.name, rawValues, col, log, config.currencyOverrides?.[col.name],
      )
      processed = values
      if (col.detectedType === 'currency') currencyDecisions.push(decision)
    } else if (col.detectedType === 'category') {
      processed = cleanCategoryColumn(col.name, rawValues, log)
    } else if (col.detectedType === 'boolean') {
      processed = rawValues.map((v) => {
        if (v === null) return null
        const lower = v.toLowerCase()
        if (['true', 'yes', 'y', '1', 't'].includes(lower)) return 'true'
        if (['false', 'no', 'n', '0', 'f'].includes(lower)) return 'false'
        return v
      })
    } else {
      // string — trim whitespace only, nothing else. Text is user content;
      // silent transforms lose fidelity.
      processed = rawValues.map((v) => (v === null ? null : v.trim()))
    }

    // Null strategy pass.
    // Boolean flag columns (low_fat, recyclable, is_active, …) default to
    // fill-with-false because null on a flag almost always means "no / not set".
    // Any explicit per-column override in config.nullStrategy takes precedence.
    const strategy = config.nullStrategy?.[col.name]
      ?? (col.detectedType === 'boolean' ? { kind: 'fill' as const, value: 'false' } : undefined)
    processed = applyNullStrategy(col.name, processed, col, strategy, log)

    cleaned[col.name] = processed
  }

  // Reassemble row-oriented data. Release each per-column array as it's
  // consumed so GC can reclaim memory before we peak. On a 269K-row × 30-col
  // dataset the difference is ~400 MB of RAM held vs released.
  const rowCount = table.rows.length
  let cleanedRows: CleanedRow[] = new Array(rowCount)
  for (let i = 0; i < rowCount; i++) {
    const row: CleanedRow = {}
    for (const col of columns) row[col.name] = cleaned[col.name][i]
    cleanedRows[i] = row
  }
  // Now the per-column map is no longer needed — release it so the derived
  // columns step + downstream stages don't hold three copies of the data.
  // Deliberately do NOT clear table.rows: the caller owns that array and may
  // reuse it for a second pass with different config (tests do this).
  for (const key of Object.keys(cleaned)) delete cleaned[key]

  // Dedup pass — on by default for small datasets, OFF by default above
  // 50K rows (JSON.stringify(row) on wide rows blows past the 4GB Node heap
  // in ~200K rows). Users who genuinely need dedup on large data can force it
  // with { dedupe: true }. Also skipped when the input was already star-joined
  // (a LEFT JOIN can't create duplicates from the fact side).
  const rowsBeforeDedup = cleanedRows.length
  const LARGE_DATASET_ROWS = 50_000
  const isStarJoined = /^star:/.test(table.filename ?? '')
  const dedupEnabled = config.dedupe === true
    || (config.dedupe !== false && cleanedRows.length < LARGE_DATASET_ROWS && !isStarJoined)
  if (dedupEnabled) {
    cleanedRows = deduplicateRows(cleanedRows, log)
  } else if (config.dedupe !== true && (cleanedRows.length >= LARGE_DATASET_ROWS || isStarJoined)) {
    log.add({
      kind: 'duplicate_removed',
      severity: 'info',
      column: 'row',
      count: 0,
      message: `Skipped row deduplication (${isStarJoined ? 'input was star-joined — duplicates from the fact side impossible' : `${cleanedRows.length.toLocaleString()} rows exceeds the ${LARGE_DATASET_ROWS.toLocaleString()}-row auto-skip threshold`}). To force dedup, pass { dedupe: true }.`,
    })
  }

  // Derived columns — must run AFTER cleaning so we know the coerced numeric
  // values and currency decisions. Adds revenue/cost_total/profit when the
  // source has price+qty+cost columns, so downstream metrics can show them.
  const currencyByColumn = new Map<string, string | null>(currencyDecisions.map((d) => [d.column, d.resolvedIso]))
  const derived = deriveColumns(cleanedRows, columns, currencyByColumn)
  for (const entry of derived.changelog) log.add(entry)
  const derivedColumns = derived.addedColumns

  const compacted = log.compact()
  return {
    cleanedRows,
    changelog: compacted,
    currencyDecisions: currencyDecisions.concat(
      derivedColumns
        .filter((d) => d.kind === 'currency' && d.currencyIso)
        .map((d) => ({ column: d.name, resolvedIso: d.currencyIso!, source: 'config' as const })),
    ),
    humanChangelog: log.humanSummary(),
    derivedColumns,
    stats: {
      rowsIn: rowCount,
      rowsOut: cleanedRows.length,
      duplicatesRemoved: rowsBeforeDedup - cleanedRows.length,
      columnsProcessed: columns.length,
      warnings: compacted.filter((c) => c.severity === 'warning').length,
      errors: compacted.filter((c) => c.severity === 'error').length,
    },
  }
}

// Re-exports for convenience
export { type Change, type NullStrategy, type CurrencyDecision, type ColumnProfile }
