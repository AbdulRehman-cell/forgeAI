import type { SchemaReport } from '../profile/schemaReport'
import type { CleaningResult, Change } from '../clean'
import type { MetricsResult, ComputedMetric } from '../metrics'
import { getVerticalTheme, verticalCssOverrides } from './styles'

/**
 * Deterministic Power BI-style HTML template. Same inputs produce byte-
 * identical output (Milestone 7 refresh diff/skip depends on this).
 *
 * Layout:
 *   - Header (title + intent + generated timestamp + PDF button)
 *   - Sticky filter bar (auto-detected date + category slicers)
 *   - Tab bar (if the planner emitted multiple pages)
 *   - Per-page: hero KPIs → charts → tables → changelog
 * The client script mutates DOM live on filter changes.
 */

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  )

function formatNumber(n: number, currencyIso?: string | null, opts?: { compact?: boolean }): string {
  if (opts?.compact) {
    const abs = Math.abs(n)
    if (abs >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`
    if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.?0+$/, '')}K`
  }
  const fmtOpts: Intl.NumberFormatOptions = currencyIso
    ? { style: 'currency', currency: currencyIso, maximumFractionDigits: 2, notation: opts?.compact ? 'compact' : 'standard' }
    : Math.abs(n) >= 1000 ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 2 }
  try { return new Intl.NumberFormat('en-US', fmtOpts).format(n) }
  catch { return String(n) }
}

/** KPI accent color class (cycles 1-6). */
function kpiColorClass(idx: number): string { return `kpi-c-${(idx % 6) + 1}` }

/** Inline SVG icon for each KPI slot (cycles 1-6). */
function kpiIconSvg(idx: number): string {
  const icons = [
    `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="2,13 6,9 10,11 16,4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="12,4 16,4 16,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.8"/><line x1="9" y1="5" x2="9" y2="13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="6.5" y1="7" x2="11.5" y2="7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="6.5" y1="11" x2="11.5" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="3" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="13" x2="10" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="6.5" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M3,16 Q3,11.5 9,11.5 Q15,11.5 15,16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>`,
    `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6,4 L12,4 Q13,4 13,5 L13,15 Q13,16 12,16 L6,16 Q5,16 5,15 L5,5 Q5,4 6,4Z" stroke="currentColor" stroke-width="1.8"/><path d="M7,4 L7,3 Q7,2 9,2 Q11,2 11,3 L11,4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    `<svg width="17" height="17" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="6" r="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="1.8"/><line x1="4" y1="14" x2="14" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  ]
  return icons[idx % 6]
}

function renderMetricTile(m: ComputedMetric, idx: number, currencyByColumn: Map<string, string | null>): string {
  if (!m.value) return ''
  const layout = m.spec.layout ?? 'half'
  const iso = m.spec.valueColumn ? currencyByColumn.get(m.spec.valueColumn) ?? null : null
  const cc = kpiColorClass(idx)

  // ── KPI-style hero tile ──
  if (m.value.kind === 'total' || m.value.kind === 'average' || m.value.kind === 'distinct_count') {
    const label = escapeHtml(m.spec.label).toUpperCase()
    const isCurrency = !!iso
    const value = m.value.kind === 'distinct_count' ? m.value.value.toLocaleString() : formatNumber(m.value.value, iso, { compact: isCurrency })
    const sub = m.value.kind === 'distinct_count' ? `${m.value.rowCount.toLocaleString()} total rows` : `${m.value.rowCount.toLocaleString()} row${m.value.rowCount === 1 ? '' : 's'}`
    return `<div class="tile ${layout}"><div class="kpi-card ${cc}"><div class="kpi-card-top"><span class="kpi-label">${label}</span><span class="kpi-icon">${kpiIconSvg(idx)}</span></div><div class="kpi-val" data-kpi-value="${escapeHtml(m.spec.id)}">${escapeHtml(value)}</div><div class="kpi-delta-row"><span class="kpi-delta" data-kpi-delta="${escapeHtml(m.spec.id)}"></span><span class="kpi-delta-sub" data-kpi-sub="${escapeHtml(m.spec.id)}">${escapeHtml(sub)}</span></div><canvas class="kpi-sparkline" id="sparkline-${escapeHtml(m.spec.id)}"></canvas></div></div>`
  }

  if (m.value.kind === 'growth_rate') {
    const rate = m.value.rate
    const dir = rate === null ? 'flat' : rate > 0 ? 'up' : rate < 0 ? 'down' : 'flat'
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '·'
    const rateText = rate === null ? 'n/a' : `${(rate * 100).toFixed(1)}%`
    const label = escapeHtml(m.spec.label).toUpperCase()
    const sub = `${m.value.currentBucket} vs ${m.value.previousBucket} · ${formatNumber(m.value.previous, iso, { compact: true })} → ${formatNumber(m.value.current, iso, { compact: true })}`
    return `<div class="tile ${layout}"><div class="kpi-card ${cc} growth ${dir}"><div class="kpi-card-top"><span class="kpi-label">${label}</span><span class="kpi-icon">${kpiIconSvg(idx)}</span></div><div class="kpi-val"><span class="arrow">${arrow}</span>${escapeHtml(rateText)}</div><div class="kpi-delta-row"><span class="kpi-delta-sub">${escapeHtml(sub)}</span></div></div></div>`
  }

  if (m.value.kind === 'period_comparison') {
    const rate = m.value.rate
    const dir = rate === null ? 'flat' : rate > 0 ? 'up' : rate < 0 ? 'down' : 'flat'
    const rateText = rate === null ? 'n/a' : `${rate > 0 ? '+' : ''}${(rate * 100).toFixed(1)}%`
    const label = escapeHtml(m.spec.label).toUpperCase()
    const current = formatNumber(m.value.current, iso, { compact: true })
    const previous = formatNumber(m.value.previous, iso, { compact: true })
    return `<div class="tile ${layout}"><div class="kpi-card ${cc} growth ${dir}"><div class="kpi-card-top"><span class="kpi-label">${label} · ${escapeHtml(m.value.currentBucket)}</span><span class="kpi-icon">${kpiIconSvg(idx)}</span></div><div class="kpi-val">${escapeHtml(current)}</div><div class="kpi-delta-row"><span class="kpi-delta ${dir}">${escapeHtml(rateText)}</span><span class="kpi-delta-sub">vs ${escapeHtml(previous)} prev</span></div></div></div>`
  }

  if (m.value.kind === 'ratio') {
    const r = m.value.ratio ?? 0
    const displayValue = m.value.asPercent ? `${(r * 100).toFixed(2)}%` : r.toFixed(3)
    const sub = `${formatNumber(m.value.numerator, iso, { compact: true })} / ${formatNumber(m.value.denominator, iso, { compact: true })}`
    return `<div class="tile ${layout}"><div class="kpi-card ${cc}"><div class="kpi-card-top"><span class="kpi-label">${escapeHtml(m.spec.label).toUpperCase()}</span><span class="kpi-icon">${kpiIconSvg(idx)}</span></div><div class="kpi-val" data-kpi-value="${escapeHtml(m.spec.id)}">${escapeHtml(displayValue)}</div><div class="kpi-delta-row"><span class="kpi-delta" data-kpi-delta="${escapeHtml(m.spec.id)}"></span><span class="kpi-delta-sub" data-kpi-sub="${escapeHtml(m.spec.id)}">${escapeHtml(sub)}</span></div><canvas class="kpi-sparkline" id="sparkline-${escapeHtml(m.spec.id)}"></canvas></div></div>`
  }

  // ── Chart cards ──
  if (m.value.kind === 'timeseries' || m.value.kind === 'multi_series') {
    const bucket = m.value.kind === 'multi_series' ? m.value.bucket : m.value.bucket
    const points = m.value.kind === 'multi_series' ? (m.value.series[0]?.points.length ?? 0) : m.value.series.length
    const tsSub = `${escapeHtml(bucket.charAt(0).toUpperCase() + bucket.slice(1))} trend · ${points} data point${points === 1 ? '' : 's'}`
    return `<div class="tile ${layout}"><div class="card ${layout}" data-chart-id="${escapeHtml(m.spec.id)}"><div class="card-hdr"><h3>${escapeHtml(m.spec.label)}</h3><button class="expand-btn" data-chart-id="${escapeHtml(m.spec.id)}">⤢</button></div><div class="sub">${tsSub}</div><div class="chart-wrap"><canvas id="chart-${escapeHtml(m.spec.id)}"></canvas></div></div></div>`
  }
  if (m.value.kind === 'top_n' || m.value.kind === 'donut') {
    const total = m.value.entries.reduce((s, e) => s + e.value, 0)
    const chartSub = m.value.kind === 'donut'
      ? `Share of total${m.value.entries.length > 1 ? ' — click a segment to cross-filter' : ''}`
      : `Top ${m.value.entries.length} by ${escapeHtml(m.spec.groupColumn ?? 'value')} — click to cross-filter`
    return `<div class="tile ${layout}"><div class="card" data-chart-id="${escapeHtml(m.spec.id)}"><div class="card-hdr"><h3>${escapeHtml(m.spec.label)}</h3><button class="expand-btn" data-chart-id="${escapeHtml(m.spec.id)}">⤢</button></div><div class="sub">${chartSub}</div><div class="chart-wrap"><canvas id="chart-${escapeHtml(m.spec.id)}"></canvas></div></div></div>`
  }
  if (m.value.kind === 'grouped_bar') {
    const g = m.value.groups.length, s = m.value.splitLabels.length
    const gbSub = `${escapeHtml(m.spec.groupColumn ?? '')} × ${escapeHtml(m.spec.splitColumn ?? '')} · ${g} groups, ${s} series`
    return `<div class="tile ${layout}"><div class="card ${layout}" data-chart-id="${escapeHtml(m.spec.id)}"><div class="card-hdr"><h3>${escapeHtml(m.spec.label)}</h3><button class="expand-btn" data-chart-id="${escapeHtml(m.spec.id)}">⤢</button></div><div class="sub">${gbSub}</div><div class="chart-wrap"><canvas id="chart-${escapeHtml(m.spec.id)}"></canvas></div></div></div>`
  }
  if (m.value.kind === 'gauge') {
    return `<div class="tile ${layout}"><div class="card" data-chart-id="${escapeHtml(m.spec.id)}"><div class="card-hdr"><h3>${escapeHtml(m.spec.label)}</h3><button class="expand-btn" data-chart-id="${escapeHtml(m.spec.id)}">⤢</button></div><div class="sub">Target ${formatNumber(m.value.target, iso, { compact: true })}</div><div class="chart-wrap" style="height:220px"><canvas id="chart-${escapeHtml(m.spec.id)}"></canvas></div></div></div>`
  }
  if (m.value.kind === 'table') {
    const rowsData = m.value.rows
    const extraCols = (m.value.valueColumns ?? []).slice(1) // primary is m.spec.valueColumn / cols[0]
    const primaryCol = m.value.valueColumns?.[0] ?? m.spec.valueColumn ?? ''
    const maxVal = rowsData.reduce((mx, r) => Math.max(mx, r.value), 0) || 1
    const maxPct = rowsData.reduce((mx, r) => Math.max(mx, r.pctOfTotal), 0) || 1
    const heat = (pct: number): string => {
      const t = maxPct === 0 ? 0 : pct / maxPct
      const hue = Math.round(120 - t * 120)
      return `background: hsla(${hue}, 70%, 45%, 0.25); color: hsl(${hue}, 85%, 75%); font-weight: 600;`
    }
    const body = rowsData.map((r) => {
      const extraTds = extraCols.map((c) => {
        const v = r.extras?.[c]
        if (typeof v === 'number') return `<td class="num">${escapeHtml(formatNumber(v, iso))}</td>`
        if (typeof v === 'string' && v !== '') return `<td>${escapeHtml(v)}</td>`
        return `<td class="num" style="color: var(--muted)">—</td>`
      }).join('')
      return `<tr><td>${escapeHtml(r.label)}</td><td class="num">${r.rowCount.toLocaleString()}</td><td class="num">${escapeHtml(formatNumber(r.value, iso))}</td>${extraTds}<td class="num"><span class="bar"><span style="width:${Math.round((r.value / maxVal) * 100)}%"></span></span><span class="heat-cell" style="${heat(r.pctOfTotal)}">${(r.pctOfTotal * 100).toFixed(1)}%</span></td></tr>`
    }).join('')

    const extraTh = extraCols.map((c) => `<th class="num">${escapeHtml(c)}</th>`).join('')
    return `<div class="tile ${layout}"><div class="card data-table"><div class="card-hdr"><h3>${escapeHtml(m.spec.label)}</h3><div class="tbl-controls"><input class="tbl-search" type="search" placeholder="Search rows…" autocomplete="off"><span class="tbl-count"></span><button class="tbl-export-btn">↓ CSV</button></div></div><div class="sub">${rowsData.length} row${rowsData.length === 1 ? '' : 's'} · ${formatNumber(m.value.totalRow.value, iso, { compact: true })} total across ${m.value.totalRow.rowCount.toLocaleString()} record(s)</div><div class="chart-wrap"><table><thead><tr><th class="sortable">${escapeHtml(m.spec.groupColumn ?? '')}</th><th class="num sortable">Rows</th><th class="num sortable">${escapeHtml(primaryCol)}</th>${extraTh.replace(/<th /g, '<th class="num sortable" ')}<th class="num sortable">% of total</th></tr></thead><tbody>${body}</tbody></table></div></div></div>`
  }
  return ''
}

function renderInsights(metrics: MetricsResult, schema: SchemaReport, currencyByColumn: Map<string, string | null>): string {
  const items: { icon: string; iconBg: string; iconColor: string; html: string }[] = []

  // 1. Top entry from first ranked chart (top_n or donut)
  const rankedM = metrics.metrics.find((m) => m.value?.kind === 'top_n' || m.value?.kind === 'donut')
  if (rankedM?.value && (rankedM.value.kind === 'top_n' || rankedM.value.kind === 'donut')) {
    const top = rankedM.value.entries[0]
    if (top) {
      const iso = rankedM.spec.valueColumn ? currencyByColumn.get(rankedM.spec.valueColumn) ?? null : null
      const val = formatNumber(top.value, iso, { compact: true })
      const pct = (top.pctOfTotal * 100).toFixed(1)
      const dim = escapeHtml(rankedM.spec.groupColumn || 'group')
      items.push({ icon: '↑', iconBg: 'rgba(22,163,74,.12)', iconColor: '#15803d', html: `<strong>${escapeHtml(top.label)}</strong> leads ${dim} at <strong>${escapeHtml(val)}</strong> (${pct}% of total).` })
    }
  }

  // 2. Largest currency KPI
  const revM = metrics.metrics.find((m) => m.value?.kind === 'total' && m.spec.valueColumn && currencyByColumn.get(m.spec.valueColumn))
  if (revM?.value?.kind === 'total') {
    const iso = currencyByColumn.get(revM.spec.valueColumn!) ?? null
    const val = formatNumber(revM.value.value, iso, { compact: true })
    items.push({ icon: '★', iconBg: 'rgba(59,130,246,.12)', iconColor: '#2563eb', html: `<strong>${escapeHtml(revM.spec.label)}</strong> is <strong>${escapeHtml(val)}</strong> across ${revM.value.rowCount.toLocaleString()} records.` })
  }

  // 3. Growth rate or period comparison
  const growM = metrics.metrics.find((m) => m.value?.kind === 'growth_rate' || m.value?.kind === 'period_comparison')
  if (growM?.value) {
    const rate = (growM.value as { rate: number | null }).rate
    if (rate !== null) {
      const dir = rate > 0 ? 'up' : 'down'
      const pct = `${Math.abs(rate * 100).toFixed(1)}%`
      items.push({ icon: dir === 'up' ? '↑' : '↓', iconBg: dir === 'up' ? 'rgba(22,163,74,.12)' : 'rgba(220,38,38,.12)', iconColor: dir === 'up' ? '#15803d' : '#b91c1c', html: `<strong>${escapeHtml(growM.spec.label)}</strong> moved <strong>${rate > 0 ? '+' : '-'}${pct}</strong> period-over-period.` })
    }
  }

  // 4. Ratio / margin insight
  const ratM = metrics.metrics.find((m) => m.value?.kind === 'ratio')
  if (ratM?.value?.kind === 'ratio') {
    const r = ratM.value.ratio ?? 0
    const val = ratM.value.asPercent ? `${(r * 100).toFixed(1)}%` : r.toFixed(2)
    const isLow = ratM.value.asPercent && r < 0.15
    items.push({ icon: isLow ? '!' : '≈', iconBg: isLow ? 'rgba(245,158,11,.12)' : 'rgba(139,92,246,.12)', iconColor: isLow ? '#b45309' : '#7c3aed', html: `<strong>${escapeHtml(ratM.spec.label)}</strong> is <strong>${escapeHtml(val)}</strong>${isLow ? ' — below 15%, worth reviewing.' : '.'}` })
  }

  // 5. Dataset summary line
  const dateDim = metrics.filterDimensions.find((d) => d.kind === 'date') as { kind: string; column: string; dateRange?: { min: string; max: string } } | undefined
  const periodText = dateDim?.dateRange ? ` over ${dateDim.dateRange.min.slice(0, 7)} – ${dateDim.dateRange.max.slice(0, 7)}` : ''
  items.push({ icon: '⊞', iconBg: 'rgba(100,116,139,.1)', iconColor: '#475569', html: `Dataset contains <strong>${schema.source.rows.toLocaleString()} rows</strong> × <strong>${schema.source.columns} columns</strong>${escapeHtml(periodText)}.` })

  if (!items.length) return ''
  return `<div class="insights-card">
    <div class="insights-hdr"><h3>Executive Insights</h3><span class="insights-sub">Auto-generated from the current selection</span></div>
    <ul class="insights-list">
      ${items.map((it) => `<li><span class="insight-icon" style="background:${it.iconBg};color:${it.iconColor}">${it.icon}</span><span>${it.html}</span></li>`).join('')}
    </ul>
  </div>`
}

function renderSummary(metrics: MetricsResult): string {
  const { summary } = metrics
  if (!summary.text) {
    return `<div class="summary unavailable"><p>AI summary unavailable${summary.error ? ` — ${escapeHtml(summary.error)}` : ''}. Numbers above are the source of truth.</p></div>`
  }
  const lines = summary.text.split('\n').map((l) => l.trim()).filter(Boolean)
  const looksLikeBullets = lines.length > 1 && lines.every((l) => /^[-•*]\s+/.test(l))
  if (looksLikeBullets) {
    return `<div class="summary"><ul>${lines.map((l) => `<li>${escapeHtml(l.replace(/^[-•*]\s+/, ''))}</li>`).join('')}</ul></div>`
  }
  return `<div class="summary"><p>${escapeHtml(summary.text).replace(/\n/g, '<br>')}</p></div>`
}

function renderAnomalies(metrics: MetricsResult): string {
  if (!metrics.anomalies.length) return ''
  const items = metrics.anomalies.map((a) => `<div class="anomaly ${a.direction}">${escapeHtml(a.message)}</div>`).join('')
  return `<div class="section"><h2>Anomalies (${metrics.anomalies.length})</h2><div class="anomaly-list">${items}</div></div>`
}

function renderChangelog(changes: Change[]): string {
  if (!changes.length) return ''
  const lines = changes.map((c) => `<div class="log-line"><span class="log-badge ${c.severity}">${c.severity}</span><span class="log-msg"><strong>${escapeHtml(c.column)}</strong>: ${escapeHtml(c.message.replace(/^[^:]+:\s*/, ''))}</span></div>`).join('')
  const errCount = changes.filter((c) => c.severity === 'error').length
  const warnCount = changes.filter((c) => c.severity === 'warning').length
  const s = [errCount ? `${errCount} error${errCount === 1 ? '' : 's'}` : '', warnCount ? `${warnCount} warning${warnCount === 1 ? '' : 's'}` : '', `${changes.length} total`].filter(Boolean).join(' · ')
  return `<details class="log"><summary>Cleaning changelog — ${escapeHtml(s)}</summary><div class="body">${lines}</div></details>`
}

function renderSkipped(metrics: MetricsResult): string {
  if (!metrics.skipped.length && !(metrics.plannerRejections?.length)) return ''
  const bits: string[] = []
  for (const s of metrics.skipped) bits.push(`<div class="log-line"><span class="log-badge skipped">skipped</span><span class="log-msg"><strong>${escapeHtml(s.column)}</strong>: ${escapeHtml(s.reason)}</span></div>`)
  for (const r of metrics.plannerRejections ?? []) bits.push(`<div class="log-line"><span class="log-badge warning">rejected</span><span class="log-msg"><strong>${escapeHtml(r.id)}</strong>: ${escapeHtml(r.reason)}</span></div>`)
  return `<details class="log" open><summary>${metrics.skipped.length + (metrics.plannerRejections?.length ?? 0)} metric(s) not shown</summary><div class="body">${bits.join('')}</div></details>`
}

export interface RenderInput {
  dashboardName: string
  schema: SchemaReport
  cleaning: CleaningResult
  metrics: MetricsResult
  currencyByColumn: Map<string, string | null>
  styles: string
  charts: string
  /** Dashboard vertical — used for per-vertical accent colors, section labels, and header branding. */
  vertical?: string
  /** Base theme passed to verticalCssOverrides so it can target the right selectors. */
  baseTheme?: 'dark' | 'exec'
}

export function renderDashboardHtml(input: RenderInput): string {
  const { dashboardName, schema, cleaning, metrics, currencyByColumn, vertical, baseTheme = 'dark' } = input

  const vTheme = getVerticalTheme(vertical)
  const verticalCssBlock = verticalCssOverrides(vertical, baseTheme)

  // Section headings — fall back to generic labels when no vertical is set
  const sectionLabels = {
    kpi: vTheme?.sections.kpi ?? 'Key Metrics',
    charts: vTheme?.sections.charts ?? 'Charts & Analysis',
    insights: vTheme?.sections.insights ?? 'Executive Insights',
  }

  // Header logo — vertical-specific SVG or the default bar-chart icon
  const headerLogoInner = vTheme?.iconSvg
    ?? `<svg width="22" height="22" viewBox="0 0 22 22" fill="white" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="14" width="4" height="7" rx="1"/><rect x="7" y="9" width="4" height="12" rx="1"/><rect x="13" y="5" width="4" height="16" rx="1"/><rect x="19" y="1" width="2" height="20" rx="1"/></svg>`

  // Badge shown below the dashboard title when a vertical is set
  const verticalBadgeHtml = vTheme
    ? `<span class="vertical-badge" style="display:inline-block;font-size:.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:2px 10px;border-radius:999px;margin-top:4px;">${escapeHtml(vTheme.label)}</span>`
    : ''

  const clientPayload = {
    metrics: metrics.metrics.filter((m) => m.value).map((m) => ({
      id: m.spec.id, label: m.spec.label, kind: m.spec.kind,
      n: m.spec.n, groupColumn: m.spec.groupColumn, splitColumn: m.spec.splitColumn,
      spec: { valueColumn: m.spec.valueColumn, timeColumn: m.spec.timeColumn },
      value: m.value,
    })),
    filterDimensions: metrics.filterDimensions,
  }

  // Order: KPIs first, then charts, then tables — all on one page
  const kpiKinds = new Set(['total', 'average', 'distinct_count', 'growth_rate', 'period_comparison', 'ratio', 'gauge'])
  const kindOrder = (m: ComputedMetric): number => {
    const k = m.value?.kind ?? ''
    if (kpiKinds.has(k)) return 0
    if (k === 'timeseries' || k === 'multi_series') return 1
    if (k === 'donut' || k === 'top_n') return 2
    if (k === 'grouped_bar') return 3
    if (k === 'table') return 4
    return 5
  }
  const layoutOrder: Record<string, number> = { hero: 0, full: 1, half: 2, third: 3 }
  const sortedMetrics = metrics.metrics.filter((m) => m.value).slice()
    .sort((a, b) => {
      const ko = kindOrder(a) - kindOrder(b)
      if (ko !== 0) return ko
      return (layoutOrder[a.spec.layout ?? 'half'] ?? 4) - (layoutOrder[b.spec.layout ?? 'half'] ?? 4)
    })

  const kpis   = sortedMetrics.filter((m) => kpiKinds.has(m.value!.kind))
  const charts = sortedMetrics.filter((m) => !kpiKinds.has(m.value!.kind))

  const kpiHtml    = kpis.map((m, i) => renderMetricTile(m, i, currencyByColumn)).join('')
  const chartHtml  = charts.map((m, i) => renderMetricTile(m, kpis.length + i, currencyByColumn)).join('')
  const insightsHtml = renderInsights(metrics, schema, currencyByColumn)
  const summaryHtml  = renderSummary(metrics)

  const pageTabsHtml = ''   // single page — no tabs
  const pagePanelsHtml = `<div class="page-panel" data-tab-panel="page-0">
    ${kpiHtml   ? `<div class="section"><h2>${escapeHtml(sectionLabels.kpi)}</h2><div class="grid">${kpiHtml}</div></div>` : ''}
    ${chartHtml ? `<div class="section"><h2>${escapeHtml(sectionLabels.charts)}</h2><div class="grid">${chartHtml}</div></div>` : ''}
    ${insightsHtml ? `<div class="section">${insightsHtml.replace('<h3>Executive Insights</h3>', `<h3>${escapeHtml(sectionLabels.insights)}</h3>`)}</div>` : ''}
    ${summaryHtml ? `<div class="section"><h2>AI Summary</h2>${summaryHtml}</div>` : ''}
    ${renderAnomalies(metrics)}
    ${renderSkipped(metrics) ? `<div class="section">${renderSkipped(metrics)}</div>` : ''}
    ${renderChangelog(cleaning.changelog) ? `<div class="section">${renderChangelog(cleaning.changelog)}</div>` : ''}
  </div>`

  const generated = new Date(schema.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const intentSub = metrics.intent ? escapeHtml(metrics.intent) : `${escapeHtml(schema.source.filename)} · ${schema.source.rows.toLocaleString()} rows`

  // Reporting period from date filter dimension
  const dateDimForHdr = metrics.filterDimensions.find((d) => d.kind === 'date') as { kind: string; column: string; dateRange?: { min: string; max: string } } | undefined
  const fmtMon = (s: string): string => {
    try { return new Date(s.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) } catch { return s.slice(0, 7) }
  }
  const period = dateDimForHdr?.dateRange
    ? `${fmtMon(dateDimForHdr.dateRange.min)} – ${fmtMon(dateDimForHdr.dateRange.max)}`
    : new Date(schema.generatedAt).getFullYear().toString()

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(dashboardName)} — dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./styles.css">
${verticalCssBlock}
</head>
<body>
<div class="page">
  <header class="hdr">
    <div class="hdr-left">
      <div class="hdr-logo">${headerLogoInner}</div>
      <div>
        <h1>${escapeHtml(dashboardName)}</h1>
        ${verticalBadgeHtml}
        <div class="hdr-sub">${intentSub}</div>
      </div>
    </div>
    <div class="hdr-right">
      <div class="hdr-meta-block">
        <span class="hdr-meta-label">Reporting Period</span>
        <span class="hdr-meta-val">${escapeHtml(period)}</span>
      </div>
      <div class="hdr-meta-block">
        <span class="hdr-meta-label">Records</span>
        <span class="hdr-meta-val">${schema.source.rows.toLocaleString()}</span>
      </div>
      <div class="hdr-live-badge"><span class="hdr-live-dot"></span>Live data</div>
    </div>
  </header>

  ${metrics.filterDimensions.length ? `<div class="filter-bar" id="filter-bar"></div>` : ''}
  ${pageTabsHtml}

  ${pagePanelsHtml}

  <footer><div class="footer-inner"><span>Analytics by <strong>Forge AI</strong></span><span class="footer-sep">·</span><span>${schema.source.rows.toLocaleString()} rows analyzed</span><span class="footer-sep">·</span><span>Generated ${escapeHtml(generated)}</span><span class="footer-sep">·</span><a href="https://forgeai.dev" target="_blank" rel="noopener">forgeai.dev ↗</a></div></footer>
</div>

<div id="fa-backdrop" class="fa-backdrop"></div>
<div id="fa-toast-area" class="fa-toast-area"></div>

<script id="dashboard-data" type="application/json">${JSON.stringify(clientPayload).replace(/</g, '\\u003c')}</script>
<script src="./dashboard.js"></script>
</body>
</html>
`
}

export { escapeHtml, formatNumber }
