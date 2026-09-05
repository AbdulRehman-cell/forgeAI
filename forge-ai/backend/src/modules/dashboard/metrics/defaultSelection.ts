import type { SchemaReport } from '../profile/schemaReport'
import type { CleaningResult } from '../clean'

/**
 * A metric = "one number or one series the dashboard will chart." We keep
 * this deliberately narrow at Milestone 3 per spec: total-of-primary-money,
 * primary-money-over-time, growth rate, top-N by each category. Deep BI
 * (cohorts, funnels, retention, LTV) is out of scope until the base loop
 * is proven with real users.
 */
export type MetricKind =
  | 'total'                 // sum of a numeric/currency column
  | 'average'               // mean of a numeric column
  | 'distinct_count'        // unique values in a column
  | 'timeseries'            // numeric aggregated by time bucket
  | 'multi_series'          // multiple numeric columns on ONE time chart (Revenue+Cost+Profit)
  | 'growth_rate'           // (current period / previous period) - 1
  | 'period_comparison'     // KPI: current period value + previous period value + delta
  | 'top_n'                 // sum grouped by category, top N (rendered as bar)
  | 'donut'                 // same math as top_n, rendered as donut
  | 'grouped_bar'           // Group by A, split by B, sum numeric — 2-dim breakdown
  | 'table'                 // full breakdown (group → numeric aggregates), rendered as a data table
  | 'gauge'                 // single-value with min/max/target (rendered as semicircle)
  | 'ratio'                 // numeric_A / numeric_B (e.g. returns / orders → return rate)

/** Layout hint the renderer uses to decide tile size + placement. */
export type MetricLayout = 'hero' | 'full' | 'half' | 'third'

export interface MetricSpec {
  /** Stable id so config overrides can reference it. */
  id: string
  kind: MetricKind
  /** The numeric column being aggregated. null for growth_rate/multi_series. */
  valueColumn: string | null
  /** For multi_series — the numeric columns overlaid on one chart. */
  valueColumns?: string[]
  /** For timeseries/growth_rate/multi_series/period_comparison — the date column. */
  timeColumn?: string
  /** For top_n / donut / table / grouped_bar — the category column. */
  groupColumn?: string
  /** For grouped_bar — secondary split column ("Category × Gender"). */
  splitColumn?: string
  /** For top_n / donut — how many entries. */
  n?: number
  /** For gauge — target (100% mark) and min (0% mark). */
  gauge?: { min?: number; target: number }
  /** For table — which additional value columns to include as columns. */
  extraColumns?: string[]
  /** For ratio — the two numeric columns. Result = sum(numeratorColumn) / sum(denominatorColumn). */
  numeratorColumn?: string
  denominatorColumn?: string
  /** For ratio — render as percent (0.15 → 15%) or a raw ratio. */
  ratioAsPercent?: boolean
  /** Human label for the chart. */
  label: string
  /** Layout hint (renderer decides final size). */
  layout?: MetricLayout
  /** Why the picker chose this — surfaced to the UI so users understand. */
  reasoning: string
}

/**
 * Refuse to build a metric that would sum values from a column still flagged
 * with a cleaning ERROR (mixed unresolved currency). Better to render "action
 * required" than a wrong number.
 */
export function columnIsSafeToSum(cleaning: CleaningResult, column: string): boolean {
  const error = cleaning.changelog.find(
    (c) => c.severity === 'error' && c.column === column,
  )
  return !error
}

/**
 * Pick the default metric set from the schema + cleaning result. Any column
 * with an ERROR-severity cleaning issue is EXCLUDED and reported in the
 * `skipped` array so the client sees why.
 */
export function pickDefaultMetrics(
  schema: SchemaReport,
  cleaning: CleaningResult,
): { picked: MetricSpec[]; skipped: { column: string; reason: string }[] } {
  const picked: MetricSpec[] = []
  const skipped: { column: string; reason: string }[] = []

  const revenue = schema.primaryMetricCandidates.find((m) => m.kind === 'revenue')
  const quantity = schema.primaryMetricCandidates.find((m) => m.kind === 'quantity' || m.kind === 'count')
  const time = schema.primaryTimeAxisCandidate

  const addTotal = (col: string, reasoning: string) => {
    if (!columnIsSafeToSum(cleaning, col)) {
      skipped.push({ column: col, reason: `${col}: has an unresolved cleaning error (see changelog). Total will not aggregate correctly until fixed.` })
      return
    }
    // Skip the "Total " prefix when the column name already contains the word,
    // so we get "Total Revenue" but "Total" (not "Total Total").
    const label = /\btotal\b/i.test(col) ? col : `Total ${col}`
    picked.push({
      id: `total_${col}`,
      kind: 'total',
      valueColumn: col,
      layout: 'hero',
      label,
      reasoning,
    })
  }

  if (revenue) addTotal(revenue.column, `Primary revenue candidate (${Math.round(revenue.confidence * 100)}% confidence).`)
  if (quantity) addTotal(quantity.column, `Primary volume candidate (${Math.round(quantity.confidence * 100)}% confidence).`)

  // Also emit a Profit KPI whenever a `profit` column exists (usually derived
  // by the cleaning stage's derived-columns step). Matches the Power BI
  // "Total Revenue + Total Profit" hero row.
  const profitCol = schema.columns.find((c) => c.name === 'profit' && (c.detectedType === 'currency' || c.detectedType === 'number'))
  if (profitCol && (!revenue || profitCol.name !== revenue.column)) {
    addTotal(profitCol.name, `Auto-derived profit column.`)
  }
  const costCol = schema.columns.find((c) => c.name === 'cost_total' && (c.detectedType === 'currency' || c.detectedType === 'number'))
  if (costCol) addTotal(costCol.name, `Auto-derived total-cost column.`)

  // Distinct-count KPIs — every id-like column becomes a hero KPI (unique
  // customers, unique orders, unique products). Cap at 3 to avoid clutter.
  // Human label picks a business-friendly name from the column name.
  const humanId = (col: string): string => {
    const n = col.toLowerCase()
    if (/customer/.test(n)) return 'Unique Customers'
    if (/order|transaction/.test(n)) return 'Total Orders'
    if (/product|sku/.test(n)) return 'Unique Products'
    if (/user|account/.test(n)) return 'Unique Users'
    return `Unique ${col}`
  }
  for (const idCandidate of schema.idCandidates.slice(0, 3)) {
    picked.push({
      id: `distinct_${idCandidate.column}`,
      kind: 'distinct_count',
      valueColumn: idCandidate.column,
      layout: 'hero',
      label: humanId(idCandidate.column),
      reasoning: `Distinct count of ${idCandidate.column} (${Math.round(idCandidate.confidence * 100)}% id-column confidence).`,
    })
  }

  // Average Order Value — revenue / distinct orders — a classic BI KPI.
  // Only emit when we have BOTH a revenue-shaped column AND an order/transaction id.
  const aovBase = schema.columns.find((c) => c.name === 'revenue' && (c.detectedType === 'currency' || c.detectedType === 'number'))
  const orderId = schema.idCandidates.find((i) => /order|transaction/i.test(i.column))
  if (aovBase && orderId) {
    picked.push({
      id: `avg_order_value`,
      kind: 'average',
      valueColumn: aovBase.name,
      layout: 'hero',
      label: 'Avg Order Value',
      reasoning: `Average of revenue per row (proxy for AOV since one row = one transaction line).`,
    })
  }

  // Timeseries — value column over time. Prefer revenue, but if revenue was
  // blocked by an unresolved cleaning error (typically mixed currency), fall
  // through to quantity/count rather than dropping trends+top-N entirely.
  // Previous version used `revenue?.column ?? quantity?.column`, then a safety
  // check that killed the whole trends section if revenue existed-but-unsafe.
  const timeseriesValueCol =
    (revenue && columnIsSafeToSum(cleaning, revenue.column)) ? revenue.column
    : (quantity && columnIsSafeToSum(cleaning, quantity.column)) ? quantity.column
    : null
  if (time && timeseriesValueCol) {
    // Multi-series line when multiple compatible numeric columns exist (e.g.
    // Revenue + Cost + Profit) — much richer than a single line. Uses safe-to-
    // sum numeric/currency columns other than the primary value one.
    // Exclude ID columns (product_id, customer_id) and pre-computed scalars (_scalar suffix)
    // — these don't vary meaningfully over time and make revenue appear completely flat.
    const idColSet = new Set(schema.idCandidates.map((id) => id.column))
    const additional = schema.columns
      .filter((c) =>
        (c.detectedType === 'currency' || c.detectedType === 'number') &&
        c.name !== timeseriesValueCol &&
        columnIsSafeToSum(cleaning, c.name) &&
        !idColSet.has(c.name) &&
        !/_scalar$/i.test(c.name))
      .map((c) => c.name)
      .slice(0, 2)
    if (additional.length) {
      picked.push({
        id: `multi_series_over_${time.column}`,
        kind: 'multi_series',
        valueColumn: null,
        valueColumns: [timeseriesValueCol, ...additional],
        timeColumn: time.column,
        layout: 'full',
        label: `${[timeseriesValueCol, ...additional].join(' · ')} over time`,
        reasoning: `Multiple numeric columns overlaid on the primary time axis.`,
      })
    } else {
      picked.push({
        id: `timeseries_${timeseriesValueCol}_over_${time.column}`,
        kind: 'timeseries',
        valueColumn: timeseriesValueCol,
        timeColumn: time.column,
        layout: 'full',
        label: `${timeseriesValueCol} over time`,
        reasoning: `${timeseriesValueCol} bucketed by ${time.column} (primary time axis at ${Math.round(time.confidence * 100)}% confidence).`,
      })
    }
    picked.push({
      id: `growth_${timeseriesValueCol}`,
      kind: 'growth_rate',
      valueColumn: timeseriesValueCol,
      timeColumn: time.column,
      layout: 'hero',
      label: `${timeseriesValueCol} growth`,
      reasoning: `Compares the most recent full time bucket against the prior one.`,
    })
  }

  // Category breakdowns. First category → donut (most eye-catching); the rest
  // → horizontal bar. Both use the same fallback-safe value column.
  // Exclude _source_file — it's an internal merge marker, not a real business dimension.
  const usableCats = schema.categoryCandidates.filter((c) => c.column !== '_source_file')
  usableCats.forEach((cat, i) => {
    if (!timeseriesValueCol) return
    picked.push({
      id: `${i === 0 ? 'donut' : 'top'}_${cat.column}_by_${timeseriesValueCol}`,
      kind: i === 0 ? 'donut' : 'top_n',
      valueColumn: timeseriesValueCol,
      groupColumn: cat.column,
      n: 5,
      layout: 'half',
      label: `${timeseriesValueCol} by ${cat.column}`,
      reasoning: `Category column (${Math.round(cat.confidence * 100)}% confidence).`,
    })
  })

  // Grouped bar (2-dim breakdown) — Category × Split like Power BI's
  // "Category × Gender". Only emit when there are ≥2 category candidates.
  if (usableCats.length >= 2 && timeseriesValueCol) {
    const [cat1, cat2] = usableCats
    picked.push({
      id: `grouped_${cat1.column}_by_${cat2.column}`,
      kind: 'grouped_bar',
      valueColumn: timeseriesValueCol,
      groupColumn: cat1.column,
      splitColumn: cat2.column,
      layout: 'full',
      label: `${timeseriesValueCol} by ${cat1.column} × ${cat2.column}`,
      reasoning: `Two-dimension breakdown across the top two category candidates.`,
    })
  }

  // Period comparison KPI — "This month vs last month" style. Only when
  // there's a time axis + safe value column, and we don't already have a
  // growth_rate for the same column (avoid duplicate KPIs).
  if (time && timeseriesValueCol) {
    picked.push({
      id: `period_${timeseriesValueCol}`,
      kind: 'period_comparison',
      valueColumn: timeseriesValueCol,
      timeColumn: time.column,
      layout: 'hero',
      label: `Current period ${timeseriesValueCol}`,
      reasoning: `Most recent time bucket value with previous-bucket comparison.`,
    })
  }

  // Ratio metric — auto-emit when a `has_*` flag column exists (produced by
  // the star-schema secondary-fact join). e.g. has_returns → return rate.
  const flagCols = schema.columns.filter((c) => /^has_/i.test(c.name) && (c.detectedType === 'number' || c.detectedType === 'boolean'))
  for (const flag of flagCols) {
    const factName = flag.name.replace(/^has_/i, '')
    picked.push({
      id: `ratio_${flag.name}`,
      kind: 'ratio',
      valueColumn: null,
      numeratorColumn: flag.name,
      denominatorColumn: undefined,
      ratioAsPercent: true,
      layout: 'hero',
      label: `${factName} rate`,
      reasoning: `Percentage of rows where "${flag.name}" is true — cross-fact ratio from the secondary source.`,
    })
  }

  // Pre-computed scalar columns emitted by the star-schema aggregate-broadcast
  // path (`<secondary>_<measure>_rate_scalar` and `<secondary>_<measure>_scalar`).
  // MUST use kind='average' — every row has the same constant, so AVG returns
  // the scalar cleanly. SUM/TOTAL would multiply the constant by row count
  // and produce garbage (e.g. Orders Returned = 2.24B on 269K rows).
  //
  // Human name cleanup: strip year fragments (1997/1998) that leak in from
  // filenames like Returns_1997-1998.csv → "returns 1997 1998 quantity" →
  // "returned quantity".
  const humanize = (col: string): string => col
    .replace(/_+/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, '') // strip year tokens
    .replace(/\s+/g, ' ')
    .trim()
  const rateScalars = schema.columns.filter((c) => /_rate_scalar$/i.test(c.name) && (c.detectedType === 'number' || c.detectedType === 'currency'))
  for (const s of rateScalars) {
    const humanName = humanize(s.name.replace(/_rate_scalar$/i, '')) + ' rate'
    picked.push({
      id: `scalar_${s.name}`,
      kind: 'average',
      valueColumn: s.name,
      layout: 'hero',
      label: humanName.trim(),
      reasoning: `Pre-computed cross-fact ratio broadcast by the star-schema join. AVERAGE returns the scalar because every row has the same value.`,
    })
  }
  const totalScalars = schema.columns.filter((c) => /_scalar$/i.test(c.name) && !/_rate_scalar$/i.test(c.name) && (c.detectedType === 'number' || c.detectedType === 'currency'))
  for (const s of totalScalars) {
    const humanName = humanize(s.name.replace(/_scalar$/i, ''))
    picked.push({
      id: `scalar_${s.name}`,
      kind: 'average',
      valueColumn: s.name,
      layout: 'hero',
      label: humanName || 'total',
      reasoning: `Pre-computed secondary-fact aggregate broadcast by the star-schema join. AVERAGE returns the scalar (every row has the same value).`,
    })
  }

  // A data table showing per-category totals + row-counts — the "product
  // details" pattern from Power BI. Uses the first usable category (never _source_file).
  const primaryCat = usableCats[0]
  if (primaryCat && timeseriesValueCol) {
    picked.push({
      id: `table_${primaryCat.column}`,
      kind: 'table',
      valueColumn: timeseriesValueCol,
      groupColumn: primaryCat.column,
      layout: 'full',
      label: `Detail by ${primaryCat.column}`,
      reasoning: `Full breakdown table showing every ${primaryCat.column} value.`,
    })
  }

  return { picked, skipped }
}
