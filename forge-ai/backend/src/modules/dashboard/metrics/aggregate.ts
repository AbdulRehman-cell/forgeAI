import type { CleanedRow } from '../clean'
import type { MetricSpec } from './defaultSelection'

/**
 * All aggregation math. Consumes CLEANED rows (dates already ISO strings,
 * numbers already number). No coercion here — coercion is a cleaning-stage
 * concern, and mixing the two would let bad data quietly infect totals.
 */

export type TimeBucket = 'day' | 'week' | 'month' | 'auto'

export interface TimeseriesPoint {
  bucket: string      // ISO date at start of bucket (day: YYYY-MM-DD, week: YYYY-MM-DD Monday, month: YYYY-MM-01)
  value: number
  rowCount: number
}

export interface TopNEntry {
  label: string
  value: number
  rowCount: number
  pctOfTotal: number
}

export type MetricValue =
  | { kind: 'total'; value: number; rowCount: number }
  | { kind: 'average'; value: number; rowCount: number }
  | { kind: 'distinct_count'; value: number; rowCount: number }
  | { kind: 'timeseries'; series: TimeseriesPoint[]; bucket: Exclude<TimeBucket, 'auto'> }
  | { kind: 'multi_series'; series: { label: string; points: TimeseriesPoint[] }[]; bucket: Exclude<TimeBucket, 'auto'> }
  | { kind: 'growth_rate'; current: number; previous: number; rate: number | null; period: Exclude<TimeBucket, 'auto'>; currentBucket: string; previousBucket: string }
  | { kind: 'period_comparison'; current: number; previous: number; rate: number | null; period: Exclude<TimeBucket, 'auto'>; currentBucket: string; previousBucket: string }
  | { kind: 'top_n'; entries: TopNEntry[]; other: number | null }
  | { kind: 'donut'; entries: TopNEntry[]; other: number | null }
  | { kind: 'grouped_bar'; groups: { label: string; splits: { label: string; value: number }[] }[]; splitLabels: string[] }
  | { kind: 'table'; rows: { label: string; value: number; rowCount: number; pctOfTotal: number; extras?: Record<string, number | string> }[]; totalRow: { value: number; rowCount: number; extras?: Record<string, number | string> }; valueColumns?: string[] }
  | { kind: 'gauge'; value: number; target: number; min: number; pctOfTarget: number }
  | { kind: 'ratio'; numerator: number; denominator: number; ratio: number | null; asPercent: boolean }

export interface ComputedMetric {
  spec: MetricSpec
  value: MetricValue | null
  /** If we couldn't compute (missing data, all nulls), why. */
  reason?: string
}

/** Auto-pick bucket size from data span. Under 60 days = daily, under 2 years
 *  = weekly, else monthly. Matches how a human analyst would eyeball it. */
export function pickBucket(datesIso: string[], override: TimeBucket): Exclude<TimeBucket, 'auto'> {
  if (override !== 'auto') return override
  const valid = datesIso.filter(Boolean).map((s) => Date.parse(s)).filter((n) => !Number.isNaN(n)).sort()
  if (valid.length < 2) return 'day'
  const spanDays = (valid[valid.length - 1] - valid[0]) / 86400_000
  if (spanDays <= 60) return 'day'
  if (spanDays <= 730) return 'week'
  return 'month'
}

function bucketOf(iso: string, bucket: Exclude<TimeBucket, 'auto'>): string {
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return ''
  if (bucket === 'day') return iso.slice(0, 10)
  if (bucket === 'week') {
    // ISO week — snap to Monday. getUTCDay: Sun=0..Sat=6
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() - (day - 1))
    return d.toISOString().slice(0, 10)
  }
  // month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function sumColumn(rows: CleanedRow[], col: string): { sum: number; count: number } {
  let sum = 0, count = 0
  for (const r of rows) {
    const v = r[col]
    if (typeof v === 'number' && Number.isFinite(v)) { sum += v; count++ }
  }
  return { sum, count }
}

export function computeTotal(rows: CleanedRow[], spec: MetricSpec): ComputedMetric {
  if (!spec.valueColumn) return { spec, value: null, reason: 'total metric missing valueColumn' }
  const { sum, count } = sumColumn(rows, spec.valueColumn)
  if (count === 0) return { spec, value: null, reason: `no numeric values in ${spec.valueColumn}` }
  return { spec, value: { kind: 'total', value: sum, rowCount: count } }
}

export function computeAverage(rows: CleanedRow[], spec: MetricSpec): ComputedMetric {
  if (!spec.valueColumn) return { spec, value: null, reason: 'average metric missing valueColumn' }
  const { sum, count } = sumColumn(rows, spec.valueColumn)
  if (count === 0) return { spec, value: null, reason: `no numeric values in ${spec.valueColumn}` }
  return { spec, value: { kind: 'average', value: sum / count, rowCount: count } }
}

export function computeDistinctCount(rows: CleanedRow[], spec: MetricSpec): ComputedMetric {
  if (!spec.valueColumn) return { spec, value: null, reason: 'distinct_count missing valueColumn' }
  const seen = new Set<string>()
  let counted = 0
  for (const r of rows) {
    const v = r[spec.valueColumn]
    if (v === null || v === undefined || v === '') continue
    seen.add(String(v))
    counted++
  }
  if (!seen.size) return { spec, value: null, reason: `no values in ${spec.valueColumn}` }
  return { spec, value: { kind: 'distinct_count', value: seen.size, rowCount: counted } }
}

/** Multi-series line chart: N numeric columns aggregated over the same time
 *  buckets. Same bucket-picker as computeTimeseries so all series align. */
export function computeMultiSeries(
  rows: CleanedRow[], spec: MetricSpec, override: TimeBucket = 'auto',
): ComputedMetric {
  const cols = spec.valueColumns
  const time = spec.timeColumn
  if (!cols || !cols.length || !time) return { spec, value: null, reason: 'multi_series missing valueColumns or timeColumn' }
  const dates = rows.map((r) => (typeof r[time] === 'string' ? (r[time] as string) : '')).filter(Boolean)
  if (!dates.length) return { spec, value: null, reason: `no valid dates in ${time}` }
  const bucket = pickBucket(dates, override)

  const perCol: Record<string, Map<string, { sum: number; count: number }>> = {}
  for (const c of cols) perCol[c] = new Map()

  for (const r of rows) {
    const d = r[time]
    if (typeof d !== 'string' || !d) continue
    const b = bucketOf(d, bucket)
    if (!b) continue
    for (const c of cols) {
      const v = r[c]
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      const prev = perCol[c].get(b)
      if (prev) { prev.sum += v; prev.count++ }
      else perCol[c].set(b, { sum: v, count: 1 })
    }
  }

  const allBuckets = [...new Set(Object.values(perCol).flatMap((m) => [...m.keys()]))].sort()
  const series = cols.map((c) => ({
    label: c,
    points: allBuckets.map((b) => ({
      bucket: b,
      value: perCol[c].get(b)?.sum ?? 0,
      rowCount: perCol[c].get(b)?.count ?? 0,
    })),
  }))
  if (!series.length || !allBuckets.length) return { spec, value: null, reason: 'no rows had a date + any of the numeric columns' }
  return { spec, value: { kind: 'multi_series', series, bucket } }
}

/** Donut: same math as top_n but renderer draws a donut. */
export function computeDonut(rows: CleanedRow[], spec: MetricSpec): ComputedMetric {
  const t = computeTopN(rows, spec)
  if (!t.value || t.value.kind !== 'top_n') return t
  return { spec, value: { kind: 'donut', entries: t.value.entries, other: t.value.other } }
}

/** Data table: every group's total, no top-N truncation (up to a safety cap).
 *  Supports MULTIPLE value columns — pass valueColumns=[a,b,c] and the table
 *  sums each per group. The primary valueColumn (or the first of valueColumns)
 *  is used for sorting + pctOfTotal. Extra columns end up in row.extras. */
export function computeTable(rows: CleanedRow[], spec: MetricSpec, hardCap = 100): ComputedMetric {
  const group = spec.groupColumn
  if (!group) return { spec, value: null, reason: 'table missing groupColumn' }

  // Collect all value columns: primary + extras + valueColumns (LLM planner
  // may send any of the three shapes).
  const cols: string[] = []
  if (spec.valueColumn) cols.push(spec.valueColumn)
  for (const c of spec.valueColumns ?? []) if (!cols.includes(c)) cols.push(c)
  for (const c of spec.extraColumns ?? []) if (!cols.includes(c)) cols.push(c)
  if (!cols.length) return { spec, value: null, reason: 'table needs at least one value column (valueColumn, valueColumns, or extraColumns)' }
  const primary = cols[0]

  interface Agg { sum: number; count: number; extras: Record<string, number | string> }
  const groups = new Map<string, Agg>()
  let total = 0, totalCount = 0
  // For string extras: collect distinct values per group so we can show a
  // representative (e.g. product_brand for a given product should be constant).
  const stringExtras: Record<string, Map<string, Set<string>>> = {}
  for (const c of cols.slice(1)) stringExtras[c] = new Map()
  const totalExtras: Record<string, number | string> = {}
  for (const c of cols.slice(1)) totalExtras[c] = 0

  for (const r of rows) {
    const g = r[group]
    const label = g === null || g === undefined ? '(none)' : String(g)
    const pv = r[primary]
    if (typeof pv !== 'number' || !Number.isFinite(pv)) continue
    let agg = groups.get(label)
    if (!agg) { agg = { sum: 0, count: 0, extras: {} }; for (const c of cols.slice(1)) agg.extras[c] = 0; groups.set(label, agg) }
    agg.sum += pv; agg.count++
    total += pv; totalCount++
    for (const c of cols.slice(1)) {
      const v = r[c]
      if (typeof v === 'number' && Number.isFinite(v)) {
        (agg.extras[c] as number) += v
        ;(totalExtras[c] as number) += v
      } else if (typeof v === 'string' && v !== '') {
        // Track distinct string values per group. Aggregated representative is
        // decided AFTER the loop so we only walk the data once.
        let byGroup = stringExtras[c].get(label)
        if (!byGroup) { byGroup = new Set(); stringExtras[c].set(label, byGroup) }
        byGroup.add(v)
      }
    }
  }

  if (!groups.size) return { spec, value: null, reason: `no rows had a value in ${primary} + a group label` }

  // Resolve string extras — one value per group. Common cases:
  //  - product_brand for a given product: always the same → use it verbatim.
  //  - customer_country for orders grouped by product: may differ → "3 values"
  for (const c of cols.slice(1)) {
    for (const [groupLabel, distinct] of stringExtras[c].entries()) {
      if (!distinct.size) continue
      const agg = groups.get(groupLabel)
      if (!agg) continue
      if (distinct.size === 1) agg.extras[c] = [...distinct][0]
      else agg.extras[c] = `${distinct.size} values`
    }
  }

  const sorted = [...groups.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, hardCap)
  const rowsOut = sorted.map(([label, agg]) => ({
    label, value: agg.sum, rowCount: agg.count,
    pctOfTotal: total === 0 ? 0 : agg.sum / total,
    extras: cols.length > 1 ? agg.extras : undefined,
  }))
  return {
    spec,
    value: {
      kind: 'table',
      rows: rowsOut,
      totalRow: { value: total, rowCount: totalCount, extras: cols.length > 1 ? totalExtras : undefined },
      valueColumns: cols.length > 1 ? cols : undefined,
    },
  }
}

/** Grouped bar: sum a numeric column, grouped by column A, split by column B.
 *  Renders as a stacked or clustered bar chart. The classic "Category × Gender"
 *  or "Region × Product" pattern from Power BI. */
export function computeGroupedBar(rows: CleanedRow[], spec: MetricSpec): ComputedMetric {
  const value = spec.valueColumn, group = spec.groupColumn, split = spec.splitColumn
  if (!value || !group || !split) return { spec, value: null, reason: 'grouped_bar missing valueColumn / groupColumn / splitColumn' }

  const groupSet = new Map<string, Map<string, number>>() // group → (split → sum)
  const splitSet = new Set<string>()
  for (const r of rows) {
    const v = r[value]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const g = r[group] == null ? '(none)' : String(r[group])
    const s = r[split] == null ? '(none)' : String(r[split])
    splitSet.add(s)
    let inner = groupSet.get(g)
    if (!inner) { inner = new Map(); groupSet.set(g, inner) }
    inner.set(s, (inner.get(s) ?? 0) + v)
  }

  if (!groupSet.size) return { spec, value: null, reason: 'no rows had all three values (value/group/split)' }

  const splitLabels = [...splitSet].sort()
  // Order groups by their total value descending (biggest bar first)
  const groupTotals = [...groupSet.entries()].map(([g, m]) => ({ g, total: [...m.values()].reduce((a, b) => a + b, 0), m }))
  groupTotals.sort((a, b) => b.total - a.total)

  const groups = groupTotals.map(({ g, m }) => ({
    label: g,
    splits: splitLabels.map((s) => ({ label: s, value: m.get(s) ?? 0 })),
  }))
  return { spec, value: { kind: 'grouped_bar', groups, splitLabels } }
}

/** Period comparison: current bucket vs previous bucket, formatted as a KPI.
 *  Same math as growth_rate but rendered differently — the Power BI pattern
 *  of "$748K · Prev. Mon: $809K (-7.55%)". */
export function computePeriodComparison(rows: CleanedRow[], spec: MetricSpec, override: TimeBucket = 'auto'): ComputedMetric {
  const ts = computeTimeseries(rows, spec, override)
  if (!ts.value || ts.value.kind !== 'timeseries') return { spec, value: null, reason: ts.reason ?? 'no timeseries' }
  const series = ts.value.series
  if (!series.length) return { spec, value: null, reason: 'no data points' }
  const current = series[series.length - 1]
  const previous = series.length >= 2 ? series[series.length - 2] : null
  const rate = previous && previous.value !== 0 ? (current.value - previous.value) / previous.value : null
  return {
    spec,
    value: {
      kind: 'period_comparison',
      current: current.value,
      previous: previous?.value ?? 0,
      rate,
      period: ts.value.bucket,
      currentBucket: current.bucket,
      previousBucket: previous?.bucket ?? '',
    },
  }
}

/** Ratio: sum(numeratorColumn) / sum(denominatorColumn). If no denominator is
 *  given, count of non-blank rows in the numerator is used — the pattern for
 *  "return rate" = SUM(has_returns) / COUNT(rows with any data). Optional as
 *  percent. Used for return rate, conversion rate, margin (profit/revenue). */
export function computeRatio(rows: CleanedRow[], spec: MetricSpec): ComputedMetric {
  const num = spec.numeratorColumn, den = spec.denominatorColumn
  if (!num) return { spec, value: null, reason: 'ratio missing numeratorColumn' }

  let numSum = 0
  for (const r of rows) {
    const n = r[num]
    // Support "1"/"0" strings from the has_* flag columns AND numeric values.
    const numeric = typeof n === 'number' ? n : (n === '1' || n === 'true' ? 1 : n === '0' || n === 'false' ? 0 : null)
    if (numeric !== null && Number.isFinite(numeric)) numSum += numeric
  }

  let denSum = 0
  if (den) {
    for (const r of rows) {
      const d = r[den]
      const numeric = typeof d === 'number' ? d : (d === '1' || d === 'true' ? 1 : d === '0' || d === 'false' ? 0 : null)
      if (numeric !== null && Number.isFinite(numeric)) denSum += numeric
    }
  } else {
    // No explicit denominator — use row count (excluding rows where the
    // numerator column is entirely missing, so ratios stay meaningful).
    for (const r of rows) if (r[num] !== null && r[num] !== undefined && r[num] !== '') denSum++
  }
  if (denSum === 0) return { spec, value: null, reason: `denominator ${den ?? 'row count'} is zero` }
  return { spec, value: { kind: 'ratio', numerator: numSum, denominator: denSum, ratio: numSum / denSum, asPercent: spec.ratioAsPercent !== false } }
}

/** Gauge: current sum vs target. Target defaults to 1.25× the current value
 *  if the caller didn't provide one — always at 80% is a boring gauge. */
export function computeGauge(rows: CleanedRow[], spec: MetricSpec): ComputedMetric {
  if (!spec.valueColumn) return { spec, value: null, reason: 'gauge missing valueColumn' }
  const { sum, count } = sumColumn(rows, spec.valueColumn)
  if (count === 0) return { spec, value: null, reason: `no numeric values in ${spec.valueColumn}` }
  const min = spec.gauge?.min ?? 0
  const target = spec.gauge?.target ?? Math.max(sum * 1.25, min + 1)
  const pctOfTarget = target === min ? 0 : (sum - min) / (target - min)
  return { spec, value: { kind: 'gauge', value: sum, target, min, pctOfTarget } }
}

export function computeTimeseries(
  rows: CleanedRow[], spec: MetricSpec, override: TimeBucket = 'auto',
): ComputedMetric {
  const value = spec.valueColumn, time = spec.timeColumn
  if (!value || !time) return { spec, value: null, reason: 'timeseries missing valueColumn or timeColumn' }
  const dates = rows.map((r) => (typeof r[time] === 'string' ? (r[time] as string) : '')).filter(Boolean)
  if (dates.length === 0) return { spec, value: null, reason: `no valid dates in ${time}` }
  const bucket = pickBucket(dates, override)

  const buckets = new Map<string, { sum: number; count: number }>()
  for (const r of rows) {
    const d = r[time], v = r[value]
    if (typeof d !== 'string' || !d) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const b = bucketOf(d, bucket)
    if (!b) continue
    const prev = buckets.get(b)
    if (prev) { prev.sum += v; prev.count++ }
    else buckets.set(b, { sum: v, count: 1 })
  }

  const series: TimeseriesPoint[] = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucketKey, agg]) => ({ bucket: bucketKey, value: agg.sum, rowCount: agg.count }))

  if (!series.length) return { spec, value: null, reason: 'no rows had both a date and a numeric value' }
  return { spec, value: { kind: 'timeseries', series, bucket } }
}

export function computeGrowthRate(
  rows: CleanedRow[], spec: MetricSpec, override: TimeBucket = 'auto',
): ComputedMetric {
  const ts = computeTimeseries(rows, spec, override)
  if (!ts.value || ts.value.kind !== 'timeseries') return { spec, value: null, reason: ts.reason ?? 'no timeseries' }
  const series = ts.value.series
  if (series.length < 2) return { spec, value: null, reason: 'need ≥2 time buckets to compute a growth rate' }
  const current = series[series.length - 1]
  const previous = series[series.length - 2]
  const rate = previous.value === 0 ? null : (current.value - previous.value) / previous.value
  return {
    spec,
    value: {
      kind: 'growth_rate',
      current: current.value,
      previous: previous.value,
      rate,
      period: ts.value.bucket,
      currentBucket: current.bucket,
      previousBucket: previous.bucket,
    },
  }
}

export function computeTopN(rows: CleanedRow[], spec: MetricSpec): ComputedMetric {
  const value = spec.valueColumn, group = spec.groupColumn, n = spec.n ?? 5
  if (!value || !group) return { spec, value: null, reason: 'top_n missing valueColumn or groupColumn' }

  const groups = new Map<string, { sum: number; count: number }>()
  let total = 0
  for (const r of rows) {
    const g = r[group], v = r[value]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const label = g === null || g === undefined ? '(none)' : String(g)
    const prev = groups.get(label)
    if (prev) { prev.sum += v; prev.count++ }
    else groups.set(label, { sum: v, count: 1 })
    total += v
  }

  if (!groups.size) return { spec, value: null, reason: 'no rows had a value + group label' }

  const sorted = [...groups.entries()].sort((a, b) => b[1].sum - a[1].sum)
  const topSlice = sorted.slice(0, n)
  const otherSlice = sorted.slice(n)
  const other = otherSlice.length ? otherSlice.reduce((s, [, x]) => s + x.sum, 0) : null

  const entries: TopNEntry[] = topSlice.map(([label, agg]) => ({
    label,
    value: agg.sum,
    rowCount: agg.count,
    pctOfTotal: total === 0 ? 0 : agg.sum / total,
  }))

  return { spec, value: { kind: 'top_n', entries, other } }
}
