import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { DiffEditor } from '@monaco-editor/react'
import { GitBranch, X, Loader2, AlertCircle } from 'lucide-react'

interface Props {
  filePath: string
  repositoryId: string
  onClose: () => void
}

export default function GitDiffPane({ filePath, repositoryId, onClose }: Props) {

  // Get the current file content from disk
  const { data: currentContent, isLoading: loadingCurrent } = useQuery({
    queryKey: ['file', repositoryId, filePath],
    queryFn: () =>
      api.get(`/repositories/${repositoryId}/file`, { params: { path: filePath } })
        .then((r) => r.data.content as string),
    staleTime: 5000,
  })

  // Get the original (before) content from the most recent completed task that touched this file
  const { data: originalContent, isLoading: loadingOriginal } = useQuery({
    queryKey: ['file-original', repositoryId, filePath],
    queryFn: async () => {
      const { data } = await api.get(`/tasks?repositoryId=${repositoryId}&limit=10`)
      const tasks = data.tasks ?? []
      for (const task of tasks) {
        if (task.status !== 'completed') continue
        // Fetch full task to get before/after content
        const { data: full } = await api.get(`/tasks/${task._id}`)
        const change = full.task?.changes?.find((c: any) => c.path === filePath)
        if (change?.before !== undefined) return change.before as string
      }
      // If no task has this file, show current content on both sides (no diff)
      return currentContent ?? ''
    },
    enabled: !!currentContent,
    staleTime: 30_000,
  })

  const isLoading = loadingCurrent || loadingOriginal
  const lang = getLanguage(filePath)
  const hasChanges = originalContent !== undefined && currentContent !== undefined && originalContent !== currentContent

  return (
    <div className="flex flex-col h-full bg-[#0f0f11]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-700 bg-surface-800 shrink-0">
        <GitBranch size={13} className="text-brand-400 shrink-0" />
        <span className="text-[11px] text-zinc-400 font-mono flex-1 truncate">
          {filePath}
          {!isLoading && (
            <span className={`ml-2 text-[10px] ${hasChanges ? 'text-yellow-400' : 'text-zinc-600'}`}>
              {hasChanges ? '● modified' : '○ no changes'}
            </span>
          )}
        </span>
        <button onClick={onClose} className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors rounded">
          <X size={13} />
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center flex-1 gap-2 text-zinc-600">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading diff…</span>
        </div>
      ) : !hasChanges ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center px-6">
          <AlertCircle size={24} className="text-zinc-700" />
          <p className="text-zinc-500 text-sm">No changes found for this file</p>
          <p className="text-zinc-600 text-xs">
            This file hasn't been modified by ForgeAI, or no fix tasks have run yet.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <DiffEditor
            height="100%"
            original={originalContent}
            modified={currentContent}
            language={lang}
            theme="vs-dark"
            options={{
              fontSize: 12,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 8 },
              scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
              diffWordWrap: 'off',
              ignoreTrimWhitespace: false,
            }}
          />
        </div>
      )}
    </div>
  )
}

function getLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', json: 'json', md: 'markdown', css: 'css', scss: 'scss',
    html: 'html', yml: 'yaml', yaml: 'yaml', sh: 'shell', go: 'go',
    rs: 'rust', java: 'java', cs: 'csharp', cpp: 'cpp', c: 'c',
  }
  return map[ext] ?? 'plaintext'
}