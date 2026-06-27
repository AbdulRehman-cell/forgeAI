import { create } from 'zustand'

interface WorkspaceState {
  activeFile: string | null
  expandedDirs: Set<string>
  taskRunning: boolean
  taskId: string | null
  setActiveFile: (path: string | null) => void
  toggleDir: (path: string) => void
  setTaskRunning: (running: boolean, taskId?: string) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeFile: null,
  expandedDirs: new Set(),
  taskRunning: false,
  taskId: null,
  setActiveFile: (path) => set({ activeFile: path }),
  toggleDir: (path) =>
    set((state) => {
      const next = new Set(state.expandedDirs)
      next.has(path) ? next.delete(path) : next.add(path)
      return { expandedDirs: next }
    }),
  setTaskRunning: (running, taskId) => set({ taskRunning: running, taskId: taskId ?? null }),
}))
