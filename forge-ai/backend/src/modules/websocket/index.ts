import { Server as HTTPServer } from 'http'
import { Server as SocketServer, Socket } from 'socket.io'
import { verifyToken } from '../../lib/jwt'
import { attachTerminalHandlers } from '../terminal/terminal'

let io: SocketServer | null = null

export function setupWebSocket(server: HTTPServer) {
  io = new SocketServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
      credentials: true,
    },
  })

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('Authentication required'))
    try {
      const payload = verifyToken(token)
      ;(socket as any).userId = payload.sub
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId
    socket.join(`user:${userId}`)
    console.log(`[ws] User ${userId} connected`)

    socket.on('subscribe:task', (taskId: string) => {
      socket.join(`task:${taskId}`)
    })

    socket.on('unsubscribe:task', (taskId: string) => {
      socket.leave(`task:${taskId}`)
    })

    // Interactive terminal sessions (Claude Code-style)
    attachTerminalHandlers(socket)

    socket.on('disconnect', () => {
      console.log(`[ws] User ${userId} disconnected`)
    })
  })
}

export function emitTaskUpdate(taskId: string, data: any) {
  if (!io) return
  io.to(`task:${taskId}`).emit('task:update', data)
}

export function emitToUser(userId: string, event: string, data: any) {
  if (!io) return
  io.to(`user:${userId}`).emit(event, data)
}
