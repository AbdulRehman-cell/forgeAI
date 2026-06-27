import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Task, FileChange } from '@/types'
import { GitPullRequest, Download, ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props { task: Task; repositoryId: string }

export default function DiffViewer({ task, repositoryId }: Props) {
  const [expanded, setExpanded] = useState<string | null>(task.changes[0]?.path ?? null)
  const qc = useQueryClient()

  const prMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${task._id}/create-pr`, { repositoryId }),
    onSuccess: ({ data }) => toast.success(`PR created: ${data.url}`),
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'PR failed'),
  })

  const downloadMutation = useMutation({
    mutationFn: () => api.get(`/tasks/${task._id}/download`, { responseType: 'blob' }),
    onSuccess: ({ data }) => {
      const url = window.URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `forge-changes-${task._id.slice(-6)}.zip`
      a.click()
    },
  })

  if (!task.changes.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500 text-sm">No changes yet. Run "Fix Workspace" to see diffs here.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Actions */}
      {task.status === 'completed' && (
        <div className="flex gap-2 p-3 border-b border-surface-700">
          <button onClick={() => prMutation.mutate()} disabled={prMutation.isPending} className="btn-primary flex items-center gap-1.5 text-xs">
            <GitPullRequest size={13} /> Create Pull Request
          </button>
          <button onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending} className="btn-secondary flex items-center gap-1.5 text-xs">
            <Download size={13} /> Download Changes
          </button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto divide-y divide-surface-700">
        {task.changes.map((change) => (
          <div key={change.path}>
            <button
              onClick={() => setExpanded(expanded === change.path ? null : change.path)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-700 transition-colors"
            >
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Plus size={10} />{change.additions}
              </span>
              <span className="flex items-center gap-1 text-xs text-red-400">
                <Minus size={10} />{change.deletions}
              </span>
              <span className="flex-1 text-left text-xs text-zinc-300 font-mono truncate">{change.path}</span>
              {expanded === change.path ? <ChevronUp size={13} className="text-zinc-600" /> : <ChevronDown size={13} className="text-zinc-600" />}
            </button>

            {expanded === change.path && (
              <InlineDiff change={change} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function InlineDiff({ change }: { change: FileChange }) {
  const beforeLines = change.before.split('\n')
  const afterLines = change.after.split('\n')

  // Simple line-by-line diff display
  return (
    <div className="font-mono text-xs overflow-x-auto bg-surface-900">
      <div className="grid grid-cols-2 divide-x divide-surface-700">
        <div className="p-3 space-y-0">
          <p className="text-zinc-600 mb-2">Before</p>
          {beforeLines.map((line, i) => (
            <div key={i} className="flex gap-2 leading-relaxed">
              <span className="text-zinc-700 select-none w-6 text-right shrink-0">{i + 1}</span>
              <span className="text-red-300/70 whitespace-pre">{line || ' '}</span>
            </div>
          ))}
        </div>
        <div className="p-3 space-y-0">
          <p className="text-zinc-600 mb-2">After</p>
          {afterLines.map((line, i) => (
            <div key={i} className="flex gap-2 leading-relaxed">
              <span className="text-zinc-700 select-none w-6 text-right shrink-0">{i + 1}</span>
              <span className="text-emerald-300/70 whitespace-pre">{line || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
