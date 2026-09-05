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
  source?: 'github' | 'local'
  status: 'idle' | 'cloning' | 'indexing' | 'ready' | 'error'
  /** Deploy + uptime-monitor state (render.url, monitor.status, …) */
  deployState?: {
    render?: { serviceId?: string; url?: string }
    monitor?: { status?: 'up' | 'down'; lastCheck?: string; lastDetail?: string; healTaskId?: string }
    [key: string]: any
  }
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
export type TaskType = 'fix_workspace' | 'fix_file' | 'fix_folder' | 'chat' | 'clone_repo' | 'review' | 'generate_tests' | 'security_scan' | 'blitz_deploy' | 'agent' | 'build_site' | 'rebuild_proposal'

// ─── Dependency graph ───────────────────────────────────────
export interface GraphNode {
  id: string
  label: string
  language: string
  size: number
  path: string
  dir: string
  inDegree: number
}
export interface GraphEdge {
  source: string
  target: string
}
export interface DependencyGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ─── Search result ──────────────────────────────────────────
export interface CodeSearchResult {
  file: string
  line: number
  snippet: string
  repoId: string
  repoName: string
  repoFullName: string
}

// ─── Impact analysis ────────────────────────────────────────
export interface ImpactResult {
  targetFile: string
  affectedCount: number
  affected: { path: string; distance: number }[]
  directImporters: string[]
}
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
  metadata?: {
    platform?: string
    deploymentUrl?: string
    dashboardUrl?: string
    [key: string]: any
  }
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
  truncated?: boolean
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
