import type { AIProvider } from '../../ai/providers/base'
import type { SchemaReport } from '../profile/schemaReport'
import type { CleaningResult } from '../clean'
import type { MetricSpec, MetricKind, MetricLayout } from './defaultSelection'
import { columnIsSafeToSum } from './defaultSelection'

/**
 * Ask the LLM: given these columns, this cleaning state, and what the client
 * asked for in plain English, propose the metrics we should compute. The
 * model returns JSON we validate against the current MetricSpec shape — any
 * unknown kind, missing column, or aggregation over a cleaning-error column
 * is discarded and reported.
 *
 * Prompt is intentionally strict: model can ONLY choose columns we send it,
 * and MUST justify each pick in one sentence. That gives us a visible audit
 * trail alongside the "reasoning" field the UI already shows.
 */

const VALID_KINDS: MetricKind[] = [
  'total', 'average', 'distinct_count', 'timeseries', 'multi_series',
  'growth_rate', 'period_comparison', 'top_n', 'donut', 'grouped_bar',
  'table', 'gauge', 'ratio',
]
const VALID_LAYOUTS: MetricLayout[] = ['hero', 'full', 'half', 'third']

interface PlannerResult {
  specs: MetricSpec[]
  /** LLM's high-level narration of the intent behind the plan — surfaced at
   *  the top of the dashboard. */
  intent: string | null
  /** Any metric the LLM proposed that we had to drop, with reason. */
  rejected: { id: string; reason: string }[]
  /** Raw model output for debugging. */
  raw?: string
}

const SYSTEM_PROMPT = `You are a senior data-analyst assistant designing dashboards. You will be given:
- A dataset schema (columns, detected types, confidence, sample values)
- A cleaning summary (any columns with errors — DO NOT aggregate over those)
- A plain-English description from the client of what they want to see

Return ONLY JSON with this shape:
{
  "intent": "1-sentence summary of what the dashboard is really about",
  "metrics": [
    {
      "id": "unique-kebab-id",
      "kind": "total | average | distinct_count | timeseries | multi_series | growth_rate | period_comparison | top_n | donut | grouped_bar | table | gauge | ratio",
      "valueColumn": "column name" | null,          // required for most numeric-aggregating kinds; null for multi_series/ratio
      "valueColumns": ["col1","col2"],              // ONLY for multi_series (2-3 numeric columns)
      "timeColumn": "column name",                  // for timeseries / multi_series / growth_rate / period_comparison
      "groupColumn": "column name",                 // for top_n / donut / table / grouped_bar
      "splitColumn": "column name",                 // ONLY for grouped_bar (secondary breakdown dimension, e.g. Category × Gender)
      "numeratorColumn": "column name",             // ONLY for ratio (e.g. has_returns / row count → return rate)
      "denominatorColumn": "column name",           // OPTIONAL for ratio — omit for "sum(num) / count(rows)"
      "ratioAsPercent": true,                       // OPTIONAL for ratio — default true
      "n": 5,                                       // for top_n / donut
      "gauge": { "min": 0, "target": 10000 },       // for gauge
      "extraColumns": [],                           // for table — ADDITIONAL numeric columns to include (product + profit + cost table = valueColumn: "profit", extraColumns: ["cost"])
      "layout": "hero | full | half | third",
      "label": "short human title (used above the chart)",
      "reasoning": "one sentence explaining why this metric matters for the client's stated need"
    }
  ]
}

METRIC KIND HINTS:
- **total** = the LIFETIME/GRAND TOTAL of a numeric column across all rows. Use for "Total Revenue", "Total Sales", "Total Profit", "Total Orders" — these must sum EVERYTHING, not just the last period. Label starts with "Total".
- **period_comparison** = CURRENT PERIOD vs PREVIOUS PERIOD (e.g. "This month vs last month", "This quarter's revenue"). Use ONLY when the client asks for a period-over-period comparison. Label should NOT start with "Total".
- **growth_rate** = the % change between the last two periods, as a single number. Use when the client wants just the % (no absolute values).
- CRITICAL DISTINCTION: If the client asks for "Total Revenue" as a KPI, use kind:total on the revenue column. Do NOT use period_comparison — that would only show the last bucket's value, not the true total.
- grouped_bar: use when the client wants a 2-dimension breakdown ("revenue by category and gender", "sales by region and channel"). Full layout.
- ratio: use for rates (return rate, conversion rate, margin). numeratorColumn is usually a has_* flag column or a numeric like profit; denominatorColumn is usually revenue or omitted (for row-count denominator).

RULES:
- Column names must EXACTLY match one from the schema. Never invent.
- Never aggregate a column marked as having a cleaning ERROR in the summary.
- If the client's ask is vague, still infer 4–8 useful metrics — prefer few good metrics over many mediocre ones.
- Put the 2–3 most important numbers as hero KPI totals at layout: "hero".
- Use donut for the primary category breakdown, top_n for secondary categories.
- Use multi_series when 2+ related numeric columns share a time axis (revenue/cost/profit type data).
- Use table for a detailed per-item view when a category has many distinct values.
- Return VALID JSON only. No markdown code fences, no prose outside the JSON.`

export async function planMetrics(
  provider: AIProvider,
  schema: SchemaReport,
  cleaning: CleaningResult,
  userPrompt: string,
  /** Optional vertical-specific instructions appended to the system prompt so
   *  the planner designs the dashboard the way that industry expects it. */
  verticalHint?: string,
): Promise<PlannerResult> {
  const compactSchema = {
    columns: schema.columns
      // *_scalar columns are pre-computed broadcast constants from the
      // star-schema secondary-fact join. They must be aggregated with AVERAGE
      // only — SUM would multiply the constant by the row count and produce
      // nonsense (e.g. Orders Returned = 2.24B on a 269K-row denorm). The
      // default picker already emits the correct `average` metrics for them,
      // so hide them from the LLM planner entirely to prevent misuse.
      .filter((c) => !/_scalar$/i.test(c.name))
      .map((c) => ({
      name: c.name,
      type: c.detectedType,
      confidence: Math.round(c.confidence * 100) / 100,
      unique: c.uniqueValues,
      blank: c.blankRows,
      sampleValues: c.sampleValues.slice(0, 3),
      hasCleaningError: cleaning.changelog.some((cl) => cl.column === c.name && cl.severity === 'error'),
    })),
    primaryTimeAxis: schema.primaryTimeAxisCandidate?.column,
    metricHints: schema.primaryMetricCandidates.slice(0, 5).map((m) => ({ column: m.column, kind: m.kind, confidence: Math.round(m.confidence * 100) / 100 })),
    categoryHints: schema.categoryCandidates.slice(0, 5).map((m) => ({ column: m.column, confidence: Math.round(m.confidence * 100) / 100 })),
    idHints: schema.idCandidates.slice(0, 3).map((m) => m.column),
  }

  const cleaningSummary = {
    rowsIn: cleaning.stats.rowsIn,
    rowsOut: cleaning.stats.rowsOut,
    duplicatesRemoved: cleaning.stats.duplicatesRemoved,
    warnings: cleaning.stats.warnings,
    errors: cleaning.stats.errors,
    errorColumns: cleaning.changelog.filter((c) => c.severity === 'error').map((c) => c.column),
  }

  let raw: string
  try {
    const systemWithVertical = verticalHint
      ? `${SYSTEM_PROMPT}\n\n─── DASHBOARD TYPE INSTRUCTIONS ───\n${verticalHint}`
      : SYSTEM_PROMPT
    const { content } = await provider.chat(
      [{
        role: 'user',
        content:
          `CLIENT WANT: ${userPrompt || '(no specific instructions — infer sensible defaults from the data)'}\n\n` +
          `SCHEMA:\n\`\`\`json\n${JSON.stringify(compactSchema, null, 2)}\n\`\`\`\n\n` +
          `CLEANING SUMMARY:\n\`\`\`json\n${JSON.stringify(cleaningSummary, null, 2)}\n\`\`\`\n\n` +
          `Now return the dashboard plan JSON.`,
      }],
      systemWithVertical,
    )
    raw = content
  } catch (err: any) {
    console.warn('[dashboard/plan] LLM call failed:', err?.message ?? err)
    return { specs: [], intent: null, rejected: [], raw: undefined }
  }

  return parseAndValidate(raw, schema, cleaning)
}

/** Parse the model's JSON, drop anything invalid, return only usable specs. */
function parseAndValidate(raw: string, schema: SchemaReport, cleaning: CleaningResult): PlannerResult {
  const jsonText = extractJson(raw)
  let parsed: any
  try { parsed = JSON.parse(jsonText) }
  catch { return { specs: [], intent: null, rejected: [{ id: '*', reason: 'model returned invalid JSON' }], raw } }

  const validColumns = new Set(schema.columns.map((c) => c.name))
  const specs: MetricSpec[] = []
  const rejected: { id: string; reason: string }[] = []

  for (const m of (parsed?.metrics ?? []) as any[]) {
    const id = String(m.id ?? '').trim()
    const kind = String(m.kind ?? '').trim() as MetricKind
    const label = String(m.label ?? id ?? '').trim() || id

    if (!id) { rejected.push({ id: '(unnamed)', reason: 'missing id' }); continue }
    if (!VALID_KINDS.includes(kind)) { rejected.push({ id, reason: `unknown kind "${kind}"` }); continue }

    // Column-existence checks
    const checkCol = (col: any, field: string): string | null => {
      if (col == null) return null
      const s = String(col)
      if (!validColumns.has(s)) { rejected.push({ id, reason: `${field}="${s}" is not a real column` }); return null }
      return s
    }

    const valueColumn = kind === 'multi_series' ? null : checkCol(m.valueColumn, 'valueColumn')
    const valueColumns = kind === 'multi_series'
      ? (Array.isArray(m.valueColumns) ? m.valueColumns.map((c: any) => checkCol(c, 'valueColumns')).filter(Boolean) as string[] : [])
      : undefined
    const timeColumn = checkCol(m.timeColumn, 'timeColumn') ?? undefined
    const groupColumn = checkCol(m.groupColumn, 'groupColumn') ?? undefined
    const splitColumn = checkCol(m.splitColumn, 'splitColumn') ?? undefined
    const numeratorColumn = checkCol(m.numeratorColumn, 'numeratorColumn') ?? undefined
    const denominatorColumn = checkCol(m.denominatorColumn, 'denominatorColumn') ?? undefined

    // Cleaning-error gate for kinds that aggregate a numeric column
    const numericKinds: MetricKind[] = ['total', 'average', 'timeseries', 'growth_rate', 'period_comparison', 'top_n', 'donut', 'grouped_bar', 'table', 'gauge']
    if (numericKinds.includes(kind) && valueColumn && !columnIsSafeToSum(cleaning, valueColumn)) {
      rejected.push({ id, reason: `${valueColumn} has an unresolved cleaning error — refusing to aggregate.` })
      continue
    }
    if (kind === 'multi_series' && valueColumns) {
      const unsafe = valueColumns.filter((c) => !columnIsSafeToSum(cleaning, c))
      if (unsafe.length) { rejected.push({ id, reason: `columns with cleaning errors: ${unsafe.join(', ')}` }); continue }
      if (valueColumns.length < 2) { rejected.push({ id, reason: 'multi_series needs ≥2 valueColumns' }); continue }
    }

    // Kind-specific required-field checks
    if (['total', 'average', 'distinct_count', 'gauge'].includes(kind) && !valueColumn) {
      rejected.push({ id, reason: `${kind} requires valueColumn` }); continue
    }
    if (['timeseries', 'growth_rate'].includes(kind) && (!valueColumn || !timeColumn)) {
      rejected.push({ id, reason: `${kind} requires valueColumn + timeColumn` }); continue
    }
    if (kind === 'multi_series' && (!timeColumn || !valueColumns?.length)) {
      rejected.push({ id, reason: 'multi_series requires timeColumn + valueColumns' }); continue
    }
    if (['top_n', 'donut'].includes(kind) && (!valueColumn || !groupColumn)) {
      rejected.push({ id, reason: `${kind} requires valueColumn + groupColumn` }); continue
    }
    // Table can take a single valueColumn OR multiple via valueColumns/extraColumns.
    // As long as SOMETHING numeric is present + a group column, it's valid.
    if (kind === 'table') {
      const hasAnyValue = !!valueColumn || (Array.isArray(m.valueColumns) && m.valueColumns.length > 0) || (Array.isArray(m.extraColumns) && m.extraColumns.length > 0)
      if (!hasAnyValue || !groupColumn) {
        rejected.push({ id, reason: 'table requires groupColumn + at least one value column (valueColumn, valueColumns, or extraColumns)' })
        continue
      }
    }
    if (kind === 'grouped_bar' && (!valueColumn || !groupColumn || !splitColumn)) {
      rejected.push({ id, reason: 'grouped_bar requires valueColumn + groupColumn + splitColumn' }); continue
    }
    if (kind === 'period_comparison' && (!valueColumn || !timeColumn)) {
      rejected.push({ id, reason: 'period_comparison requires valueColumn + timeColumn' }); continue
    }
    if (kind === 'ratio' && !numeratorColumn) {
      rejected.push({ id, reason: 'ratio requires numeratorColumn' }); continue
    }

    // Safety: *_scalar columns must be aggregated with AVERAGE only. If the
    // planner hallucinated a total/sum against one, force-flip to average so
    // it can't produce SUM-of-constant nonsense (2.24B "Orders Returned"
    // type bugs). Rejection alone isn't enough — the planner sometimes
    // asks for the scalar via another metric kind entirely.
    let finalKind: MetricKind = kind
    if (valueColumn && /_scalar$/i.test(valueColumn) && kind !== 'average') {
      rejected.push({ id, reason: `${valueColumn} is a pre-computed broadcast column — only AVERAGE is valid on it. Rewriting to average.` })
      finalKind = 'average'
    }

    specs.push({
      id, kind: finalKind, valueColumn, valueColumns, timeColumn, groupColumn, splitColumn,
      numeratorColumn, denominatorColumn,
      ratioAsPercent: m.ratioAsPercent !== false,
      n: typeof m.n === 'number' ? m.n : undefined,
      gauge: m.gauge && typeof m.gauge === 'object' ? { min: m.gauge.min, target: m.gauge.target } : undefined,
      extraColumns: Array.isArray(m.extraColumns) ? m.extraColumns.filter((c: any) => validColumns.has(String(c))) : undefined,
      layout: VALID_LAYOUTS.includes(m.layout) ? m.layout : (kind === 'total' || kind === 'average' || kind === 'distinct_count' || kind === 'growth_rate' || kind === 'period_comparison' || kind === 'gauge' || kind === 'ratio') ? 'hero' : (kind === 'timeseries' || kind === 'multi_series' || kind === 'table' || kind === 'grouped_bar') ? 'full' : 'half',
      label,
      reasoning: String(m.reasoning ?? 'chosen by the AI planner').slice(0, 400),
    })
  }

  const intent = typeof parsed?.intent === 'string' && parsed.intent.trim() ? parsed.intent.trim() : null
  return { specs, intent, rejected, raw }
}

function extractJson(text: string): string {
  // Model sometimes returns ```json … ``` even when told not to. Strip fences.
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/)
  if (fenced) return fenced[1].trim()
  // Or a `{` … `}` blob with prose around it.
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) return text.slice(first, last + 1)
  return text.trim()
}
