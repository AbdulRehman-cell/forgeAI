import fs from 'fs'
import path from 'path'
import type { SchemaReport } from '../profile/schemaReport'
import type { CleaningResult } from '../clean'
import type { MetricsResult } from '../metrics'
import { renderDashboardHtml } from './template'
import { dashboardCss } from './styles'
import { CHARTS_JS } from './charts'
import { renderYaml, vercelJson, dockerfile, nginxConf } from './deployScaffolding'

// Resolve chart.js UMD bundle once at startup — used by every dashboard build
// so charts always render offline without any CDN dependency.
let _chartJsBundle: string | undefined
function getChartJsBundle(): string | null {
  if (_chartJsBundle !== undefined) return _chartJsBundle || null
  const candidates: string[] = [
    // __dirname-relative: 5 dirs up from render/ lands in forge-ai/ (monorepo root)
    path.resolve(__dirname, '../../../../../node_modules/chart.js/dist/chart.umd.js'),
  ]
  try {
    candidates.unshift(require.resolve('chart.js/dist/chart.umd.js'))
  } catch { /* not in PATH — rely on the relative fallback */ }
  for (const p of candidates) {
    try {
      _chartJsBundle = fs.readFileSync(p, 'utf-8')
      return _chartJsBundle
    } catch { /* try next */ }
  }
  _chartJsBundle = ''
  return null
}

/**
 * Emit the dashboard as a static site into destDir. Files are deterministic
 * so a scheduled refresh (Milestone 7) can meaningfully diff two builds and
 * skip redeploy when nothing changed.
 *
 * Reuses the website builder's REPOS_DIR convention + deploy scaffolding, so
 * the existing lib/deployers path can host a dashboard exactly like a site.
 */
export interface DashboardFiles {
  /** Absolute paths of files written */
  files: string[]
  /** Just the relative filenames (for logging / task changes) */
  relativeNames: string[]
  /** The rendered HTML (also written to disk, returned for preview) */
  html: string
}

export interface RenderOptions {
  destDir: string
  dashboardName: string
  schema: SchemaReport
  cleaning: CleaningResult
  metrics: MetricsResult
  /** 'dark' (default) or 'exec' (blue-and-white). */
  theme?: 'dark' | 'exec'
  /** Dashboard vertical — enables per-vertical accent colors and section labels. */
  vertical?: string
}

export function renderDashboardToDisk(opts: RenderOptions): DashboardFiles {
  fs.mkdirSync(opts.destDir, { recursive: true })

  const currencyByColumn = new Map(
    opts.cleaning.currencyDecisions.map((d) => [d.column, d.resolvedIso]),
  )

  const resolvedTheme = opts.theme ?? 'dark'
  const themeCss = dashboardCss(resolvedTheme)
  const html = renderDashboardHtml({
    dashboardName: opts.dashboardName,
    schema: opts.schema,
    cleaning: opts.cleaning,
    metrics: opts.metrics,
    currencyByColumn,
    styles: themeCss,
    charts: CHARTS_JS,
    vertical: opts.vertical,
    baseTheme: resolvedTheme,
  })

  const chartBundle = getChartJsBundle()
  // Prepend the chart.js UMD bundle so dashboard.js is self-contained —
  // no separate script tag, no MIME-type or 404 issues.
  const dashboardJs = chartBundle ? chartBundle + '\n' + CHARTS_JS : CHARTS_JS

  const written: [string, string][] = [
    ['index.html',    html],
    ['styles.css',    themeCss],
    ['dashboard.js',  dashboardJs],
    ['render.yaml',   renderYaml(opts.dashboardName)],
    ['vercel.json',   vercelJson()],
    ['Dockerfile',    dockerfile()],
    ['nginx.conf',    nginxConf()],
    // Persist the underlying data so operators / a scheduled refresh can
    // rebuild without re-uploading the source file. Client browsers never
    // fetch this — it lives alongside the site for the deploy pipeline.
    ['dashboard-metadata.json', JSON.stringify({
      generatedAt: new Date().toISOString(),
      schema: opts.schema,
      cleaning: {
        stats: opts.cleaning.stats,
        changelog: opts.cleaning.changelog,
        currencyDecisions: opts.cleaning.currencyDecisions,
      },
      metrics: opts.metrics,
    }, null, 2)],
  ]

  const filePaths: string[] = []
  const relativeNames: string[] = []
  for (const [name, content] of written) {
    const abs = path.join(opts.destDir, name)
    fs.writeFileSync(abs, content, 'utf-8')
    filePaths.push(abs)
    relativeNames.push(name)
  }

  return { files: filePaths, relativeNames, html }
}
