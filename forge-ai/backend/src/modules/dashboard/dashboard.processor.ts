// Async job that runs the full dashboard pipeline. Source-agnostic — it
// dispatches to a SourceAdapter based on repo.dashboardSource.kind, so the
// same processor handles uploads, Google Sheets, Stripe, and future
// connectors without any special-casing.

import fs from 'fs'
import path from 'path'
import { Task } from '../tasks/task.model'
import { Repository } from '../repository/repository.model'
import { emitTaskUpdate } from '../websocket'
import { createProvider, resolveProvider, geminiKey } from '../ai/ai.factory'
import type { Job } from '../../lib/workers'
import { buildSchemaReport } from './profile/schemaReport'
import { cleanTable, type CleaningConfig } from './clean'
import { computeMetrics, type MetricsConfig } from './metrics'
import { renderDashboardToDisk } from './render'
import { getAdapter, buildSourceContext } from './sources'
import { getVertical } from './verticals'

const REPOS_DIR = process.env.REPOS_DIR ?? path.join(process.cwd(), 'repos')

interface JobData {
  taskId: string
  repositoryId: string
  userId: string
  dashboardName: string
  /** Where the raw upload lives (only when source kind is 'upload'). Copied
   *  into repo.dashboardSource.config already; we pass it here so the very
   *  first build can find it before that config is persisted. */
  uploadPath?: string
  originalFilename?: string
  mimeType?: string
  cleaningConfig?: CleaningConfig
  metricsConfig?: MetricsConfig
}

export async function processDashboardBuild(job: Job) {
  const {
    taskId, repositoryId, userId, dashboardName,
    cleaningConfig, metricsConfig,
  } = job.data as JobData

  const task = await Task.findById(taskId)
  const repo = await Repository.findById(repositoryId)
  if (!task || !repo) {
    console.error('[dashboard/build] missing task or repository', { taskId, repositoryId })
    return
  }

  const log = async (message: string, level: 'info' | 'warn' | 'error' = 'info', extras: Record<string, any> = {}) => {
    Object.assign(task, extras)
    task.logs.push({ level, message, timestamp: new Date() } as any)
    await task.save()
    emitTaskUpdate(taskId, task.toObject())
  }

  const fail = async (message: string) => {
    repo.status = 'error'
    repo.errorMessage = message
    await repo.save()
    task.status = 'failed'
    task.error = message
    await task.save()
    emitTaskUpdate(taskId, task.toObject())
  }

  try {
    await log(`📊 Building dashboard "${dashboardName}"`, 'info', { status: 'running', progress: 5 })

    if (!repo.dashboardSource) return await fail('Repository is missing dashboardSource — nothing to fetch.')
    const adapter = getAdapter(repo.dashboardSource.kind)
    const ctx = await buildSourceContext(userId)

    // ── Stage 1: source fetch ──
    await log(`📥 Fetching from ${adapter.kind}…`, 'info', { progress: 15 })
    const table = await adapter.fetch(repo.dashboardSource.config, ctx)
    await log(`✅ Fetched ${table.rows.length} row(s) across ${table.headers.length} column(s)`)

    // ── Stage 2: profile ──
    await log(`🔎 Profiling columns`, 'info', { progress: 30 })
    const schema = buildSchemaReport(table)
    if (schema.openQuestions.length) {
      await log(`❓ ${schema.openQuestions.length} open question(s) — see schema report`, 'warn')
    }

    // ── Stage 3: clean ──
    await log('🧹 Cleaning (normalizing dates, coercing numbers, deduping)…', 'info', { progress: 50 })
    const cleaning = cleanTable(table, schema, cleaningConfig ?? {})
    await log(`✅ Cleaned: ${cleaning.stats.rowsIn} → ${cleaning.stats.rowsOut} rows, ${cleaning.stats.duplicatesRemoved} duplicates removed, ${cleaning.stats.warnings} warning(s), ${cleaning.stats.errors} error(s)`)
    for (const line of cleaning.humanChangelog) await log(line, cleaning.stats.errors > 0 ? 'warn' : 'info')

    // ── Stage 4: metrics ──
    await log('📈 Computing metrics + generating summary…', 'info', { progress: 70 })
    let provider = null
    try {
      const name = resolveProvider(process.env.DEFAULT_AI_PROVIDER ?? (geminiKey() ? 'gemini' : 'github'))
      provider = createProvider(name)
    } catch { /* summary skipped */ }
    // Pass the persisted user prompt + vertical into the planner so the
    // metric selection reflects both the client's stated intent and the
    // dashboard type they picked (Sales / Support / etc.).
    const vertical = getVertical(repo.dashboardSource.vertical)
    const metrics = await computeMetrics(schema, cleaning, provider, {
      ...(metricsConfig ?? {}),
      userPrompt: repo.dashboardSource.userPrompt ?? metricsConfig?.userPrompt,
      verticalHint: vertical.plannerHint || undefined,
    })
    if (metrics.summary.text) await log('✍️  Generated AI summary')
    else if (metrics.summary.error) await log(`ℹ️  Summary skipped (${metrics.summary.error})`, 'warn')

    // ── Stage 5: render ──
    const destDir = path.join(REPOS_DIR, userId, dashboardName)
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
    fs.mkdirSync(destDir, { recursive: true })
    await log(`🎨 Rendering dashboard files`, 'info', { progress: 85 })
    // Theme: explicit user theme wins; else the vertical's suggestion; else dark.
    const theme = (repo.dashboardSource.theme ?? vertical.suggestedTheme ?? 'dark') as 'dark' | 'exec'
    const rendered = renderDashboardToDisk({ destDir, dashboardName, schema, cleaning, metrics, theme, vertical: vertical.kind })

    task.changes = rendered.relativeNames.map((rel) => {
      const raw = fs.readFileSync(path.join(destDir, rel), 'utf-8')
      return {
        path: rel, before: '', after: raw.slice(0, 200_000),
        additions: raw.split('\n').length, deletions: 0,
      }
    })

    // ── Wrap up ──
    repo.localPath = destDir
    repo.status = 'ready'
    repo.dashboardSource.lastRefreshAt = new Date()
    repo.dashboardSource.lastBuild = {
      rowsIn: cleaning.stats.rowsIn,
      rowsOut: cleaning.stats.rowsOut,
      warnings: cleaning.stats.warnings,
      errors: cleaning.stats.errors,
      at: new Date(),
    }
    await repo.save()

    task.summary = metrics.summary.text
      ? `Dashboard ready — ${metrics.metrics.filter((m) => m.value).length} metric(s), ${metrics.anomalies.length} anomaly/anomalies detected.`
      : `Dashboard ready — ${metrics.metrics.filter((m) => m.value).length} metric(s). AI summary unavailable.`
    task.status = 'completed'
    task.progress = 100
    await task.save()
    emitTaskUpdate(taskId, task.toObject())
    await log(`✅ ${task.summary}`, 'info')

    // For 'upload' sources: the staged upload is one-time — the persisted
    // `config.uploadPath` still lets a manual refresh re-run against the same
    // buffer, but scheduled refreshes for uploads are meaningless (nothing
    // changes), so we DON'T delete the file here — leave it for manual re-runs.
  } catch (err: any) {
    console.error('[dashboard/build] failed:', err)
    await fail(err?.message ?? 'Dashboard build failed')
  }
}
