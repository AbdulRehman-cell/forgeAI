import type { RawTable } from '../ingest'
import { profileColumn, type ColumnProfile } from './columnTypes'
import { inferMetrics, type MetricCandidate } from './metricInference'

/**
 * The single output of the profiling stage. Everything downstream (cleaning,
 * metric selection, rendering) consumes THIS structure — no reaching back
 * into the raw rows. That keeps stages independently swappable/testable.
 *
 * Design principle: every guess we made appears here with evidence. Nothing
 * silent. If a column's role or type is ambiguous, it lands in openQuestions
 * where the client can see it before we start doing math on the data.
 */
export interface SchemaReport {
  source: {
    kind: 'csv' | 'xlsx'
    filename: string
    bytes: number
    rows: number
    columns: number
  }
  parseNotes: string[]
  columns: ColumnProfile[]
  primaryMetricCandidates: MetricCandidate[]
  primaryTimeAxisCandidate: MetricCandidate | null
  categoryCandidates: MetricCandidate[]
  idCandidates: MetricCandidate[]
  /** Human-language things the client should look at before we clean/aggregate.
   *  Populated from any column with warning-level flags plus cross-column checks
   *  (e.g. "two plausible time axes — pick one"). */
  openQuestions: string[]
  generatedAt: string
}

export function buildSchemaReport(table: RawTable): SchemaReport {
  const columns: ColumnProfile[] = table.headers.map((h) => {
    const values = table.rows.map((r) => r[h] ?? '')
    return profileColumn(h, values)
  })

  const metrics = inferMetrics(columns)
  const timeAxes = metrics.filter((m) => m.kind === 'time-axis')
  const primaryTimeAxis = timeAxes[0] ?? null

  const primaryMetricCandidates = metrics.filter((m) =>
    m.kind === 'revenue' || m.kind === 'cost' || m.kind === 'count' ||
    m.kind === 'quantity' || m.kind === 'rate',
  )

  const openQuestions: string[] = []

  // Column-level warnings become questions
  for (const col of columns) {
    for (const flag of col.flags) {
      if (flag.level === 'warning') openQuestions.push(`"${col.name}": ${flag.message}`)
    }
  }

  // Cross-column: multiple time axes
  if (timeAxes.length > 1) {
    openQuestions.push(
      `Multiple date columns detected (${timeAxes.map((t) => t.column).join(', ')}). ` +
      `Which is the primary reporting axis (order date, invoice date, delivery date)?`,
    )
  }

  // Cross-column: no time axis at all → time-series charts won't be possible
  if (timeAxes.length === 0) {
    openQuestions.push(
      'No date/time column detected. Time-series metrics (revenue-over-time, growth rate) will be unavailable ' +
      'until one is provided.',
    )
  }

  // Cross-column: no revenue candidate but the source LOOKS like sales data
  const looksLikeSales = /sale|order|invoice|transaction|revenue/i.test(table.filename)
  const hasRevenue = primaryMetricCandidates.some((m) => m.kind === 'revenue')
  if (looksLikeSales && !hasRevenue) {
    openQuestions.push(
      `Filename hints at sales data but no revenue column was confidently identified. ` +
      `Consider renaming the value column to "revenue", "total", or "amount".`,
    )
  }

  return {
    source: {
      kind: table.kind,
      filename: table.filename,
      bytes: table.bytes,
      rows: table.rows.length,
      columns: table.headers.length,
    },
    parseNotes: table.notes,
    columns,
    primaryMetricCandidates,
    primaryTimeAxisCandidate: primaryTimeAxis,
    categoryCandidates: metrics.filter((m) => m.kind === 'category'),
    idCandidates: metrics.filter((m) => m.kind === 'id'),
    openQuestions,
    generatedAt: new Date().toISOString(),
  }
}
