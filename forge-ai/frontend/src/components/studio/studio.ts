// Shared shapes for the home page conversations (backend: modules/studio).
import { api } from '@/lib/api'

export interface StudioQuestion {
  id: string
  text: string
  type: 'text' | 'single' | 'multi'
  options?: { value: string; label: string }[]
  placeholder?: string
}

export interface HeroOption { id: string; label: string; text: string }
export interface ColorOption { label: string; brandHex: string; bg: string; ink: string; page: string; bands: string }
export interface DesignOptions { heroes: HeroOption[]; colors: ColorOption[] }

export interface StudioMessage {
  _id: string
  role: 'user' | 'assistant'
  content: string
  kind?: 'question' | 'design' | 'reply'
  data?: any
  at: string
}

export interface StudioTask {
  _id: string
  type: string
  status: string
  progress?: number
  summary?: string
  error?: string
  deploymentUrl?: string
  preview?: boolean
  lastLog?: string
  createdAt: string
}

export interface Conversation {
  _id: string
  mode: 'build' | 'chat'
  title: string
  stack: 'static' | 'supabase'
  stage: 'questions' | 'design' | 'built'
  messages: StudioMessage[]
  answers: Record<string, any>
  design: { hero?: string; color?: number; logo?: string }
  photos: string[]
  tasks: StudioTask[]
  repositoryId?: string
  repository?: { _id: string; name: string; status: string } | null
  previewPath?: string
  previewUrl?: string
  updatedAt: string
}

export interface PreviewBundle {
  shell: string
  css: { prefix: string; suffix: string; middles: string[] }
  pages: Record<string, string>
  options: DesignOptions
}

export const getConversation = (id: string) =>
  api.get(`/studio/conversations/${id}`).then((r) => r.data.conversation as Conversation)

/** The API's own address, for pages an iframe loads straight from it */
export const apiUrl = (path: string) => `${String(api.defaults.baseURL ?? '').replace(/\/$/, '')}${path}`

export const isRunning = (t: StudioTask) => t.status === 'pending' || t.status === 'running'
