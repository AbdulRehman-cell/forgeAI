import dotenv from 'dotenv'
import path from 'path'
// .env lives one level above backend/ — resolve explicitly so it loads
// regardless of which directory npm run dev is invoked from.
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import http from 'http'
import app, { triggerBackendRestore } from './app'
import { connectDB } from './lib/database'
import { setupWebSocket } from './modules/websocket'
import { setupWorkers } from './lib/workers'
import { startDashboardScheduler } from './modules/dashboard/refresh/scheduler'
import { startMaintenancePlanScheduler } from './lib/maintenanceScheduler'
import { startDigestScheduler } from './lib/teamDigest'

const PORT = process.env.PORT ?? 4000

// Render free tier spins down after 15 min of inactivity — ping ourselves
// every 14 min so the service stays warm. RENDER_EXTERNAL_URL is set
// automatically by Render on all web services; no-op in local dev.
function startKeepAlive() {
  const base = process.env.RENDER_EXTERNAL_URL
  if (!base) return
  const url = `${base}/health`
  setInterval(async () => {
    try {
      await fetch(url)
      console.log('[keep-alive] pinged', url)
    } catch (err: any) {
      console.warn('[keep-alive] ping failed:', err?.message)
    }
  }, 14 * 60 * 1000)
  console.log(`[keep-alive] started — pinging ${url} every 14 min`)
}

// LOG_MEMORY=1 prints heap/RSS every 15s — the production heap is capped
// (--max-old-space-size), so this is how to see how close a build gets to it.
function startMemoryLog() {
  if (!process.env.LOG_MEMORY) return
  setInterval(() => {
    const m = process.memoryUsage()
    const mb = (n: number) => Math.round(n / 1048576)
    console.log(`[mem] heap ${mb(m.heapUsed)}/${mb(m.heapTotal)} MB · rss ${mb(m.rss)} MB · external ${mb(m.external)} MB`)
  }, 15_000).unref()
}

async function bootstrap() {
  startMemoryLog()
  await connectDB()

  // Start restoring self-hosted site backends now that DB is ready.
  // This runs in the background — the server starts immediately below.
  triggerBackendRestore()

  const server = http.createServer(app)
  setupWebSocket(server)
  setupWorkers()
  startDashboardScheduler()
  startMaintenancePlanScheduler()
  startDigestScheduler()
  startKeepAlive()

  server.listen(PORT, () => {
    console.log(`[server] Running on http://localhost:${PORT}`)
  })
}

// Jobs run in-process, so one stray rejected promise (e.g. an AI call that
// errors after its caller already timed out) would otherwise crash the server
// and silently kill every build in flight. Log it and keep serving.
process.on('unhandledRejection', (reason: any) => {
  console.error('[process] Unhandled rejection (ignored):', reason?.stack ?? reason?.message ?? reason)
})

bootstrap().catch((err) => {
  console.error('[server] Fatal:', err)
  process.exit(1)
})
