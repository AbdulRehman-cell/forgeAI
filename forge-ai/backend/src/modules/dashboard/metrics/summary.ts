import type { AIProvider } from '../../ai/providers/base'
import type { ComputedMetric } from './aggregate'
import type { Anomaly } from './anomalies'
import type { CurrencyDecision } from '../clean'

/**
 * The narrative layer. We feed the LLM ONLY the aggregated numbers, never
 * raw rows — this keeps the prompt tiny (a couple KB) AND removes any way
 * for the model to hallucinate a specific transaction. The system prompt is
 * strict: use only the provided numbers, no invented ones, no advice, no
 * fluff.
 *
 * Failure is a soft one: if the LLM call throws we return a null summary
 * and log the failure. The metrics endpoint still ships everything else —
 * the client sees an "AI summary unavailable" chip instead of the whole
 * dashboard failing.
 */

const SYSTEM_PROMPT = `You are a data analyst writing a short summary of a business dataset. Rules:
1. Use ONLY the numbers provided in the payload. Never invent values, percentages, or column names.
2. Reference metric labels verbatim.
3. If a currency label is provided for a metric, include it (e.g. "$12,340 USD").
4. Keep it short: 2–4 bullet points, one sentence each. No preamble, no advice, no meta-commentary.
5. When an anomaly is provided, mention the most significant one by name and cite its z-score or multiple.
6. If growth_rate is provided, state it as a percentage with direction ("up 12%", "down 4%").
7. If there are no anomalies and growth is flat, say so plainly.`

/** Shape sent to the LLM. Kept small and typed so we know exactly what the
 *  model can see. */
interface SummaryPayload {
  metrics: {
    id: string
    label: string
    kind: string
    currencyIso?: string | null
    value: unknown // whatever the ComputedMetric.value is (already JSON-safe)
  }[]
  anomalies: Anomaly[]
}

export async function generateSummary(
  provider: AIProvider,
  metrics: ComputedMetric[],
  anomalies: Anomaly[],
  currencyByColumn: Map<string, string | null>,
): Promise<{ summary: string | null; error?: string; payload: SummaryPayload }> {
  const payload: SummaryPayload = {
    metrics: metrics
      .filter((m) => m.value !== null)
      .map((m) => ({
        id: m.spec.id,
        label: m.spec.label,
        kind: m.spec.kind,
        currencyIso: m.spec.valueColumn ? (currencyByColumn.get(m.spec.valueColumn) ?? undefined) : undefined,
        value: m.value,
      })),
    anomalies,
  }

  // Empty payload — no need to burn an LLM call
  if (!payload.metrics.length && !payload.anomalies.length) {
    return { summary: null, error: 'no computed metrics to summarize', payload }
  }

  try {
    const res = await provider.chat(
      [{
        role: 'user',
        content:
          `Summarize the following aggregated metrics. Return only the bullet points, no preamble.\n\n` +
          `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
      }],
      SYSTEM_PROMPT,
    )
    return { summary: res.content.trim(), payload }
  } catch (err: any) {
    console.warn('[dashboard/summary] LLM call failed:', err?.message ?? err)
    return { summary: null, error: err?.message ?? 'LLM call failed', payload }
  }
}

/** Convenience: map from column name → resolved ISO currency, built from the
 *  cleaner's decisions. Used by generateSummary to label money metrics. */
export function currencyMapFromDecisions(decisions: CurrencyDecision[]): Map<string, string | null> {
  const m = new Map<string, string | null>()
  for (const d of decisions) m.set(d.column, d.resolvedIso)
  return m
}
