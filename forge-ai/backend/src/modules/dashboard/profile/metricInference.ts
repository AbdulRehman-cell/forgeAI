import type { ColumnProfile } from './columnTypes'

/**
 * Business-metric inference — the "what is this column FOR" layer, on top of
 * "what type IS this column." We combine column-NAME evidence with value-shape
 * evidence and produce a confidence + a plain-English reasoning string so the
 * client can see (and correct) why we made each call.
 *
 * Kept intentionally narrow. Milestone 3 (metric selection) picks defaults
 * from these hints; the more speculative categories (churn, MRR, conversion)
 * come later once the base pipeline is proven.
 */

export type MetricKind =
  | 'revenue'      // money coming in
  | 'cost'         // money going out
  | 'count'        // orders, signups, sessions
  | 'quantity'     // units per row (qty, seats)
  | 'rate'         // percent/ratio
  | 'id'           // identifier, not aggregatable
  | 'category'     // grouping dimension
  | 'time-axis'    // primary date/time axis

export interface MetricCandidate {
  column: string
  kind: MetricKind
  confidence: number
  reasoning: string
}

// Column-name patterns we recognize. Order matters — the FIRST match wins,
// so specific/structural patterns (id, sku) go BEFORE overlapping business
// vocabulary (orders → count would otherwise grab "Order ID").
const NAME_PATTERNS: { kind: MetricKind; re: RegExp; nameConf: number; label: string }[] = [
  { kind: 'id',       re: /(^|[_\s-])id$|[_\s-]id$|\bguid\b|\buuid\b|\bsku\b|\border[_\s-]?(id|no|number)\b/i, nameConf: 0.95, label: 'name matches ID pattern' },
  { kind: 'revenue',  re: /\b(mrr|arr|revenue|sales|income|gross|net_sales|earnings)\b/i, nameConf: 0.95, label: 'name matches revenue vocabulary' },
  { kind: 'cost',     re: /\b(cost|expense|refund|discount|fees?|cogs|spend)\b/i,         nameConf: 0.85, label: 'name matches cost/expense vocabulary' },
  { kind: 'quantity', re: /\b(qty|quantity|units?|seats?|licenses?|inventory|stock)\b/i, nameConf: 0.90, label: 'name matches quantity vocabulary' },
  { kind: 'rate',     re: /\b(rate|ratio|conversion|churn_rate|percent(age)?|pct)\b/i,   nameConf: 0.85, label: 'name matches rate/ratio vocabulary' },
  { kind: 'count',    re: /\b(orders?|signups?|users?|sessions?|visits?|clicks?|leads?|customers?|subscribers?|conversions?|churn(ed)?)\b/i, nameConf: 0.80, label: 'name matches business-count vocabulary' },
  { kind: 'revenue',  re: /\b(total|amount|price|value|subtotal|grand[_-]?total)\b/i,     nameConf: 0.70, label: 'name suggests a money field but is ambiguous' },
  { kind: 'category', re: /\b(region|country|state|city|category|segment|plan|tier|channel|source|status|type)\b/i, nameConf: 0.85, label: 'name matches category/dimension vocabulary' },
]

/**
 * Word-boundary matching on snake_case/kebab-case names is a JS regex trap:
 * `\bdiscount\b` does NOT match "discount_rate" because `_` is a `\w`
 * character — no word boundary between `t` and `_`. We normalize separators
 * to spaces so each token in a compound name can match independently.
 */
function nameTokens(name: string): string {
  return name.replace(/[_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function inferMetrics(columns: ColumnProfile[]): MetricCandidate[] {
  const candidates: MetricCandidate[] = []

  for (const col of columns) {
    const evidence: string[] = []
    let matchedKind: MetricKind | null = null
    let nameConfidence = 0
    const searchName = nameTokens(col.name)

    // Name-based pass
    for (const pat of NAME_PATTERNS) {
      if (pat.re.test(searchName)) {
        matchedKind = pat.kind
        nameConfidence = pat.nameConf
        evidence.push(pat.label)
        break
      }
    }

    // Shape-based pass — refine or override the name guess with what the
    // values actually look like
    const isNumericFamily = col.detectedType === 'currency' || col.detectedType === 'number'
    const isDate = col.detectedType === 'date'
    const isString = col.detectedType === 'string' || col.detectedType === 'category'

    if (isDate) {
      candidates.push({
        column: col.name,
        kind: 'time-axis',
        confidence: 0.95,
        reasoning: `date column at ${Math.round(col.confidence * 100)}% type confidence — plausible primary time axis`,
      })
      continue
    }

    if (matchedKind === 'id' && (isNumericFamily || isString)) {
      candidates.push({
        column: col.name,
        kind: 'id',
        confidence: 0.95,
        reasoning: evidence.join('; ') + `; unique-value ratio ${(col.uniqueValues / Math.max(col.totalRows - col.blankRows, 1)).toFixed(2)}`,
      })
      continue
    }

    if (matchedKind === 'category') {
      candidates.push({
        column: col.name,
        kind: 'category',
        confidence: col.detectedType === 'category' ? 0.9 : 0.6,
        reasoning: evidence.concat(`${col.uniqueValues} distinct values`).join('; '),
      })
      continue
    }

    if (matchedKind && !isNumericFamily && !isString) {
      // Name says "revenue" but the values aren't numeric — flag but don't propose
      continue
    }

    if (matchedKind === 'revenue' || matchedKind === 'cost') {
      if (isNumericFamily) {
        // Currency > plain number for money hints
        const shapeBoost = col.detectedType === 'currency' ? 0.10 : 0
        candidates.push({
          column: col.name,
          kind: matchedKind,
          confidence: Math.min(0.98, nameConfidence + shapeBoost),
          reasoning: evidence.concat(col.detectedType === 'currency' ? 'values are currency-typed' : 'values are numeric').join('; '),
        })
      }
      continue
    }

    if (matchedKind === 'count' || matchedKind === 'quantity') {
      // Both name-match AND numeric = high confidence. Non-numeric = drop.
      if (isNumericFamily) {
        candidates.push({
          column: col.name,
          kind: matchedKind,
          confidence: nameConfidence,
          reasoning: evidence.concat('values are numeric').join('; '),
        })
      }
      continue
    }

    if (matchedKind === 'rate') {
      // Rate columns are usually % values (0–100) or ratios (0–1). Sanity-check.
      if (isNumericFamily && col.numericStats) {
        const inPercentRange = col.numericStats.min >= 0 && col.numericStats.max <= 100
        const inRatioRange = col.numericStats.min >= 0 && col.numericStats.max <= 1
        if (inPercentRange || inRatioRange) {
          candidates.push({
            column: col.name,
            kind: 'rate',
            confidence: nameConfidence,
            reasoning: evidence.concat(`values in ${inRatioRange ? '[0,1]' : '[0,100]'} range`).join('; '),
          })
        }
      }
      continue
    }

    // Shape-only fallback: unnamed numeric column with a lot of variation is
    // *probably* a metric but we don't know which kind. Propose as 'count'
    // with low confidence so the UI shows it as "possibly a metric — please
    // confirm."
    if (isNumericFamily && !matchedKind && col.uniqueValues > 5) {
      candidates.push({
        column: col.name,
        kind: 'count',
        confidence: 0.35,
        reasoning: `numeric column with ${col.uniqueValues} distinct values — plausible metric but name gives no hint`,
      })
    }
  }

  // Sort strongest signals first so consumers can just pick candidates[0]
  return candidates.sort((a, b) => b.confidence - a.confidence)
}
