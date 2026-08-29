import dotenv from 'dotenv'
import path from 'path'
// .env lives one level above backend/ — resolve explicitly so it loads
// regardless of which directory npm run dev is invoked from.
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import http from 'http'
import app from './app'
import { connectDB } from './lib/database'
import { setupWebSocket } from './modules/websocket'
import { setupWorkers } from './lib/workers'
import { startDashboardScheduler } from './modules/dashboard/refresh/scheduler'
import { startMaintenancePlanScheduler } from './lib/maintenanceScheduler'

const PORT = process.env.PORT ?? 4000

async function bootstrap() {
  await connectDB()

  const server = http.createServer(app)
  setupWebSocket(server)
  setupWorkers()
  startDashboardScheduler()
  startMaintenancePlanScheduler()

  server.listen(PORT, () => {
    console.log(`[server] Running on http://localhost:${PORT}`)
  })
}

bootstrap().catch((err) => {
  console.error('[server] Fatal:', err)
  process.exit(1)
})
