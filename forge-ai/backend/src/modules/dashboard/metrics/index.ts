import type { AIProvider } from '../../ai/providers/base'
import type { SchemaReport } from '../profile/schemaReport'
import type { CleaningResult } from '../clean'
import {
  pickDefaultMetrics,
  type MetricSpec,
} from './defaultSelection'
import {
  computeTotal, computeAverage, computeDistinctCount,
  computeTimeseries, computeMultiSeries, computeGrowthRate, computePeriodComparison,
  computeTopN, computeDonut, computeGroupedBar, computeTable, computeGauge, computeRatio,
  type ComputedMetric, type TimeBucket,
} from './aggregate'
import { detectAnomalies, type Anomaly } from './anomalies'
import { generateSummary, currencyMapFromDecisions } from './summary'
import { planMetrics } from './plan'
import { pickFilterDimensions, attachSlices, type FilterDimension } from './slicers'

/**
 * The metric orchestrator. Everything downstream (rendering, scheduled
 * refresh) consumes THIS structure — no reaching back into raw rows. Same
 * design rule as the schema report: each stage speaks in a small, typed,
 * self-describing object.
 */
export interface MetricsConfig {
  /** Extra metrics to append to the default set. */
  include?: MetricSpec[]
  /** Metric IDs to remove from the default set (e.g. skip a top-N). */
  exclude?: string[]
  /** Time bucket override — default 'auto' picks day/week/month by span. */
  timeBucket?: TimeBucket
  /** Top-N size — default 5. Applied to every top_n metric that didn't set its own. */
  topN?: number
  /** Skip the LLM summary (useful for tests / offline mode). */
  skipSummary?: boolean
  /** Free-text description of what the client wants to see. When set AND a
   *  provider is available, the LLM planner replaces the default picker. */
  userPrompt?: string
  /** Force the default picker even if userPrompt is set — used by tests. */
  skipPlanner?: boolean
  /** Vertical hint appended to the LLM planner's system prompt — comes from
   *  the picked dashboard type (Sales / Support / etc.). */
  verticalHint?: string
}

export interface MetricsResult {
  /** Every metric we chose to compute (default set + include - exclude). */
  specs: MetricSpec[]
  /** Metrics that were dropped BEFORE computation with reasons. */
  skipped: { column: string; reason: string }[]
  /** LLM-planner rejections (invalid columns, unsafe aggregations). */
  plannerRejections?: { id: string; reason: string }[]
  /** Where the metric set came from: 'planner' (LLM used the prompt) or 'default'. */
  planner: 'planner' | 'default'
  /** LLM's one-sentence read of what the dashboard is about. null when planner didn't run. */
  intent: string | null
  /** Computed values, one entry per spec. */
  metrics: ComputedMetric[]
  anomalies: Anomaly[]
  summary: {
    text: string | null
    /** null when the LLM was skipped or the call failed. `error` explains. */
    error?: string
  }
  /** Filter dimensions exposed to the client for interactive slicing. */
  filterDimensions: FilterDimension[]
  /** Frozen config that actually ran, so the UI can show what settings it reflects. */
  effectiveConfig: {
    timeBucket: TimeBucket
    topN: number
    llmSkipped: boolean
  }
}

/** Run the metric pipeline over cleaned data. `provider` may be null when
 *  the caller wants numbers-only (Milestone 4 rendering can call in a
 *  no-LLM mode for the initial preview). */
export async function computeMetrics(
  schema: SchemaReport,
  cleaning: CleaningResult,
  provider: AIProvider | null,
  config: MetricsConfig = {},
): Promise<MetricsResult> {
  const timeBucket: TimeBucket = config.timeBucket ?? 'auto'
  const topN = config.topN ?? 5

  // Merge derived columns (revenue/cost/profit) into the schema before either
  // picker sees it. Downstream selection and aggregation then treat derived
  // columns exactly like source ones — no special-cases anywhere else.
  const enrichedSchema: SchemaReport = cleaning.derivedColumns.length
    ? {
        ...schema,
        columns: [
          ...schema.columns,
          ...cleaning.derivedColumns.map((d) => ({
            name: d.name,
            detectedType: d.kind as 'currency' | 'number',
            confidence: 1,
            totalRows: cleaning.stats.rowsOut,
            blankRows: cleaning.cleanedRows.filter((r) => r[d.name] == null).length,
            uniqueValues: new Set(cleaning.cleanedRows.map((r) => r[d.name])).size,
            sampleValues: cleaning.cleanedRows.slice(0, 5).map((r) => String(r[d.name] ?? '')),
            typeCounts: { blank: 0, number: 0, currency: 0, date: 0, boolean: 0, string: 0 },
            flags: [{ level: 'info' as const, message: `Derived column: ${d.formula}` }],
          })),
        ],
        // Derived revenue-shaped columns should be primary metric candidates.
        primaryMetricCandidates: [
          ...cleaning.derivedColumns
            .filter((d) => /revenue|profit/i.test(d.name))
            .map((d) => ({
              column: d.name,
              kind: 'revenue' as const,
              confidence: 1,
              reasoning: `Auto-derived from ${d.sources.join(' × ')}.`,
            })),
          ...schema.primaryMetricCandidates,
        ],
      }
    : schema

  // ── Metric selection ──
  // If the caller provided a user prompt AND a provider is available, ask the
  // LLM to plan the metrics targeted at what the client actually wants. Fall
  // through to the default picker whenever the planner is unavailable or
  // returns an empty plan — we never leave the dashboard blank.
  let plannerSource: 'planner' | 'default' = 'default'
  let plannerIntent: string | null = null
  let plannerRejections: { id: string; reason: string }[] | undefined
  let baseSpecs: MetricSpec[] = []
  let baseSkipped: { column: string; reason: string }[] = []
  if (provider && config.userPrompt && !config.skipPlanner) {
    const planned = await planMetrics(provider, enrichedSchema, cleaning, config.userPrompt, config.verticalHint)
    if (planned.specs.length) {
      plannerSource = 'planner'
      plannerIntent = planned.intent
      plannerRejections = planned.rejected
      baseSpecs = planned.specs
    } else {
      plannerRejections = planned.rejected.length ? planned.rejected : [{ id: '*', reason: 'planner returned no usable metrics — fell back to defaults' }]
      const dp = pickDefaultMetrics(enrichedSchema, cleaning)
      baseSpecs = dp.picked
      baseSkipped = dp.skipped
    }
  } else {
    const dp = pickDefaultMetrics(enrichedSchema, cleaning)
    baseSpecs = dp.picked
    baseSkipped = dp.skipped
  }

  const excludeSet = new Set(config.exclude ?? [])
  const specs: MetricSpec[] = [
    ...baseSpecs.filter((s) => !excludeSet.has(s.id)),
    ...(config.include ?? []),
  ].map((s) => (s.kind === 'top_n' && !s.n ? { ...s, n: topN } : s))
  const skipped = baseSkipped

  const metrics: ComputedMetric[] = specs.map((spec) => {
    switch (spec.kind) {
      case 'total':             return computeTotal(cleaning.cleanedRows, spec)
      case 'average':           return computeAverage(cleaning.cleanedRows, spec)
      case 'distinct_count':    return computeDistinctCount(cleaning.cleanedRows, spec)
      case 'timeseries':        return computeTimeseries(cleaning.cleanedRows, spec, timeBucket)
      case 'multi_series':      return computeMultiSeries(cleaning.cleanedRows, spec, timeBucket)
      case 'growth_rate':       return computeGrowthRate(cleaning.cleanedRows, spec, timeBucket)
      case 'period_comparison': return computePeriodComparison(cleaning.cleanedRows, spec, timeBucket)
      case 'top_n':             return computeTopN(cleaning.cleanedRows, spec)
      case 'donut':             return computeDonut(cleaning.cleanedRows, spec)
      case 'grouped_bar':       return computeGroupedBar(cleaning.cleanedRows, spec)
      case 'table':             return computeTable(cleaning.cleanedRows, spec)
      case 'gauge':             return computeGauge(cleaning.cleanedRows, spec)
      case 'ratio':             return computeRatio(cleaning.cleanedRows, spec)
      default:                  return { spec, value: null, reason: `unknown metric kind: ${(spec as any).kind}` }
    }
  })

  const anomalies = detectAnomalies(metrics)

  // Build the interactive-slicer machinery. Pick a small set of category +
  // date filter dimensions, then pre-compute per-value slices on every metric
  // so the client can re-aggregate in-browser on filter change without a
  // round-trip. Kept out of the LLM planner's payload — only affects rendering.
  const filterDimensions = pickFilterDimensions(enrichedSchema, cleaning.cleanedRows)
  if (filterDimensions.length) attachSlices(metrics, cleaning.cleanedRows, filterDimensions)

  const currencyByCol = currencyMapFromDecisions(cleaning.currencyDecisions)
  let summary: { text: string | null; error?: string } = { text: null }
  if (config.skipSummary || !provider) {
    summary = { text: null, error: config.skipSummary ? 'skipped by config' : 'no provider configured' }
  } else {
    const gen = await generateSummary(provider, metrics, anomalies, currencyByCol)
    summary = { text: gen.summary, error: gen.error }
  }

  return {
    specs,
    skipped,
    plannerRejections,
    planner: plannerSource,
    intent: plannerIntent,
    metrics,
    anomalies,
    summary,
    filterDimensions,
    effectiveConfig: {
      timeBucket,
      topN,
      llmSkipped: !!config.skipSummary || !provider,
    },
  }
}

export { type ComputedMetric, type MetricSpec, type Anomaly }
