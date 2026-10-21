import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import net from 'net'

interface ManagedProcess {
  slug: string
  serverDir: string
  process: ChildProcess
  port: number
  startedAt: Date
  restarts: number
}

const processes = new Map<string, ManagedProcess>()
const PORT_START = 5100
const PORT_END = 5999

function isPortFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => { server.close(); resolve(true) })
    server.listen(port, '127.0.0.1')
  })
}

async function findFreePort(): Promise<number> {
  const usedPorts = new Set([...processes.values()].map(p => p.port))
  for (let port = PORT_START; port <= PORT_END; port++) {
    if (usedPorts.has(port)) continue
    if (await isPortFree(port)) return port
  }
  throw new Error('No free ports available in managed-backend range 5100–5999')
}

function waitForPort(port: number, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    function attempt() {
      const sock = net.createConnection({ host: '127.0.0.1', port })
      sock.once('connect', () => { sock.destroy(); resolve() })
      sock.once('error', () => {
        sock.destroy()
        if (Date.now() >= deadline) return reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`))
        setTimeout(attempt, 250)
      })
    }
    attempt()
  })
}

function detectStartCommand(serverDir: string): { cmd: string; args: string[] } {
  const pkgPath = path.join(serverDir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    if (pkg.scripts?.start) return { cmd: 'npm', args: ['run', 'start'] }
    if (pkg.main)           return { cmd: 'node', args: [pkg.main] }
  }
  // Common entry point fallbacks
  for (const entry of ['index.js', 'server.js', 'app.js', 'src/index.js']) {
    if (fs.existsSync(path.join(serverDir, entry))) return { cmd: 'node', args: [entry] }
  }
  return { cmd: 'node', args: ['index.js'] }
}

export async function startBackend(slug: string, serverDir: string): Promise<{ port: number; proxyPath: string }> {
  stopBackend(slug)   // kill any existing process for this slug

  const port = await findFreePort()
  const { cmd, args } = detectStartCommand(serverDir)

  const proc = spawn(cmd, args, {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  proc.stdout?.on('data', d => process.stdout.write(`[backend:${slug}] ${d}`))
  proc.stderr?.on('data', d => process.stderr.write(`[backend:${slug}] ${d}`))

  proc.on('exit', (code) => {
    console.log(`[backend:${slug}] exited (code ${code})`)
    const mp = processes.get(slug)
    if (mp && mp.restarts < 3) {
      console.log(`[backend:${slug}] restarting (attempt ${mp.restarts + 1}/3)…`)
      mp.restarts++
      setTimeout(() => _respawn(slug, serverDir, port, mp.restarts), 3000)
    } else {
      processes.delete(slug)
    }
  })

  processes.set(slug, { slug, serverDir, process: proc, port, startedAt: new Date(), restarts: 0 })
  console.log(`[backend:${slug}] started on port ${port} (${cmd} ${args.join(' ')}) — waiting for ready…`)
  await waitForPort(port).catch(e => console.warn(`[backend:${slug}] ${e.message}`))
  console.log(`[backend:${slug}] ready`)
  return { port, proxyPath: `/sites-api/${slug}` }
}

function _respawn(slug: string, serverDir: string, port: number, restarts: number) {
  const { cmd, args } = detectStartCommand(serverDir)
  const proc = spawn(cmd, args, {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  proc.stdout?.on('data', d => process.stdout.write(`[backend:${slug}] ${d}`))
  proc.stderr?.on('data', d => process.stderr.write(`[backend:${slug}] ${d}`))
  proc.on('exit', (code) => {
    const mp = processes.get(slug)
    if (mp && mp.restarts < 3) {
      mp.restarts++
      setTimeout(() => _respawn(slug, serverDir, port, mp.restarts), 3000)
    } else {
      processes.delete(slug)
    }
  })
  processes.set(slug, { slug, serverDir, process: proc, port, startedAt: new Date(), restarts })
}

export function stopBackend(slug: string): void {
  const mp = processes.get(slug)
  if (mp) {
    try { mp.process.kill('SIGTERM') } catch {}
    processes.delete(slug)
  }
}

export function getBackendPort(slug: string): number | null {
  return processes.get(slug)?.port ?? null
}

export function listBackends(): Array<{ slug: string; port: number; startedAt: Date; restarts: number }> {
  return [...processes.values()].map(({ slug, port, startedAt, restarts }) => ({ slug, port, startedAt, restarts }))
}
