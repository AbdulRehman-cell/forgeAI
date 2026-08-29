// Scheduled dashboard refresh. Uses node-cron in-process so we don't need a
// separate scheduler service — matches the philosophy of the existing
// in-process job queue.
//
// One master cron ticks every minute; on each tick we scan Repositories that
// have a `dashboardSource.refreshCron` set and figure out which are due
// SINCE their last refresh. Due dashboards get enqueued as build-dashboard
// jobs, which reuse the exact same pipeline path as manual builds. No
// duplication of the ingest→clean→metrics→render code.
//
// A dashboard is "due" when the previous nominal cron firing time is after
// `lastRefreshAt`. That way if the process was down when the exact firing
// minute passed, the next boot catches up on the missed run.

import cron from 'node-cron'
import { Repository } from '../../repository/repository.model'
import { Task } from '../../tasks/task.model'
import { enqueueJob } from '../../../lib/workers'

// A conservative upper bound on how often the scheduler ticks. Every 60s is
// plenty — hourly is the finest cron a client is likely to set.
const TICK_CRON = process.env.DASHBOARD_REFRESH_TICK_CRON ?? '* * * * *'

let started = false

export function startDashboardScheduler() {
  if (started) return
  if (process.env.DASHBOARD_SCHEDULER_ENABLED === 'false') {
    console.log('[dashboard/scheduler] disabled via DASHBOARD_SCHEDULER_ENABLED=false')
    return
  }
  cron.schedule(TICK_CRON, () => { sweep().catch((err) => console.error('[dashboard/scheduler] sweep failed:', err)) })
  started = true
  console.log(`[dashboard/scheduler] refresh ticker running (${TICK_CRON})`)
}

export function validateCron(expr: string): boolean {
  try { return cron.validate(expr) } catch { return false }
}

async function sweep() {
  const now = new Date()
  // Only dashboards with a cron set are candidates. Non-scheduled ones are
  // manual-refresh only.
  const candidates = await Repository.find({
    source: 'data',
    'dashboardSource.refreshCron': { $ne: null },
  }).lean()

  for (const r of candidates) {
    const expr = r.dashboardSource?.refreshCron
    if (!expr) continue
    if (!isDue(expr, r.dashboardSource?.lastRefreshAt ?? null, now)) continue

    // Cheap dedup: skip if there's a pending/running build_dashboard task on
    // this repo already — another sweep tick or a manual trigger got there
    // first.
    const inflight = await Task.exists({
      repositoryId: r._id, type: 'build_dashboard',
      status: { $in: ['pending', 'running'] },
    })
    if (inflight) continue

    const task = await Task.create({
      userId: r.userId, repositoryId: r._id, type: 'build_dashboard',
      status: 'pending',
      metadata: { dashboardName: r.name, trigger: 'scheduled', cron: expr, firedAt: now },
    })
    await enqueueJob('build-dashboard', {
      taskId: task._id.toString(), repositoryId: r._id.toString(),
      userId: r.userId.toString(), dashboardName: r.name,
    })
    console.log(`[dashboard/scheduler] enqueued refresh for "${r.name}" (${expr})`)
  }
}

/**
 * Returns true when the most recent nominal firing time of the cron is after
 * `lastRefreshAt` (or lastRefreshAt is missing entirely). Approach: walk
 * backwards a minute at a time up to a 24h window and check if the minute
 * matches. Coarse but correct for minute-granularity crons.
 *
 * Missing lastRefreshAt → treat as never run → due immediately (bounded by
 * "was the schedule set before now" — always true, so fires on next tick).
 */
function isDue(expr: string, lastRefreshAt: Date | null, now: Date): boolean {
  const cronMatches = cronMatchesMinute(expr, now)
  if (!lastRefreshAt) return cronMatches
  // Fast path: if the current minute matches, and last refresh was in a
  // previous minute, fire now.
  if (cronMatches && sameMinute(now, lastRefreshAt) === false) return true

  // Catch-up path: was there a firing between lastRefreshAt and now that we
  // missed (e.g. the server was down)? Scan back up to 24h — long enough to
  // catch a daily cron missed by a restart, short enough to be cheap.
  const scanLimit = 24 * 60 // 24h in minutes
  const cursor = new Date(now.getTime())
  cursor.setSeconds(0, 0)
  const lastRefreshFloor = new Date(lastRefreshAt.getTime())
  lastRefreshFloor.setSeconds(0, 0)
  for (let i = 0; i < scanLimit; i++) {
    if (cursor <= lastRefreshFloor) return false
    if (cronMatchesMinute(expr, cursor)) return true
    cursor.setMinutes(cursor.getMinutes() - 1)
  }
  return false
}

function sameMinute(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() &&
         a.getUTCMonth() === b.getUTCMonth() &&
         a.getUTCDate() === b.getUTCDate() &&
         a.getUTCHours() === b.getUTCHours() &&
         a.getUTCMinutes() === b.getUTCMinutes()
}

/**
 * node-cron doesn't expose "does this expression fire at THIS specific time?"
 * so we parse the five standard fields ourselves: minute hour dom month dow.
 * Supports *, ranges (1-5), lists (1,3,5), and step (star-slash-N).
 */
function cronMatchesMinute(expr: string, when: Date): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [min, hr, dom, mo, dow] = parts
  const d = when
  return matchField(min, d.getMinutes(), 0, 59)
    && matchField(hr, d.getHours(), 0, 23)
    && matchField(dom, d.getDate(), 1, 31)
    && matchField(mo, d.getMonth() + 1, 1, 12)
    && matchField(dow, d.getDay(), 0, 6)
}

function matchField(field: string, value: number, min: number, max: number): boolean {
  for (const chunk of field.split(',')) {
    // step: "*/5" or "0-30/5"
    const stepMatch = chunk.match(/^(.*)\/(\d+)$/)
    if (stepMatch) {
      const base = stepMatch[1] === '*' ? `${min}-${max}` : stepMatch[1]
      const step = Number(stepMatch[2])
      const [a, b] = parseRange(base, min, max)
      if (value >= a && value <= b && (value - a) % step === 0) return true
      continue
    }
    if (chunk === '*') return true
    const [a, b] = parseRange(chunk, min, max)
    if (value >= a && value <= b) return true
  }
  return false
}

function parseRange(chunk: string, defMin: number, defMax: number): [number, number] {
  const m = chunk.match(/^(\d+)(?:-(\d+))?$/)
  if (!m) return [defMin, defMax]
  const a = Number(m[1])
  const b = m[2] !== undefined ? Number(m[2]) : a
  return [a, b]
}
