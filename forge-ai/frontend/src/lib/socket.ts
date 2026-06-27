import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/authStore'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    const token = useAuthStore.getState().token
    socket = io(import.meta.env.VITE_WS_URL ?? 'http://localhost:4000', {
      auth: { token },
      transports: ['websocket'],
    })
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
