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

// While a site build holds the RAM, background (re)starts are queued instead of
// spawned. Without this the boot-time restore re-launched every backend a build
// had just paused — five Node processes competing with the build for 512 MB.
let startHolds = 0
const deferredStarts = new Map<string, string>()

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
    // 96 MB is ample for a Mongoose/Express MERN backend.
    // Keeping it low lets ForgeAI + several managed backends coexist on the
    // 512 MB Render free-tier container (150 MB + 5×~60 MB actual RSS ≈ 450 MB).
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=96' },
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
  try {
    await waitForPort(port, 45_000)
    console.log(`[backend:${slug}] ready`)
  } catch (e: any) {
    console.warn(`[backend:${slug}] ${e.message}`)
    processes.delete(slug)
    throw e
  }
  return { port, proxyPath: `/sites-api/${slug}` }
}

function _respawn(slug: string, serverDir: string, port: number, restarts: number) {
  if (startHolds > 0) {
    processes.delete(slug)
    deferredStarts.set(slug, serverDir)
    return
  }
  const { cmd, args } = detectStartCommand(serverDir)
  const proc = spawn(cmd, args, {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=96' },
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

export function listBackends(): Array<{ slug: string; port: number; startedAt: Date; restarts: number; serverDir: string }> {
  return [...processes.values()].map(({ slug, port, startedAt, restarts, serverDir }) => ({ slug, port, startedAt, restarts, serverDir }))
}

/** Stop every running backend and return their info so they can be restarted later. */
export function pauseAllBackends(): Array<{ slug: string; serverDir: string }> {
  const running = listBackends().map(({ slug, serverDir }) => ({ slug, serverDir }))
  for (const { slug } of running) stopBackend(slug)
  return running
}

/** Restart backends that were paused with pauseAllBackends (best-effort, non-blocking). */
export function resumeBackends(backends: Array<{ slug: string; serverDir: string }>): void {
  for (const { slug, serverDir } of backends) {
    startBackend(slug, serverDir).catch(e => console.warn(`[processManager] Failed to resume ${slug}: ${e.message}`))
  }
}

/** Pause every backend AND keep background restores from relaunching them
 *  until releaseBackendHold(). Use around memory-heavy work (site builds). */
export function holdAllBackends(): Array<{ slug: string; serverDir: string }> {
  startHolds++
  return pauseAllBackends()
}

/** Drop one hold; when the last is released, restart what was paused plus
 *  anything a background restore tried to start meanwhile. */
export function releaseBackendHold(paused: Array<{ slug: string; serverDir: string }>): void {
  startHolds = Math.max(0, startHolds - 1)
  for (const b of paused) deferredStarts.set(b.slug, b.serverDir)
  if (startHolds > 0) return
  const toStart = [...deferredStarts].map(([slug, serverDir]) => ({ slug, serverDir }))
  deferredStarts.clear()
  resumeBackends(toStart.filter((b) => !processes.has(b.slug)))
}

/** Resolves once no build holds the backends (polls; holds last minutes). */
export async function waitForBackendHoldRelease(): Promise<void> {
  while (startHolds > 0) await new Promise((r) => setTimeout(r, 5000))
}

/** startBackend for background restores: queued instead of spawned while held. */
export async function startBackendWhenFree(slug: string, serverDir: string): Promise<void> {
  if (startHolds > 0) {
    deferredStarts.set(slug, serverDir)
    console.log(`[backend:${slug}] start deferred — a site build is using the memory`)
    return
  }
  await startBackend(slug, serverDir)
}
