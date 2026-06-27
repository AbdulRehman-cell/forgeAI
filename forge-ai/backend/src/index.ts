import 'dotenv/config'
import http from 'http'
import app from './app'
import { connectDB } from './lib/database'
import { setupWebSocket } from './modules/websocket'
import { setupWorkers } from './lib/workers'

const PORT = process.env.PORT ?? 4000

async function bootstrap() {
  await connectDB()

  const server = http.createServer(app)
  setupWebSocket(server)
  setupWorkers()

  server.listen(PORT, () => {
    console.log(`[server] Running on http://localhost:${PORT}`)
  })
}

bootstrap().catch((err) => {
  console.error('[server] Fatal:', err)
  process.exit(1)
})
