import type { ComputedMetric, TimeseriesPoint } from './aggregate'

/**
 * Anomaly detection over the computed timeseries. Simple z-score on the
 * per-bucket values — anything ≥2σ from the mean flags. Not a real outlier
 * detector, but honest about what it does: "this bucket was unusually
 * high/low compared to the rest of the series."
 *
 * The summary generator uses these to write "November was 3.2× the monthly
 * average" without us fabricating the number.
 */

export interface Anomaly {
  metricId: string
  bucket: string
  value: number
  mean: number
  stdDev: number
  zScore: number
  direction: 'spike' | 'dip'
  message: string
}

const Z_THRESHOLD = 2.0

function meanStd(nums: number[]): { mean: number; std: number } {
  if (!nums.length) return { mean: 0, std: 0 }
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const variance = nums.reduce((s, x) => s + (x - mean) ** 2, 0) / nums.length
  return { mean, std: Math.sqrt(variance) }
}

export function detectAnomalies(metrics: ComputedMetric[]): Anomaly[] {
  const out: Anomaly[] = []
  for (const m of metrics) {
    if (!m.value || m.value.kind !== 'timeseries') continue
    // Need enough points for the mean to be meaningful. 5 buckets minimum.
    if (m.value.series.length < 5) continue
    const nums = m.value.series.map((p: TimeseriesPoint) => p.value)
    const { mean, std } = meanStd(nums)
    if (std === 0) continue

    for (const p of m.value.series) {
      const z = (p.value - mean) / std
      if (Math.abs(z) < Z_THRESHOLD) continue
      const direction: 'spike' | 'dip' = z > 0 ? 'spike' : 'dip'
      const multiple = mean === 0 ? Infinity : p.value / mean
      out.push({
        metricId: m.spec.id,
        bucket: p.bucket,
        value: p.value,
        mean,
        stdDev: std,
        zScore: z,
        direction,
        message:
          `${m.spec.label}: ${direction === 'spike' ? 'spike' : 'dip'} at ${p.bucket} — ` +
          `${p.value.toLocaleString()} (${multiple.toFixed(2)}× the series average of ${mean.toFixed(2)}, z=${z.toFixed(2)}).`,
      })
    }
  }
  return out
}
