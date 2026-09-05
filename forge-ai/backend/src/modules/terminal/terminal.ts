// Interactive terminal sessions over socket.io — a shell process per terminal,
// scoped to a workspace folder the user owns. No node-pty needed: PowerShell/bash
// with piped stdio is enough for running builds, tests, and dev commands.

import { spawn, ChildProcess } from 'child_process'
import type { Socket } from 'socket.io'
import { Repository } from '../repository/repository.model'

const MAX_TERMINALS_PER_SOCKET = 4

export function attachTerminalHandlers(socket: Socket) {
  const userId = (socket as any).userId as string
  const terminals = new Map<string, ChildProcess>()

  socket.on('terminal:create', async ({ termId, repositoryId }: { termId: string; repositoryId: string }) => {
    if (!termId || terminals.has(termId)) return
    if (terminals.size >= MAX_TERMINALS_PER_SOCKET) {
      return socket.emit('terminal:error', { termId, message: 'Too many open terminals' })
    }

    const repo = await Repository.findOne({ _id: repositoryId, userId })
    if (!repo?.localPath) {
      return socket.emit('terminal:error', { termId, message: 'Workspace not found or has no local folder' })
    }

    let shell: ChildProcess
    try {
      shell = process.platform === 'win32'
        ? spawn('powershell.exe', ['-NoLogo'], { cwd: repo.localPath, windowsHide: true })
        : spawn('bash', ['-i'], { cwd: repo.localPath })
    } catch (err: any) {
      return socket.emit('terminal:error', { termId, message: `Could not start shell: ${err.message}` })
    }

    terminals.set(termId, shell)
    socket.emit('terminal:ready', { termId, cwd: repo.localPath, shell: process.platform === 'win32' ? 'powershell' : 'bash' })

    shell.stdout?.on('data', (d: Buffer) => socket.emit('terminal:data', { termId, data: d.toString('utf-8') }))
    shell.stderr?.on('data', (d: Buffer) => socket.emit('terminal:data', { termId, data: d.toString('utf-8') }))
    shell.on('close', (code) => {
      terminals.delete(termId)
      socket.emit('terminal:exit', { termId, code })
    })
    shell.on('error', (err) => {
      terminals.delete(termId)
      socket.emit('terminal:error', { termId, message: err.message })
    })
  })

  socket.on('terminal:input', ({ termId, data }: { termId: string; data: string }) => {
    const shell = terminals.get(termId)
    if (shell?.stdin?.writable && typeof data === 'string') shell.stdin.write(data)
  })

  socket.on('terminal:kill', ({ termId }: { termId: string }) => {
    const shell = terminals.get(termId)
    if (shell) {
      terminals.delete(termId)
      try { shell.kill() } catch {}
    }
  })

  socket.on('disconnect', () => {
    for (const shell of terminals.values()) {
      try { shell.kill() } catch {}
    }
    terminals.clear()
  })
}
