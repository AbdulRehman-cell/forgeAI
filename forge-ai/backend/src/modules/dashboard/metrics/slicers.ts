import type { CleanedRow } from '../clean'
import type { SchemaReport } from '../profile/schemaReport'
import type { ColumnProfile } from '../profile/columnTypes'
import type { ComputedMetric } from './aggregate'

/**
 * Per-metric filter slices. The client can toggle any filter and re-sum on
 * the fly without a round-trip to the server. We pre-compute slices for a
 * limited set of "filter dimensions":
 *   - Every category column with ≤20 distinct values (keeps payload small)
 *   - The primary date column, bucketed to month (allows date-range filtering
 *     down to month granularity)
 *
 * Slice shape for a `total` metric:
 *   slice: { Region: { us-east: 500000, eu-west: 300000, ... }, month: {...} }
 * On filter change (client): sum only the selected keys.
 *
 * For timeseries: slice becomes per-bucket-per-value, so the client can rebuild
 * the whole series when a filter changes.
 *   sliced_series: { Region: { us-east: [{bucket, value}, ...], eu-west: [...] } }
 *
 * We only slice on filter dimensions the client cares about — the picked
 * `filterableColumns` are broadcast to the client alongside the metrics.
 */

export interface FilterDimension {
  column: string
  kind: 'category' | 'date'
  /** Distinct values for a category filter (sorted for stable UI) */
  values?: string[]
  /** Date column min/max in ISO for a date filter */
  dateRange?: { min: string; max: string }
}

/** Pick the columns worth exposing as slicers. */
export function pickFilterDimensions(schema: SchemaReport, cleanedRows: CleanedRow[]): FilterDimension[] {
  const dims: FilterDimension[] = []

  // Categorical: any category or low-cardinality string column with ≤20 values.
  const catCandidates = schema.columns.filter((c) =>
    (c.detectedType === 'category' || (c.detectedType === 'string' && c.uniqueValues <= 20)) &&
    c.uniqueValues >= 2 && c.uniqueValues <= 20,
  )
  // Sort by "usefulness": prefer name matches for category (Region/Category/Country) then by low cardinality
  catCandidates.sort((a, b) => {
    const rank = (n: string) => /region|category|country|segment|channel|status|tier|type|brand|department/i.test(n) ? 0 : 1
    return rank(a.name) - rank(b.name) || a.uniqueValues - b.uniqueValues
  })
  // Was capped at 3 — bumped to 6 so BI users with Country/Region/Store Type/
  // Category/Segment/Product all get slicer chips. Payload grows linearly with
  // this cap; 6 dims × 20 values × N metrics is still small (few MB max).
  for (const c of catCandidates.slice(0, 6)) {
    const values = new Set<string>()
    for (const r of cleanedRows) {
      const v = r[c.name]
      if (v !== null && v !== undefined && v !== '') values.add(String(v))
    }
    dims.push({ column: c.name, kind: 'category', values: [...values].sort() })
  }

  // Date: the primary time axis (if any).
  const timeCol = schema.primaryTimeAxisCandidate?.column
  if (timeCol) {
    let min: string | null = null, max: string | null = null
    for (const r of cleanedRows) {
      const v = r[timeCol]
      if (typeof v !== 'string' || !v) continue
      if (!min || v < min) min = v
      if (!max || v > max) max = v
    }
    if (min && max) dims.push({ column: timeCol, kind: 'date', dateRange: { min, max } })
  }

  return dims
}

/**
 * For each computed metric, add sliced versions along each filter dimension.
 * Mutates ComputedMetric.value in place — the client reads value.slices.
 */
export function attachSlices(
  metrics: ComputedMetric[],
  cleanedRows: CleanedRow[],
  filterDims: FilterDimension[],
): void {
  for (const m of metrics) {
    if (!m.value) continue
    const slices: Record<string, Record<string, unknown>> = {}

    for (const dim of filterDims) {
      if (m.value.kind === 'total' || m.value.kind === 'average' || m.value.kind === 'distinct_count') {
        slices[dim.column] = sliceScalar(m, cleanedRows, dim)
      } else if (m.value.kind === 'timeseries' || m.value.kind === 'multi_series') {
        slices[dim.column] = sliceTimeseries(m, cleanedRows, dim)
      } else if (m.value.kind === 'top_n' || m.value.kind === 'donut') {
        slices[dim.column] = sliceTopN(m, cleanedRows, dim)
      }
      // grouped_bar, table, gauge, growth, period_comparison, ratio — not sliced in v1
      // (client falls back to the global value + shows filter is "not affecting" this metric)
    }

    if (Object.keys(slices).length) (m.value as any).slices = slices
  }
}

// ── Slice implementations ────────────────────────────────────────

function sliceScalar(m: ComputedMetric, rows: CleanedRow[], dim: FilterDimension): Record<string, unknown> {
  const col = m.spec.valueColumn
  if (!col) return {}

  if (dim.kind === 'category') {
    const out: Record<string, number> = {}
    for (const v of dim.values ?? []) out[v] = 0
    const seenPerVal: Record<string, Set<string>> = {}
    if (m.value?.kind === 'distinct_count') {
      for (const v of dim.values ?? []) seenPerVal[v] = new Set()
    }
    for (const r of rows) {
      const key = String(r[dim.column] ?? '')
      if (!(key in out)) continue
      if (m.value?.kind === 'distinct_count') {
        const s = String(r[col] ?? '')
        if (s) seenPerVal[key].add(s)
      } else {
        const n = r[col]
        if (typeof n === 'number' && Number.isFinite(n)) out[key] += n
      }
    }
    if (m.value?.kind === 'distinct_count') {
      const distinctOut: Record<string, number> = {}
      for (const [k, s] of Object.entries(seenPerVal)) distinctOut[k] = s.size
      return distinctOut
    }
    // For average: also send the count per bucket so client can compute avg
    if (m.value?.kind === 'average') {
      const counts: Record<string, number> = {}
      for (const v of dim.values ?? []) counts[v] = 0
      for (const r of rows) {
        const key = String(r[dim.column] ?? '')
        if (!(key in counts)) continue
        const n = r[col]
        if (typeof n === 'number' && Number.isFinite(n)) counts[key]++
      }
      return { sums: out, counts }
    }
    return out
  }

  // Date slicer — for scalar metrics, month-bucketed sums (client sums the
  // buckets in the selected range).
  if (dim.kind === 'date') {
    const out: Record<string, number> = {}
    for (const r of rows) {
      const d = String(r[dim.column] ?? '').slice(0, 7) // YYYY-MM
      if (!d || d.length < 7) continue
      const n = r[col]
      if (typeof n === 'number' && Number.isFinite(n)) out[d] = (out[d] ?? 0) + n
    }
    return out
  }
  return {}
}

function sliceTimeseries(m: ComputedMetric, rows: CleanedRow[], dim: FilterDimension): Record<string, unknown> {
  if (m.value?.kind !== 'timeseries') return {}
  const val = m.spec.valueColumn, time = m.spec.timeColumn
  if (!val || !time) return {}
  if (dim.kind !== 'category') return {} // date filtering is done client-side on existing series buckets

  // Recompute the series per category value
  const bucket = m.value.bucket
  const groups: Record<string, Map<string, number>> = {}
  for (const v of dim.values ?? []) groups[v] = new Map()

  for (const r of rows) {
    const key = String(r[dim.column] ?? '')
    if (!(key in groups)) continue
    const d = r[time]
    if (typeof d !== 'string' || !d) continue
    const n = r[val]
    if (typeof n !== 'number' || !Number.isFinite(n)) continue
    const b = bucketOf(d, bucket)
    if (!b) continue
    groups[key].set(b, (groups[key].get(b) ?? 0) + n)
  }

  const out: Record<string, { bucket: string; value: number }[]> = {}
  for (const [k, map] of Object.entries(groups)) {
    out[k] = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([bucketKey, value]) => ({ bucket: bucketKey, value }))
  }
  return out
}

function sliceTopN(m: ComputedMetric, rows: CleanedRow[], dim: FilterDimension): Record<string, unknown> {
  if (m.value?.kind !== 'top_n' && m.value?.kind !== 'donut') return {}
  const val = m.spec.valueColumn, group = m.spec.groupColumn
  if (!val || !group) return {}
  if (dim.kind !== 'category') return {}

  // For each dim value: a { groupLabel → sum } map. Client filters and re-picks top N.
  const out: Record<string, Record<string, number>> = {}
  for (const v of dim.values ?? []) out[v] = {}
  for (const r of rows) {
    const key = String(r[dim.column] ?? '')
    if (!(key in out)) continue
    const g = String(r[group] ?? '(none)')
    const n = r[val]
    if (typeof n !== 'number' || !Number.isFinite(n)) continue
    out[key][g] = (out[key][g] ?? 0) + n
  }
  return out
}

function bucketOf(iso: string, bucket: 'day' | 'week' | 'month'): string {
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return ''
  if (bucket === 'day') return iso.slice(0, 10)
  if (bucket === 'week') {
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() - (day - 1))
    return d.toISOString().slice(0, 10)
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
