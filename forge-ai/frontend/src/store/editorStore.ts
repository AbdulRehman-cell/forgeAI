import { create } from 'zustand'

export interface EditorTab {
  id: string
  path: string
  label: string
  content: string
  originalContent: string
  isDirty: boolean
  language: string
}

export interface SearchResult {
  path: string
  line: number
  col: number
  preview: string
  match: string
}

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  splitTabId: string | null
  splitEnabled: boolean
  searchQuery: string
  searchResults: SearchResult[]
  searchLoading: boolean
  openTab: (tab: Omit<EditorTab, 'id'>) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
  markSaved: (id: string) => void
  openSplit: (tabId: string) => void
  closeSplit: () => void
  setSearchQuery: (q: string) => void
  setSearchResults: (results: SearchResult[]) => void
  setSearchLoading: (v: boolean) => void
}

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', json: 'json', md: 'markdown', css: 'css', scss: 'scss',
    html: 'html', yml: 'yaml', yaml: 'yaml', sh: 'shell',
    go: 'go', rs: 'rust', java: 'java', cs: 'csharp', cpp: 'cpp', c: 'c',
    rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin', toml: 'toml',
    xml: 'xml', sql: 'sql',
  }
  if (path.toLowerCase().includes('dockerfile')) return 'dockerfile'
  return map[ext] ?? 'plaintext'
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  splitTabId: null,
  splitEnabled: false,
  searchQuery: '',
  searchResults: [],
  searchLoading: false,

  openTab: (tabData) => {
    const id = tabData.path
    if (get().tabs.find((t) => t.id === id)) { set({ activeTabId: id }); return }
    set((s) => ({
      tabs: [...s.tabs, { ...tabData, id, language: getLanguage(tabData.path), isDirty: false }],
      activeTabId: id,
    }))
  },

  closeTab: (id) => set((s) => {
    const tabs = s.tabs.filter((t) => t.id !== id)
    const splitTabId = s.splitTabId === id ? null : s.splitTabId
    const activeTabId = s.activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId
    return { tabs, activeTabId, splitTabId, splitEnabled: splitTabId !== null }
  }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateContent: (id, content) => set((s) => ({
    tabs: s.tabs.map((t) => t.id === id ? { ...t, content, isDirty: content !== t.originalContent } : t),
  })),

  markSaved: (id) => set((s) => ({
    tabs: s.tabs.map((t) => t.id === id ? { ...t, isDirty: false, originalContent: t.content } : t),
  })),

  openSplit: (tabId) => set({ splitTabId: tabId, splitEnabled: true }),
  closeSplit: () => set({ splitTabId: null, splitEnabled: false }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchResults: (results) => set({ searchResults: results }),
  setSearchLoading: (v) => set({ searchLoading: v }),
}))