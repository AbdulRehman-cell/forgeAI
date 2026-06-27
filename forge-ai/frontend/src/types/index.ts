// ─── Repository ────────────────────────────────────────────
export interface Repository {
  _id: string
  name: string
  fullName: string
  description?: string
  language?: string
  defaultBranch: string
  private: boolean
  cloned: boolean
  indexed: boolean
  status: 'idle' | 'cloning' | 'indexing' | 'ready' | 'error'
  createdAt: string
  updatedAt: string
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  size?: number
  language?: string
}

// ─── Task ──────────────────────────────────────────────────
export type TaskType = 'fix_workspace' | 'fix_file' | 'fix_folder' | 'chat'
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Task {
  _id: string
  type: TaskType
  status: TaskStatus
  repositoryId: string
  progress: number
  logs: TaskLog[]
  changes: FileChange[]
  summary?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export interface TaskLog {
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
}

export interface FileChange {
  path: string
  before: string
  after: string
  additions: number
  deletions: number
}

// ─── AI ────────────────────────────────────────────────────
export type AIProvider = 'openai' | 'claude' | 'gemini' | 'github'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

// ─── Auth ──────────────────────────────────────────────────
export interface AuthResponse {
  token: string
  user: {
    id: string
    name: string
    email: string
    avatar?: string
    githubConnected: boolean
  }
}
