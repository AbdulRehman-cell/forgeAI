// Shared types usable across frontend, backend, and extension
// These mirror the Mongoose documents and frontend types

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'
export type TaskType = 'fix_workspace' | 'fix_file' | 'fix_folder' | 'chat' | 'clone_repo'
export type RepoStatus = 'idle' | 'cloning' | 'indexing' | 'ready' | 'error'
export type AIProvider = 'openai' | 'claude' | 'gemini'

export interface FileChange {
  path: string
  before: string
  after: string
  additions: number
  deletions: number
}

export interface TaskLog {
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: string
}
