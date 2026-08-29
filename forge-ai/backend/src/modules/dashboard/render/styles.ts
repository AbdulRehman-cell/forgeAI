// Power BI-styled dashboard stylesheet. Hand-written for determinism —
// same inputs produce byte-identical output so scheduled-refresh diffs work.
// Two base themes: 'dark' (default) and 'exec' (blue-and-white boardroom look).
// Per-vertical accent overrides are injected as an inline <style> block via
// verticalCssOverrides() and applied after the external stylesheet.

export function dashboardCss(theme: 'dark' | 'exec' = 'dark'): string {
  return theme === 'exec' ? EXEC_CSS : DASHBOARD_CSS
}

interface VerticalTheme {
  accent: string
  accentDim: string
  headerGrad: string
  /** Human label shown as badge inside the dashboard header */
  label: string
  /** SVG path data for the 44×44 logo icon (single path, white fill) */
  iconSvg: string
  /** Section titles */
  sections: { kpi: string; charts: string; insights: string }
}

const VERTICAL_THEMES: Record<string, VerticalTheme> = {
  sales: {
    accent: '#f59e0b', accentDim: 'rgba(245,158,11,.15)',
    headerGrad: 'linear-gradient(135deg,#1a1000 0%,#3d2000 55%,#4d2c00 100%)',
    label: 'Sales Dashboard',
    iconSvg: '<svg width="22" height="22" viewBox="0 0 22 22" fill="white"><path d="M2 16l5-5 4 3 5-7 4 4"/><polyline points="14,4 20,4 20,10" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    sections: { kpi: 'Revenue Overview', charts: 'Pipeline & Performance', insights: 'Sales Insights' },
  },
  marketing: {
    accent: '#ec4899', accentDim: 'rgba(236,72,153,.15)',
    headerGrad: 'linear-gradient(135deg,#1a0714 0%,#3d0d30 55%,#4d103c 100%)',
    label: 'Marketing Analytics',
    iconSvg: '<svg width="22" height="22" viewBox="0 0 22 22" fill="white"><path d="M3 11 Q3 5 11 5 Q19 5 19 11 Q19 17 11 17" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"/><circle cx="7" cy="14" r="2" fill="white"/><line x1="11" y1="5" x2="11" y2="17" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>',
    sections: { kpi: 'Campaign KPIs', charts: 'Channel Performance', insights: 'Marketing Insights' },
  },
  finance: {
    accent: '#6366f1', accentDim: 'rgba(99,102,241,.15)',
    headerGrad: 'linear-gradient(135deg,#0a0c1e 0%,#1e2050 55%,#252870 100%)',
    label: 'Finance Dashboard',
    iconSvg: '<svg width="22" height="22" viewBox="0 0 22 22" fill="white"><rect x="2" y="15" width="4" height="5" rx="1"/><rect x="8" y="10" width="4" height="10" rx="1"/><rect x="14" y="5" width="4" height="15" rx="1"/><line x1="1" y1="21" x2="21" y2="21" stroke="white" stroke-width="1.5"/></svg>',
    sections: { kpi: 'Financial Health', charts: 'Revenue & Expense Trends', insights: 'Financial Insights' },
  },
  ecommerce: {
    accent: '#a855f7', accentDim: 'rgba(168,85,247,.15)',
    headerGrad: 'linear-gradient(135deg,#120a1e 0%,#2d1050 55%,#3d1260 100%)',
    label: 'Ecommerce Dashboard',
    iconSvg: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"><path d="M2 3h2l2.5 11h9l2-6H7"/><circle cx="9.5" cy="17.5" r="1.5" fill="white" stroke="none"/><circle cx="15.5" cy="17.5" r="1.5" fill="white" stroke="none"/></svg>',
    sections: { kpi: 'Store Performance', charts: 'Product & Traffic', insights: 'Commerce Insights' },
  },
  executive: {
    accent: '#38bdf8', accentDim: 'rgba(56,189,248,.15)',
    headerGrad: 'linear-gradient(135deg,#060c18 0%,#0d2042 55%,#0f2952 100%)',
    label: 'Executive Summary',
    iconSvg: '<svg width="22" height="22" viewBox="0 0 22 22" fill="white"><rect x="1" y="14" width="4" height="7" rx="1"/><rect x="7" y="9" width="4" height="12" rx="1"/><rect x="13" y="5" width="4" height="16" rx="1"/><rect x="19" y="1" width="2" height="20" rx="1"/></svg>',
    sections: { kpi: 'Executive Summary', charts: 'Trend Analysis', insights: 'Board Insights' },
  },
  itsm: {
    accent: '#ef4444', accentDim: 'rgba(239,68,68,.15)',
    headerGrad: 'linear-gradient(135deg,#1c0808 0%,#3d0e0e 55%,#4d1010 100%)',
    label: 'ITSM Dashboard',
    iconSvg: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="white" stroke-width="1.8"><rect x="2" y="3" width="18" height="13" rx="2"/><line x1="7" y1="19" x2="15" y2="19"/><line x1="11" y1="16" x2="11" y2="19"/><circle cx="11" cy="9" r="2" stroke="white" fill="none"/><line x1="11" y1="6" x2="11" y2="7"/><line x1="11" y1="11" x2="11" y2="12"/></svg>',
    sections: { kpi: 'Incident Overview', charts: 'Service Health Trends', insights: 'ITSM Insights' },
  },
  operations: {
    accent: '#f97316', accentDim: 'rgba(249,115,22,.15)',
    headerGrad: 'linear-gradient(135deg,#1c0e04 0%,#3d1e00 55%,#4d2800 100%)',
    label: 'Operations Dashboard',
    iconSvg: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="3"/><path d="M11 2v3M11 17v3M2 11h3M17 11h3M4.9 4.9l2.1 2.1M15 15l2.1 2.1M4.9 17.1l2.1-2.1M15 7l2.1-2.1"/></svg>',
    sections: { kpi: 'Operational KPIs', charts: 'Throughput & Quality', insights: 'Operations Insights' },
  },
  support: {
    accent: '#14b8a6', accentDim: 'rgba(20,184,166,.15)',
    headerGrad: 'linear-gradient(135deg,#060e0d 0%,#0d2e2a 55%,#0f3832 100%)',
    label: 'Support Dashboard',
    iconSvg: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h16a1 1 0 011 1v8a1 1 0 01-1 1H7l-4 3V7a1 1 0 011-1z"/></svg>',
    sections: { kpi: 'Support Metrics', charts: 'Ticket Analysis', insights: 'Support Insights' },
  },
}

export function getVerticalTheme(vertical: string | undefined): VerticalTheme | null {
  return vertical ? (VERTICAL_THEMES[vertical] ?? null) : null
}

/** Returns an inline <style> block that overrides the base theme's accent colour
 *  with the vertical-specific palette. Injected in <head> after styles.css. */
export function verticalCssOverrides(vertical: string | undefined, baseTheme: 'dark' | 'exec'): string {
  const t = getVerticalTheme(vertical)
  if (!t) return ''

  const a = t.accent
  const ad = t.accentDim

  if (baseTheme === 'exec') {
    return `<style>
.hdr{background:${t.headerGrad}!important}
.tab.active{color:${a}!important;border-bottom-color:${a}!important}
.period-preset-btn.active{background:${ad}!important;border-color:${a}!important;color:${a}!important}
.filter-funnel{color:${a}!important}
.hdr-live-dot{background:${a}!important;box-shadow:0 0 6px ${a}!important}
.fa-toast{background:${a}!important}
.vertical-badge{background:${ad};color:${a}}
</style>`
  }

  // Dark theme overrides
  return `<style>
.hdr{background:${t.headerGrad}!important}
.kpi-c-1{--kpi-accent:${a};--kpi-icon-bg:${ad}}
.filter-funnel{color:${a}}
.filter-select:focus,.filter-range input[type="date"]:focus{border-color:${a}}
.tbl-search:focus{border-color:${a}}
.period-preset-btn.active{background:${ad};border-color:${a};color:${a}}
.tab.active{color:${a};border-bottom-color:${a}}
.summary{border-left-color:${a}}
.summary li::before{background:${a}}
.data-table .bar>span{background:${a}}
.data-table tbody tr.row-hl td{background:${ad}!important}
thead th.sortable[data-sort-dir="asc"]::after,thead th.sortable[data-sort-dir="desc"]::after{color:${a}}
.hdr-live-dot{background:${a};box-shadow:0 0 6px ${a}}
.fa-toast{background:${a};color:#0a0d12}
.anomaly.spike{border-left-color:${a}}
.vertical-badge{background:${ad};color:${a}}
</style>`
}

export const DASHBOARD_CSS = `
:root {
  --bg: #0a0d12;
  --surface: #131820;
  --surface-2: #1a2030;
  --surface-hi: #212a3a;
  --border: #262f42;
  --text: #f0f4f8;
  --muted: #8b949e;
  --dim: #6b7280;
  --danger: #ef4444;
  --danger-dim: rgba(239,68,68,.15);
  --warn:   #f59e0b;
  --warn-dim: rgba(245,158,11,.15);
  --shadow-1: 0 1px 3px rgba(0,0,0,.4);
  --shadow-2: 0 8px 24px -8px rgba(0,0,0,.6), 0 2px 6px rgba(0,0,0,.4);
  --shadow-hi: 0 20px 40px -12px rgba(0,0,0,.7);
  --radius: 12px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--text); font-family: "Inter", ui-sans-serif, system-ui, sans-serif; line-height: 1.5; -webkit-font-smoothing: antialiased; }
body { min-height: 100vh; padding: 20px clamp(12px, 3vw, 32px) 40px; }
a { color: #38bdf8; text-decoration: none; }
a:hover { text-decoration: underline; }

.page { max-width: 1400px; margin: 0 auto; }

/* ── Header (dark) ── */
.hdr { background: linear-gradient(135deg, #060c18 0%, #0d2042 55%, #0f2952 100%); border-radius: var(--radius); padding: 20px 28px; margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; border: none; }
.hdr-left { display: flex; align-items: center; gap: 14px; }
.hdr-logo { width: 44px; height: 44px; flex-shrink: 0; background: rgba(255,255,255,.1); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.hdr h1 { font-family: "Space Grotesk", "Inter", sans-serif; font-size: clamp(1.1rem, 2.2vw, 1.6rem); font-weight: 700; letter-spacing: -.02em; color: #fff; }
.hdr-sub { color: rgba(255,255,255,.6); font-size: .82rem; margin-top: 3px; }
.hdr-right { display: flex; align-items: center; gap: 20px; flex-shrink: 0; }
.hdr-meta-block { text-align: center; }
.hdr-meta-label { display: block; font-size: .6rem; text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,.45); font-weight: 600; }
.hdr-meta-val { display: block; font-size: .95rem; font-weight: 700; color: #fff; margin-top: 3px; font-family: "Space Grotesk"; }
.hdr-live-badge { display: flex; align-items: center; gap: 7px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15); color: #fff; font-size: .76rem; font-weight: 500; padding: 7px 14px; border-radius: 999px; white-space: nowrap; }
.hdr-live-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 6px #4ade80; animation: fa-pulse 2s ease-in-out infinite; flex-shrink: 0; }
@keyframes fa-pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
.hdr-actions { display: none; }
.hdr-btn { display: none; }

/* ── Filter bar (dark) ── */
.filter-bar { position: sticky; top: 0; z-index: 10; background: rgba(19,24,32,.97); backdrop-filter: blur(10px); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 20px 12px; margin-bottom: 20px; box-shadow: var(--shadow-2); }
.filter-bar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.filter-bar-title { font-size: .82rem; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; }
.filter-funnel { color: #22c55e; }
.filter-bar-badge { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); font-size: .72rem; font-weight: 600; padding: 2px 9px; border-radius: 999px; }
.filter-reset-btn { background: transparent; border: 1px solid var(--border); color: var(--muted); font: .76rem "Inter"; padding: 5px 13px; border-radius: 6px; cursor: pointer; }
.filter-reset-btn:hover { background: var(--surface-2); color: var(--text); }
.filter-bar-body { display: flex; flex-wrap: wrap; gap: 12px 18px; }
.filter { display: flex; flex-direction: column; gap: 5px; }
.filter-title { font-size: .6rem; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); font-weight: 700; }
.filter-select { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); font: .82rem "Inter"; padding: 7px 30px 7px 10px; border-radius: 8px; outline: none; cursor: pointer; appearance: none; -webkit-appearance: none; min-width: 140px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238b949e' d='M6 8L1 3h10z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; }
.filter-select:focus { border-color: #22c55e; }
.filter-range { display: flex; align-items: center; gap: 8px; }
.filter-range input[type="date"] { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); font: .82rem "Inter"; padding: 7px 8px; border-radius: 8px; outline: none; }
.filter-range input[type="date"]:focus { border-color: #22c55e; }
.range-arrow { color: var(--muted); }
.filter-status { margin-top: 10px; font-size: .76rem; color: var(--muted); border-top: 1px solid var(--border); padding-top: 8px; }
.period-presets { display: flex; gap: 5px; margin-top: 5px; }
.period-preset-btn { background: var(--surface-2); border: 1px solid var(--border); color: var(--muted); font: 600 .72rem "Inter"; padding: 3px 9px; border-radius: 6px; cursor: pointer; transition: background .15s, color .15s; }
.period-preset-btn:hover { background: var(--surface-hi); color: var(--text); }
.period-preset-btn.active { background: rgba(34,197,94,.15); border-color: #22c55e; color: #22c55e; }

/* ── Tabs ── */
.tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
.tab { background: transparent; color: var(--muted); border: none; font: 600 .82rem "Inter"; padding: 8px 18px; cursor: pointer; border-bottom: 2px solid transparent; letter-spacing: .01em; }
.tab:hover { color: var(--text); }
.tab.active { color: #22c55e; border-bottom-color: #22c55e; }

/* ── Section + grid ── */
.section { margin-bottom: 20px; }
.section > h2 { font-family: "Space Grotesk"; font-size: .74rem; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
.tile { grid-column: span 12; }
.tile.hero { grid-column: span 3; }
.tile.half { grid-column: span 6; }
.tile.third { grid-column: span 4; }
.tile.full { grid-column: span 12; }
@media (max-width: 1100px) { .tile.hero { grid-column: span 6; } .tile.third { grid-column: span 6; } }
@media (max-width: 700px) { .tile.hero, .tile.third, .tile.half { grid-column: span 12; } }

/* ── Executive Insights (dark) ── */
.insights-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 24px; box-shadow: var(--shadow-2); margin-bottom: 20px; }
.insights-hdr { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
.insights-hdr h3 { font-family: "Space Grotesk"; font-size: .95rem; font-weight: 700; color: var(--text); }
.insights-sub { font-size: .74rem; color: var(--muted); }
.insights-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
.insights-list li { display: flex; align-items: flex-start; gap: 12px; font-size: .87rem; line-height: 1.55; color: var(--text); }
.insight-icon { flex-shrink: 0; width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 700; }
.insights-list li strong { font-weight: 600; color: var(--text); }

/* ── KPI card (dark theme) ── */
.kpi-card {
  background: var(--surface); border-radius: var(--radius);
  border: 1px solid var(--border);
  border-left: 4px solid var(--kpi-accent, #22c55e);
  padding: 18px 18px 16px; min-height: 130px;
  box-shadow: var(--shadow-2);
  position: relative; overflow: hidden;
  display: flex; flex-direction: column; justify-content: space-between;
  transition: box-shadow .2s, transform .2s; cursor: pointer;
}
.kpi-card:hover { box-shadow: var(--shadow-hi); transform: translateY(-2px); }
.kpi-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.kpi-label { font-size: .63rem; font-weight: 700; letter-spacing: .09em; color: var(--muted); text-transform: uppercase; line-height: 1.3; }
.kpi-icon { width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0; background: var(--kpi-icon-bg, rgba(34,197,94,.12)); color: var(--kpi-accent, #22c55e); display: flex; align-items: center; justify-content: center; }
.kpi-val { font-family: "Space Grotesk"; font-size: clamp(1.4rem, 2.8vw, 2.1rem); font-weight: 700; letter-spacing: -.03em; color: var(--text); margin: 10px 0 6px; line-height: 1.1; }
.kpi-delta-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; min-height: 22px; }
.kpi-delta { display: inline-flex; align-items: center; gap: 2px; font-size: .71rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; line-height: 1.4; }
.kpi-delta.up   { background: rgba(34,197,94,.2);  color: #22c55e; }
.kpi-delta.down { background: rgba(239,68,68,.2);  color: #ef4444; }
.kpi-delta.flat { background: rgba(107,114,128,.2); color: #9ca3af; }
.kpi-delta-sub { font-size: .71rem; color: var(--muted); }
.kpi-card.growth .kpi-val { display: flex; align-items: baseline; gap: 5px; }
.kpi-card .arrow { font-size: 1.1rem; }

/* KPI accent colors (dark) */
.kpi-c-1 { --kpi-accent:#22c55e; --kpi-icon-bg:rgba(34,197,94,.12); }
.kpi-c-2 { --kpi-accent:#38bdf8; --kpi-icon-bg:rgba(56,189,248,.12); }
.kpi-c-3 { --kpi-accent:#a855f7; --kpi-icon-bg:rgba(168,85,247,.12); }
.kpi-c-4 { --kpi-accent:#f43f5e; --kpi-icon-bg:rgba(244,63,94,.12); }
.kpi-c-5 { --kpi-accent:#f59e0b; --kpi-icon-bg:rgba(245,158,11,.12); }
.kpi-c-6 { --kpi-accent:#14b8a6; --kpi-icon-bg:rgba(20,184,166,.12); }

.delta-chip { display: inline-block; font-size: .68rem; font-weight: 700; padding: 2px 6px; border-radius: 999px; margin-left: 4px; }
.delta-chip.up   { background: rgba(22,163,74,.2);  color: #16a34a; }
.delta-chip.down { background: rgba(220,38,38,.2);  color: #dc2626; }
.delta-chip.flat { background: rgba(107,114,128,.2); color: #4b5563; }
.kpi-sparkline { position: absolute; right: 10px; bottom: 10px; width: 88px; height: 48px; pointer-events: none; opacity: .85; }

/* ── Chart card (dark) ── */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px 20px; box-shadow: var(--shadow-2); transition: box-shadow .2s, transform .2s; }
.card:hover { box-shadow: var(--shadow-hi); transform: translateY(-1px); }
.card h3 { font-family: "Space Grotesk"; font-size: .95rem; font-weight: 700; letter-spacing: -.01em; }
.card .sub { color: var(--muted); font-size: .74rem; margin: 3px 0 14px; }
.card .chart-wrap { position: relative; height: 280px; }
.card.full .chart-wrap { height: 320px; }
.card-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.card-hdr h3 { flex: 1; min-width: 0; }

/* ── Donut chart (dark) ── */
.donut-wrap { display: flex !important; align-items: center; gap: 20px; overflow: visible; }
.donut-wrap > canvas { flex: 0 0 auto; max-width: 200px; }
.donut-legend { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 11px; max-height: 280px; overflow-y: auto; }
.donut-legend-item { display: flex; flex-direction: column; gap: 3px; }
.donut-legend-row { display: flex; align-items: center; gap: 7px; }
.donut-legend-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.donut-legend-name { flex: 1; font-size: .83rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.donut-legend-pct { font-size: .83rem; font-weight: 700; color: var(--text); flex-shrink: 0; }
.donut-legend-val { font-size: .74rem; color: var(--muted); padding-left: 16px; }
.donut-legend-bar-bg { height: 3px; background: var(--surface-2); border-radius: 99px; overflow: hidden; margin-top: 2px; }
.donut-legend-bar-fill { height: 100%; border-radius: 99px; }

/* ── Data table ── */
.card.data-table .chart-wrap { height: auto; max-height: 400px; overflow-y: auto; padding-right: 4px; }
.data-table table { width: 100%; border-collapse: collapse; font-size: .86rem; }
.data-table th { text-align: left; font-weight: 600; color: var(--muted); text-transform: uppercase; font-size: .66rem; letter-spacing: .1em; padding: 8px 10px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); }
.data-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); }
.data-table td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: "Space Grotesk"; font-weight: 500; }
.data-table tr:last-child td { border-bottom: none; }
.data-table .bar { display: inline-block; height: 6px; background: rgba(34,197,94,.15); border-radius: 3px; position: relative; width: 80px; overflow: hidden; vertical-align: middle; margin-right: 8px; }
.data-table .bar > span { position: absolute; top: 0; left: 0; bottom: 0; background: #22c55e; border-radius: 3px; }
.data-table tbody tr.row-hl td { background: rgba(34,197,94,.09) !important; }
.data-table td.cell-high { color: #4ade80; font-weight: 600; }
.data-table td.cell-low  { color: #f87171; font-weight: 600; }
.heat-cell { display: inline-block; padding: 2px 8px; border-radius: 4px; font-variant-numeric: tabular-nums; margin-left: 4px; }

/* ── Summary ── */
.summary { background: linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%); border: 1px solid var(--border); border-left: 3px solid #22c55e; border-radius: var(--radius); padding: 18px 24px; box-shadow: var(--shadow-2); }
.summary p, .summary li { color: var(--text); font-size: .95rem; }
.summary ul { list-style: none; padding: 0; }
.summary li { padding: 6px 0 6px 18px; position: relative; }
.summary li::before { content: ""; position: absolute; left: 0; top: 14px; width: 6px; height: 6px; border-radius: 50%; background: #22c55e; }
.summary.unavailable { border-left-color: var(--muted); }
.summary.unavailable p { color: var(--muted); }

/* ── Anomalies ── */
.anomaly-list { display: grid; gap: 8px; }
.anomaly { background: var(--surface-2); border: 1px solid var(--border); border-left: 3px solid var(--warn); border-radius: 8px; padding: 10px 14px; font-size: .88rem; }
.anomaly.spike { border-left-color: #22c55e; } .anomaly.dip { border-left-color: var(--danger); }

/* ── Collapsibles ── */
details.log { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
details.log > summary { padding: 12px 22px; cursor: pointer; font-weight: 500; user-select: none; list-style: none; display: flex; justify-content: space-between; align-items: center; }
details.log > summary::after { content: "▾"; color: var(--muted); transition: transform .2s; }
details.log[open] > summary::after { transform: rotate(180deg); }
details.log > summary::-webkit-details-marker { display: none; }
details.log .body { padding: 0 22px 16px; }
.log-line { display: flex; gap: 12px; padding: 6px 0; border-top: 1px solid var(--border); font-size: .84rem; align-items: flex-start; }
.log-line:first-child { border-top: none; }
.log-badge { flex: 0 0 auto; font-size: .64rem; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; margin-top: 1px; }
.log-badge.info    { background: rgba(56,189,248,.15); color: #38bdf8; }
.log-badge.warning { background: var(--warn-dim); color: var(--warn); }
.log-badge.error   { background: var(--danger-dim); color: var(--danger); }
.log-badge.skipped { background: var(--warn-dim); color: var(--warn); }
.log-msg { flex: 1; color: var(--muted); }
.log-msg strong { color: var(--text); font-weight: 500; }

/* ── Footer ── */
footer { margin-top: 40px; padding-top: 18px; border-top: 1px solid var(--border); color: var(--muted); font-size: .76rem; }
.footer-inner { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; justify-content: center; }
.footer-sep { opacity: .4; }
footer a { color: var(--muted); }
footer strong { color: var(--text); }

/* ── Expand button (dark) ── */
.expand-btn { flex-shrink: 0; background: transparent; border: 1px solid var(--border); color: var(--muted); font-size: .78rem; line-height: 1; padding: 4px 8px; border-radius: 6px; cursor: pointer; transition: background .12s, color .12s; margin-top: 1px; }
.expand-btn:hover { background: var(--surface-hi); color: var(--text); }

/* ── Fullscreen ── */
.fa-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.75); z-index: 999; backdrop-filter: blur(3px); }
.fa-backdrop.fa-backdrop-show { display: block; }
.card.fa-fullscreen { position: fixed !important; inset: 28px !important; z-index: 1000; overflow: auto; max-height: none !important; }
.card.fa-fullscreen .chart-wrap { height: calc(100vh - 180px) !important; }

/* ── Table controls ── */
.tbl-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 6px 0 10px; }
.tbl-search { flex: 1 1 160px; max-width: 280px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); font: .8rem "Inter"; padding: 5px 10px; border-radius: 6px; outline: none; }
.tbl-search::placeholder { color: var(--muted); }
.tbl-search:focus { border-color: #22c55e; }
.tbl-count { flex: 1; color: var(--muted); font-size: .74rem; white-space: nowrap; }
.tbl-export-btn { flex-shrink: 0; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); font: 500 .76rem "Inter"; padding: 5px 10px; border-radius: 6px; cursor: pointer; white-space: nowrap; transition: background .15s; }
.tbl-export-btn:hover { background: var(--surface-hi); }

/* ── Sort indicators ── */
thead th.sortable { cursor: pointer; user-select: none; }
thead th.sortable:hover { color: var(--text); }
thead th.sortable::after { content: " ⇅"; opacity: .3; font-size: .6rem; }
thead th.sortable[data-sort-dir="asc"]::after  { content: " ↑"; opacity: 1; color: #22c55e; }
thead th.sortable[data-sort-dir="desc"]::after { content: " ↓"; opacity: 1; color: #22c55e; }

/* ── Toasts ── */
.fa-toast-area { position: fixed; bottom: 24px; right: 24px; z-index: 2000; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.fa-toast { background: #22c55e; color: #0a0d12; font: 600 .82rem "Inter"; padding: 9px 18px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,.5); opacity: 0; transform: translateY(8px); transition: opacity .25s, transform .25s; }
.fa-toast.fa-toast-show { opacity: 1; transform: translateY(0); }

/* (kpi-sparkline is defined above with kpi-card rules) */

/* ── Print (PDF export via window.print) ── */
@media print {
  @page { size: A4 landscape; margin: 14mm; }
  body { padding: 0; background: white; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .filter-bar, .tabs, .hdr-btn { display: none !important; }
  .page-panel[style*="none"] { display: block !important; page-break-before: always; }
  .page-panel:first-of-type { page-break-before: auto; }
  .kpi-pastel { box-shadow: none; page-break-inside: avoid; }
  .card { box-shadow: none; border: 1px solid #ddd; page-break-inside: avoid; background: white !important; }
  .card h3 { color: #111 !important; }
  /* Chart.js canvases are transparent by default — force a white bg so print
     rasterization captures the drawing (otherwise PDF pages show empty boxes). */
  .chart-wrap { break-inside: avoid; background: white; }
  canvas { background: white !important; }
  .hdr h1, .kpi-pastel .value, .kpi-pastel .label { color: #111 !important; }
  .summary { background: white; border-color: #ddd; }
  .summary p, .summary li { color: #111; }
  footer { color: #666; }
}
`

// ── Executive theme — clean boardroom look matching reference screenshots ────
export const EXEC_CSS = `
:root {
  --bg: #f0f4f9;
  --surface: #ffffff;
  --surface-2: #f0f4fa;
  --surface-hi: #e6ecf5;
  --border: #dde3ee;
  --text: #0f1e3a;
  --muted: #64748b;
  --dim: #94a3b8;
  --danger: #dc2626;
  --danger-dim: rgba(220,38,38,.12);
  --warn:   #d97706;
  --warn-dim: rgba(217,119,6,.12);
  --shadow-1: 0 1px 2px rgba(15,30,58,.05);
  --shadow-2: 0 2px 8px -2px rgba(15,30,58,.08), 0 1px 3px rgba(15,30,58,.04);
  --shadow-hi: 0 12px 32px -8px rgba(15,30,58,.15);
  --radius: 12px;
  --brand: #1e40af;
  --brand-2: #2563eb;
  --brand-3: #3b82f6;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--text); font-family: "Inter", ui-sans-serif, system-ui, sans-serif; line-height: 1.5; -webkit-font-smoothing: antialiased; }
body { min-height: 100vh; padding: 20px clamp(12px, 3vw, 32px) 40px; }
a { color: var(--brand-2); text-decoration: none; } a:hover { text-decoration: underline; }
.page { max-width: 1400px; margin: 0 auto; }

/* ── Gradient header ── */
.hdr {
  background: linear-gradient(135deg, #0f2952 0%, #1a4fad 55%, #2563eb 100%);
  border-radius: var(--radius);
  padding: 20px 28px;
  margin-bottom: 20px;
  display: flex; flex-wrap: wrap; gap: 16px;
  align-items: center; justify-content: space-between;
  border: none;
}
.hdr-inner { display: contents; }
.hdr-left { display: flex; align-items: center; gap: 14px; }
.hdr-logo {
  width: 44px; height: 44px; flex-shrink: 0;
  background: rgba(255,255,255,.15);
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}
.hdr h1 {
  font-family: "Space Grotesk", "Inter", sans-serif;
  font-size: clamp(1.1rem, 2.2vw, 1.6rem);
  font-weight: 700; letter-spacing: -.02em; color: #fff;
}
.hdr-sub { color: rgba(255,255,255,.7); font-size: .82rem; margin-top: 3px; }
.hdr-right { display: flex; align-items: center; gap: 20px; flex-shrink: 0; }
.hdr-meta-block { text-align: center; }
.hdr-meta-label { display: block; font-size: .6rem; text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,.5); font-weight: 600; }
.hdr-meta-val { display: block; font-size: .95rem; font-weight: 700; color: #fff; margin-top: 3px; font-family: "Space Grotesk"; }
.hdr-live-badge {
  display: flex; align-items: center; gap: 7px;
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.22);
  color: #fff; font-size: .76rem; font-weight: 500;
  padding: 7px 14px; border-radius: 999px; white-space: nowrap;
}
.hdr-live-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #4ade80; box-shadow: 0 0 6px #4ade80;
  animation: fa-pulse 2s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes fa-pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
.hdr-actions { display: none; }
.hdr-btn { display: none; }

/* ── Filter bar ── */
.filter-bar {
  position: sticky; top: 0; z-index: 10;
  background: rgba(255,255,255,.97); backdrop-filter: blur(10px);
  border: 1px solid var(--border); border-radius: var(--radius);
  padding: 14px 20px 12px; margin-bottom: 20px; box-shadow: var(--shadow-2);
}
.filter-bar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.filter-bar-title { font-size: .82rem; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; }
.filter-funnel { color: var(--brand-2); font-size: 1rem; }
.filter-bar-badge {
  background: var(--surface-2); border: 1px solid var(--border);
  color: var(--text); font-size: .72rem; font-weight: 600;
  padding: 2px 9px; border-radius: 999px;
}
.filter-reset-btn {
  background: transparent; border: 1px solid var(--border);
  color: var(--muted); font: .76rem "Inter"; padding: 5px 13px;
  border-radius: 6px; cursor: pointer; transition: background .12s, color .12s;
}
.filter-reset-btn:hover { background: var(--surface-2); color: var(--text); }
.filter-bar-body { display: flex; flex-wrap: wrap; gap: 12px 18px; }
.filter { display: flex; flex-direction: column; gap: 5px; }
.filter-title { font-size: .6rem; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); font-weight: 700; }
.filter-select {
  background: var(--surface); border: 1px solid var(--border); color: var(--text);
  font: .82rem "Inter"; padding: 7px 30px 7px 10px;
  border-radius: 8px; outline: none; cursor: pointer;
  appearance: none; -webkit-appearance: none; min-width: 140px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center;
  transition: border-color .12s;
}
.filter-select:focus { border-color: var(--brand-2); box-shadow: 0 0 0 3px rgba(37,99,235,.08); }
.filter-range { display: flex; align-items: center; gap: 8px; }
.filter-range input[type="date"] {
  background: var(--surface); border: 1px solid var(--border); color: var(--text);
  font: .82rem "Inter"; padding: 7px 8px; border-radius: 8px; outline: none;
  transition: border-color .12s;
}
.filter-range input[type="date"]:focus { border-color: var(--brand-2); }
.range-arrow { color: var(--muted); font-size: .9rem; }
.filter-status { margin-top: 10px; font-size: .76rem; color: var(--muted); border-top: 1px solid var(--border); padding-top: 8px; }
.period-presets { display: flex; gap: 5px; margin-top: 5px; }
.period-preset-btn { background: #f0f4fb; border: 1px solid var(--border); color: var(--muted); font: 600 .72rem "Inter"; padding: 3px 9px; border-radius: 6px; cursor: pointer; transition: background .15s, color .15s; }
.period-preset-btn:hover { background: #e4eaf5; color: var(--brand); }
.period-preset-btn.active { background: rgba(37,99,235,.1); border-color: var(--brand); color: var(--brand); }

/* ── Tabs ── */
.tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
.tab { background: transparent; color: var(--muted); border: none; font: 600 .82rem "Inter"; padding: 8px 18px; cursor: pointer; border-bottom: 2px solid transparent; letter-spacing: .01em; transition: color .12s; }
.tab:hover { color: var(--brand); }
.tab.active { color: var(--brand); border-bottom-color: var(--brand); }

/* ── Grid ── */
.section { margin-bottom: 20px; }
.section > h2 { font-family: "Space Grotesk"; font-size: .74rem; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
.tile { grid-column: span 12; }
.tile.hero { grid-column: span 3; }
.tile.half { grid-column: span 6; }
.tile.third { grid-column: span 4; }
.tile.full { grid-column: span 12; }
@media (max-width: 1100px) { .tile.hero { grid-column: span 6; } .tile.third { grid-column: span 6; } }
@media (max-width: 700px) { .tile.hero, .tile.third, .tile.half { grid-column: span 12; } }

/* ── KPI card (white + colored left border) ── */
.kpi-card {
  background: white; border-radius: var(--radius);
  border: 1px solid var(--border);
  border-left: 4px solid var(--kpi-accent, #3b82f6);
  padding: 18px 18px 16px; min-height: 130px;
  box-shadow: var(--shadow-2);
  position: relative; overflow: hidden;
  display: flex; flex-direction: column; justify-content: space-between;
  transition: box-shadow .2s, transform .2s; cursor: pointer;
}
.kpi-card:hover { box-shadow: var(--shadow-hi); transform: translateY(-2px); }

.kpi-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.kpi-label { font-size: .63rem; font-weight: 700; letter-spacing: .09em; color: var(--muted); text-transform: uppercase; line-height: 1.3; }
.kpi-icon {
  width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
  background: var(--kpi-icon-bg, rgba(59,130,246,.1));
  color: var(--kpi-accent, #3b82f6);
  display: flex; align-items: center; justify-content: center;
}
.kpi-val {
  font-family: "Space Grotesk";
  font-size: clamp(1.4rem, 2.8vw, 2.1rem);
  font-weight: 700; letter-spacing: -.03em; color: #0f1e3a;
  margin: 10px 0 6px; line-height: 1.1;
}
.kpi-delta-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; min-height: 22px; }
.kpi-delta {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: .71rem; font-weight: 700;
  padding: 2px 8px; border-radius: 999px; line-height: 1.4;
}
.kpi-delta.up   { background: rgba(22,163,74,.12);  color: #15803d; }
.kpi-delta.down { background: rgba(220,38,38,.12);  color: #b91c1c; }
.kpi-delta.flat { background: rgba(107,114,128,.12); color: #6b7280; }
.kpi-delta-sub { font-size: .71rem; color: var(--dim); }

/* KPI accent colors */
.kpi-c-1 { --kpi-accent:#3b82f6; --kpi-icon-bg:rgba(59,130,246,.1); }
.kpi-c-2 { --kpi-accent:#06b6d4; --kpi-icon-bg:rgba(6,182,212,.1); }
.kpi-c-3 { --kpi-accent:#8b5cf6; --kpi-icon-bg:rgba(139,92,246,.1); }
.kpi-c-4 { --kpi-accent:#ec4899; --kpi-icon-bg:rgba(236,72,153,.1); }
.kpi-c-5 { --kpi-accent:#f59e0b; --kpi-icon-bg:rgba(245,158,11,.1); }
.kpi-c-6 { --kpi-accent:#10b981; --kpi-icon-bg:rgba(16,185,129,.1); }

/* Growth / ratio tiles reuse kpi-card layout */
.kpi-card.growth .kpi-val { display: flex; align-items: baseline; gap: 5px; }
.kpi-card .arrow { font-size: 1.1rem; }
.delta-chip { display: inline-block; font-size: .68rem; font-weight: 700; padding: 2px 6px; border-radius: 999px; margin-left: 4px; }
.delta-chip.up   { background: rgba(5,150,105,.15);  color: #059669; }
.delta-chip.down { background: rgba(220,38,38,.15);  color: var(--danger); }
.delta-chip.flat { background: rgba(107,114,128,.15); color: #4b5563; }

/* Sparkline: bottom-right corner of KPI card */
.kpi-sparkline { position: absolute; right: 10px; bottom: 10px; width: 88px; height: 48px; pointer-events: none; opacity: .85; }

/* ── Chart card ── */
.card { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px 20px; box-shadow: var(--shadow-2); transition: box-shadow .2s, transform .2s; }
.card:hover { box-shadow: var(--shadow-hi); transform: translateY(-1px); }
.card h3 { font-family: "Space Grotesk"; font-size: .95rem; font-weight: 700; letter-spacing: -.01em; color: #0f1e3a; }
.card .sub { color: var(--muted); font-size: .74rem; margin: 3px 0 14px; }
.card .chart-wrap { position: relative; height: 280px; }
.card.full .chart-wrap { height: 320px; }

/* ── Donut chart: canvas + HTML legend side-by-side ── */
.donut-wrap { display: flex !important; align-items: center; gap: 20px; overflow: visible; }
.donut-wrap > canvas { flex: 0 0 auto; max-width: 200px; }
.donut-legend { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 11px; max-height: 280px; overflow-y: auto; padding-right: 2px; }
.donut-legend-item { display: flex; flex-direction: column; gap: 3px; }
.donut-legend-row { display: flex; align-items: center; gap: 7px; }
.donut-legend-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.donut-legend-name { flex: 1; font-size: .83rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.donut-legend-pct { font-size: .83rem; font-weight: 700; color: var(--text); flex-shrink: 0; }
.donut-legend-val { font-size: .74rem; color: var(--muted); padding-left: 16px; }
.donut-legend-bar-bg { height: 3px; background: var(--surface-2); border-radius: 99px; overflow: hidden; margin-top: 2px; }
.donut-legend-bar-fill { height: 100%; border-radius: 99px; }

/* ── Card header ── */
.card-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.card-hdr h3 { flex: 1; min-width: 0; }
.expand-btn {
  flex-shrink: 0; background: transparent;
  border: 1px solid var(--border); color: var(--muted);
  font-size: .78rem; line-height: 1; padding: 4px 8px;
  border-radius: 6px; cursor: pointer; transition: background .12s, color .12s; margin-top: 1px;
}
.expand-btn:hover { background: var(--surface-2); color: var(--brand); }

/* ── Data table ── */
.card.data-table .chart-wrap { height: auto; max-height: 420px; overflow-y: auto; padding-right: 4px; }
.data-table table { width: 100%; border-collapse: collapse; font-size: .85rem; }
.data-table th { text-align: left; font-weight: 700; color: var(--brand-2); text-transform: uppercase; font-size: .63rem; letter-spacing: .1em; padding: 9px 10px; border-bottom: 2px solid var(--border); position: sticky; top: 0; background: white; }
.data-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); color: var(--text); }
.data-table tr:hover td { background: #f8faff; }
.data-table td.num { text-align: right; font-variant-numeric: tabular-nums; font-family: "Space Grotesk"; font-weight: 500; }
.data-table tr:last-child td { border-bottom: none; }
.data-table .bar { display: inline-block; height: 6px; background: rgba(30,64,175,.1); border-radius: 3px; position: relative; width: 80px; overflow: hidden; vertical-align: middle; margin-right: 8px; }
.data-table .bar > span { position: absolute; top: 0; left: 0; bottom: 0; background: var(--brand-2); border-radius: 3px; }
.data-table tbody tr.row-hl td { background: rgba(37,99,235,.07) !important; }
.data-table td.cell-high { color: #15803d; font-weight: 600; }
.data-table td.cell-low  { color: #b91c1c; font-weight: 600; }
.heat-cell { display: inline-block; padding: 2px 8px; border-radius: 4px; font-variant-numeric: tabular-nums; margin-left: 4px; }

/* Table controls */
.tbl-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 6px 0 10px; }
.tbl-search { flex: 1 1 160px; max-width: 320px; background: white; border: 1px solid var(--border); color: var(--text); font: .82rem "Inter"; padding: 6px 12px; border-radius: 8px; outline: none; }
.tbl-search::placeholder { color: var(--muted); }
.tbl-search:focus { border-color: var(--brand-2); box-shadow: 0 0 0 3px rgba(37,99,235,.08); }
.tbl-count { flex: 1; color: var(--muted); font-size: .74rem; white-space: nowrap; }
.tbl-export-btn { flex-shrink: 0; background: white; border: 1px solid var(--border); color: var(--text); font: 500 .75rem "Inter"; padding: 6px 12px; border-radius: 7px; cursor: pointer; white-space: nowrap; transition: background .12s; }
.tbl-export-btn:hover { background: var(--surface-2); }

/* Sortable headers */
thead th.sortable { cursor: pointer; user-select: none; }
thead th.sortable:hover { color: var(--brand); }
thead th.sortable::after { content: " ⇅"; opacity: .3; font-size: .58rem; }
thead th.sortable[data-sort-dir="asc"]::after  { content: " ↑"; opacity: 1; color: var(--brand-2); }
thead th.sortable[data-sort-dir="desc"]::after { content: " ↓"; opacity: 1; color: var(--brand-2); }

/* ── Executive Insights ── */
.insights-card {
  background: white; border: 1px solid var(--border); border-radius: var(--radius);
  padding: 20px 24px; box-shadow: var(--shadow-2); margin-bottom: 20px;
}
.insights-hdr { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
.insights-hdr h3 { font-family: "Space Grotesk"; font-size: .95rem; font-weight: 700; color: #0f1e3a; }
.insights-sub { font-size: .74rem; color: var(--muted); }
.insights-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
.insights-list li { display: flex; align-items: flex-start; gap: 12px; font-size: .87rem; line-height: 1.55; color: var(--text); }
.insight-icon { flex-shrink: 0; width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 700; }
.insights-list li strong { font-weight: 600; color: #0f1e3a; }

/* ── Summary ── */
.summary { background: linear-gradient(135deg,white 0%,var(--surface-2) 100%); border: 1px solid var(--border); border-left: 3px solid var(--brand); border-radius: var(--radius); padding: 18px 24px; box-shadow: var(--shadow-2); }
.summary p, .summary li { color: var(--text); font-size: .92rem; }
.summary ul { list-style: none; padding: 0; }
.summary li { padding: 5px 0 5px 18px; position: relative; }
.summary li::before { content: ""; position: absolute; left: 0; top: 13px; width: 6px; height: 6px; border-radius: 50%; background: var(--brand); }
.summary.unavailable { border-left-color: var(--muted); } .summary.unavailable p { color: var(--muted); }

/* ── Anomalies ── */
.anomaly-list { display: grid; gap: 8px; }
.anomaly { background: white; border: 1px solid var(--border); border-left: 3px solid var(--warn); border-radius: 8px; padding: 10px 14px; font-size: .87rem; }
.anomaly.spike { border-left-color: #059669; } .anomaly.dip { border-left-color: var(--danger); }

/* ── Collapsibles ── */
details.log { background: white; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
details.log > summary { padding: 12px 22px; cursor: pointer; font-weight: 500; user-select: none; list-style: none; display: flex; justify-content: space-between; align-items: center; color: var(--text); font-size: .85rem; }
details.log > summary::after { content: "▾"; color: var(--muted); transition: transform .2s; }
details.log[open] > summary::after { transform: rotate(180deg); }
details.log > summary::-webkit-details-marker { display: none; }
details.log .body { padding: 0 22px 16px; }
.log-line { display: flex; gap: 12px; padding: 6px 0; border-top: 1px solid var(--border); font-size: .83rem; align-items: flex-start; }
.log-line:first-child { border-top: none; }
.log-badge { flex: 0 0 auto; font-size: .62rem; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; margin-top: 1px; }
.log-badge.info    { background: rgba(37,99,235,.1);  color: var(--brand-2); }
.log-badge.warning { background: var(--warn-dim);     color: var(--warn); }
.log-badge.error   { background: var(--danger-dim);   color: var(--danger); }
.log-badge.skipped { background: var(--warn-dim);     color: var(--warn); }
.log-msg { flex: 1; color: var(--muted); } .log-msg strong { color: var(--text); font-weight: 500; }

/* ── Footer ── */
footer { margin-top: 40px; padding-top: 18px; border-top: 1px solid var(--border); color: var(--muted); font-size: .74rem; }
.footer-inner { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; justify-content: center; }
.footer-sep { opacity: .4; }
footer a { color: var(--brand-2); }
footer strong { color: var(--brand); }

/* ── Fullscreen / backdrop ── */
.fa-backdrop { display: none; position: fixed; inset: 0; background: rgba(15,30,58,.6); z-index: 999; backdrop-filter: blur(3px); }
.fa-backdrop.fa-backdrop-show { display: block; }
.card.fa-fullscreen { position: fixed !important; inset: 28px !important; z-index: 1000; overflow: auto; max-height: none !important; }
.card.fa-fullscreen .chart-wrap { height: calc(100vh - 180px) !important; }

/* ── Toasts ── */
.fa-toast-area { position: fixed; bottom: 24px; right: 24px; z-index: 2000; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.fa-toast { background: var(--brand); color: white; font: 600 .82rem "Inter"; padding: 9px 18px; border-radius: 8px; box-shadow: 0 4px 20px rgba(15,30,58,.25); opacity: 0; transform: translateY(8px); transition: opacity .25s, transform .25s; }
.fa-toast.fa-toast-show { opacity: 1; transform: translateY(0); }

/* ── Print ── */
@media print {
  @page { size: A4 landscape; margin: 14mm; }
  body { padding: 0; background: white; }
  .filter-bar, .tabs { display: none !important; }
  .hdr { border-radius: 0; }
  .page-panel[style*="none"] { display: block !important; page-break-before: always; }
  .page-panel:first-of-type { page-break-before: auto; }
  .kpi-card { box-shadow: none; page-break-inside: avoid; }
  .card { box-shadow: none; page-break-inside: avoid; }
  .chart-wrap { break-inside: avoid; background: white; }
  canvas { background: white !important; }
}
`

