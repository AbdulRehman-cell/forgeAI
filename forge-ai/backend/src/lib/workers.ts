// In-process job runner — no Redis or BullMQ required.
// Jobs run asynchronously in the background using plain Promises.

export type JobData = Record<string, any>

export interface Job {
  id: string
  data: JobData
}

type Handler = (job: Job) => Promise<void>

const handlers: Record<string, Handler> = {}
let jobCounter = 0

export function registerHandler(name: string, handler: Handler) {
  handlers[name] = handler
}

export async function enqueueJob(name: string, data: JobData): Promise<Job> {
  const job: Job = { id: String(++jobCounter), data }

  setImmediate(async () => {
    const handler = handlers[name]
    if (!handler) {
      console.error(`[queue] No handler for job type: ${name}`)
      return
    }
    try {
      console.log(`[queue] Starting job #${job.id} type=${name}`)
      await handler(job)
      console.log(`[queue] Job #${job.id} completed`)
    } catch (err) {
      console.error(`[queue] Job #${job.id} failed:`, err)
    }
  })

  return job
}

export function setupWorkers() {
  // Jobs run in-process, so a server restart kills them silently.
  // Mark anything still marked running/pending as failed so tasks
  // don't sit at "running" forever in the UI.
  import('../modules/tasks/task.model').then(({ Task }) =>
    Task.updateMany(
      { status: 'running' },
      { $set: { status: 'failed', error: 'Interrupted by a server restart — please run the task again' } },
    ).then((r) => {
      if (r.modifiedCount) console.log(`[queue] Marked ${r.modifiedCount} interrupted task(s) as failed`)
    }),
  ).catch(() => {})

  import('../modules/tasks/task.processor').then(({ processTask }) => {
    registerHandler('clone-repo',    (job) => processTask(job))
    registerHandler('fix-workspace', (job) => processTask(job))
    registerHandler('fix-file',      (job) => processTask(job))
    registerHandler('review',         (job) => processTask(job))
    registerHandler('generate-tests', (job) => processTask(job))
    registerHandler('security-scan',  (job) => processTask(job))
    registerHandler('blitz-deploy',   (job) => processTask(job))
    registerHandler('agent',          (job) => processTask(job))
    registerHandler('build-site',       (job) => processTask(job))
    registerHandler('rebuild-proposal', (job) => processTask(job))
    console.log('[queue] In-process worker ready (no Redis needed)')
  })
  import('../modules/dashboard/dashboard.processor').then(({ processDashboardBuild }) => {
    registerHandler('build-dashboard', (job) => processDashboardBuild(job))
    console.log('[queue] Dashboard build handler registered')
  })
}