import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
  avatar?: string
  githubConnected: boolean
  plan?: 'free' | 'pro' | 'team'
  teamOwnerId?: string
  teamRole?: 'admin' | 'member'
}

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  clearAuth: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    { name: 'forge-auth' },
  ),
)
