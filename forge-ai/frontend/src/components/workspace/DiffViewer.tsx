import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import Markdown from '@/components/Markdown'
import type { Task, FileChange } from '@/types'
import {
  GitPullRequest, Download, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, Zap, FileCode2, Undo2
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'

interface Props { task: Task; repositoryId: string }

export default function DiffViewer({ task, repositoryId }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split')
  const qc = useQueryClient()

  // ── Always fetch the full task from DB so before/after content is present ──
  // The task prop from Workspace may come from the list endpoint which
  // doesn't guarantee full change content is populated.
  const { data: fullTask, isLoading } = useQuery({
    queryKey: ['task-full', task._id],
    queryFn: () => api.get(`/tasks/${task._id}`).then((r) => r.data.task),
    // Use whatever we already have as placeholder while fetching
    placeholderData: task,
    // Refetch whenever task status changes (e.g. just completed)
    enabled: !!task._id,
    staleTime: task.status === 'completed' ? 60_000 : 0,
  })

  const t: Task = fullTask ?? task
  const changes = t.changes ?? []
  const totalAdd = changes.reduce((a, c) => a + c.additions, 0)
  const totalDel = changes.reduce((a, c) => a + c.deletions, 0)

  const prMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${t._id}/create-pr`, { repositoryId }),
    onSuccess: ({ data }: any) => {
      toast.success('PR created!')
      window.open(data.url, '_blank')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'PR failed'),
  })

  const revertMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${t._id}/revert`),
    onSuccess: ({ data }: any) => {
      toast.success(`↩️ Reverted ${data.reverted} file(s)${data.skipped?.length ? ` (${data.skipped.length} skipped)` : ''}`)
      qc.invalidateQueries({ queryKey: ['task-full', t._id] })
      qc.invalidateQueries({ queryKey: ['filetree', repositoryId] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Revert failed'),
  })

  const downloadMutation = useMutation({
    mutationFn: () => api.get(`/tasks/${t._id}/download`, { responseType: 'blob' }),
    onSuccess: ({ data }: any) => {
      const url = window.URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `forge-changes-${t._id.slice(-6)}.zip`
      a.click()
    },
    onError: () => toast.error('Download failed'),
  })

  // Loading state
  if (isLoading && !changes.length) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-zinc-500">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading changes…</span>
      </div>
    )
  }

  // Running state
  if (t.status === 'running' && !changes.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <Loader2 size={28} className="text-brand-400 animate-spin" />
        <p className="text-zinc-400 text-sm font-medium">AI is analyzing and fixing…</p>
        <p className="text-zinc-600 text-xs">Changes will appear here as files are fixed</p>
      </div>
    )
  }

  // Empty state
  if (!changes.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        {t.status === 'completed' ? (
          <>
            <CheckCircle2 size={28} className="text-emerald-400" />
            <p className="text-zinc-400 text-sm">No changes were needed</p>
            <p className="text-zinc-600 text-xs">The workspace was already clean</p>
          </>
        ) : (
          <>
            <Zap size={28} className="text-zinc-700" />
            <p className="text-zinc-500 text-sm">No changes yet</p>
            <p className="text-zinc-600 text-xs">Run Fix Workspace to see diffs here</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Summary header */}
      <div className="px-4 py-3 border-b border-surface-700 bg-surface-800 shrink-0">
        <div className="flex items-center gap-4 mb-2">
          <div className="flex items-center gap-1.5">
            <FileCode2 size={13} className="text-zinc-500" />
            <span className="text-xs text-zinc-300 font-medium">{changes.length} file{changes.length !== 1 ? 's' : ''} changed</span>
          </div>
          <span className="text-xs text-emerald-400 font-mono">+{totalAdd}</span>
          <span className="text-xs text-red-400 font-mono">-{totalDel}</span>

          {/* View mode toggle */}
          <div className="ml-auto flex items-center gap-1">
            {(['split', 'unified'] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)}
                className={clsx('text-[10px] px-2 py-0.5 rounded transition-colors',
                  viewMode === m ? 'bg-brand-600/20 text-brand-400' : 'text-zinc-600 hover:text-zinc-400'
                )}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Change bar */}
        <div className="flex h-1 rounded-full overflow-hidden bg-surface-700 gap-px">
          {changes.map((c, i) => (
            <div key={`bar-${i}`} className="h-full" title={c.path}
              style={{ flex: 1, background: i % 2 === 0 ? '#4f46e5' : '#6366f1' }} />
          ))}
        </div>

        {/* Summary is capped so a long one can't squeeze the file list below out of view */}
        {t.summary && (
          <div className="mt-2 max-h-44 overflow-y-auto pr-1 border-t border-surface-700/60 pt-2">
            <Markdown content={t.summary} />
          </div>
        )}
      </div>

      {/* Action buttons */}
      {t.status === 'completed' && (
        <div className="flex gap-2 px-4 py-2 border-b border-surface-700 shrink-0">
          <button onClick={() => prMutation.mutate()} disabled={prMutation.isPending}
            className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-50">
            {prMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <GitPullRequest size={12} />}
            {prMutation.isPending ? 'Creating…' : 'Create Pull Request'}
          </button>
          <button onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending}
            className="btn-secondary flex items-center gap-1.5 text-xs disabled:opacity-50">
            <Download size={12} /> Download Changes
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Undo all ${changes.length} file change(s) from this task and restore the previous content?`)) {
                revertMutation.mutate()
              }
            }}
            disabled={revertMutation.isPending}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {revertMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
            Revert All
          </button>
        </div>
      )}

      {/* File diffs */}
      <div className="flex-1 overflow-y-auto divide-y divide-surface-700">
        {changes.map((change, idx) => (
          <div key={`diff-${idx}-${change.path}`}>
            {/* File row */}
            <button
              onClick={() => setExpanded(expanded === change.path ? null : change.path)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-700 transition-colors"
            >
              <span className="text-[11px] text-emerald-400 font-mono shrink-0">+{change.additions}</span>
              <span className="text-[11px] text-red-400 font-mono shrink-0">-{change.deletions}</span>
              {/* Mini bar */}
              <div className="w-12 h-1 bg-surface-700 rounded-full overflow-hidden shrink-0">
                <div className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.round(change.additions / Math.max(change.additions + change.deletions, 1) * 100)}%` }} />
              </div>
              <span className="flex-1 text-left text-xs text-zinc-300 font-mono truncate">{change.path}</span>
              {expanded === change.path
                ? <ChevronUp size={12} className="text-zinc-600 shrink-0" />
                : <ChevronDown size={12} className="text-zinc-600 shrink-0" />
              }
            </button>

            {/* Diff content — capped height so one huge file doesn't bury the rest */}
            {expanded === change.path && (
              <div className="max-h-[440px] overflow-y-auto">
                {viewMode === 'split'
                  ? <SplitDiff change={change} />
                  : <UnifiedDiff change={change} />}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Split diff ───────────────────────────────────────────
function SplitDiff({ change }: { change: FileChange }) {
  const before = change.before?.split('\n') ?? []
  const after = change.after?.split('\n') ?? []
  const maxLen = Math.max(before.length, after.length)

  if (!change.before && !change.after) {
    return (
      <div className="px-4 py-3 text-xs text-zinc-600 bg-surface-900 border-t border-surface-700">
        File content not available — re-run Fix Workspace to capture full diff.
      </div>
    )
  }

  return (
    <div className="font-mono text-[11px] overflow-x-auto border-t border-surface-700 bg-[#0a0a0c]">
      <div className="grid grid-cols-2 divide-x divide-surface-700">
        <div>
          <div className="px-3 py-1 text-[10px] text-red-400 bg-red-500/5 border-b border-surface-700 font-sans sticky top-0">
            Before
          </div>
          {Array.from({ length: maxLen }).map((_, i) => {
            const line = before[i] ?? ''
            const changed = line !== (after[i] ?? '')
            return (
              <div key={`b-${i}`} className={clsx('flex leading-relaxed', changed && 'bg-red-500/10')}>
                <span className="select-none w-8 text-right px-2 text-zinc-700 border-r border-surface-700 shrink-0 text-[10px]">{i + 1}</span>
                <span className={clsx('px-3 whitespace-pre', changed ? 'text-red-300/80' : 'text-zinc-500')}>
                  {line || ' '}
                </span>
              </div>
            )
          })}
        </div>
        <div>
          <div className="px-3 py-1 text-[10px] text-emerald-400 bg-emerald-500/5 border-b border-surface-700 font-sans sticky top-0">
            After
          </div>
          {Array.from({ length: maxLen }).map((_, i) => {
            const line = after[i] ?? ''
            const changed = line !== (before[i] ?? '')
            return (
              <div key={`a-${i}`} className={clsx('flex leading-relaxed', changed && 'bg-emerald-500/10')}>
                <span className="select-none w-8 text-right px-2 text-zinc-700 border-r border-surface-700 shrink-0 text-[10px]">{i + 1}</span>
                <span className={clsx('px-3 whitespace-pre', changed ? 'text-emerald-300/80' : 'text-zinc-500')}>
                  {line || ' '}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Unified diff ─────────────────────────────────────────
function UnifiedDiff({ change }: { change: FileChange }) {
  const before = change.before?.split('\n') ?? []
  const after = change.after?.split('\n') ?? []
  const maxLen = Math.max(before.length, after.length)

  const lines: { type: 'add' | 'remove' | 'same'; text: string; n: number }[] = []
  for (let i = 0; i < maxLen; i++) {
    const b = before[i]
    const a = after[i]
    if (b === a) {
      if (b !== undefined) lines.push({ type: 'same', text: b, n: i + 1 })
    } else {
      if (b !== undefined) lines.push({ type: 'remove', text: b, n: i + 1 })
      if (a !== undefined) lines.push({ type: 'add', text: a, n: i + 1 })
    }
  }

  return (
    <div className="font-mono text-[11px] overflow-x-auto border-t border-surface-700 bg-[#0a0a0c]">
      {lines.map((line, i) => (
        <div key={`u-${i}`} className={clsx('flex leading-relaxed',
          line.type === 'add' && 'bg-emerald-500/10',
          line.type === 'remove' && 'bg-red-500/10',
        )}>
          <span className={clsx('select-none w-5 text-center border-r border-surface-700 shrink-0 text-[10px]',
            line.type === 'add' ? 'text-emerald-500' : line.type === 'remove' ? 'text-red-500' : 'text-zinc-700'
          )}>
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
          </span>
          <span className="select-none w-7 text-right px-1 text-zinc-700 border-r border-surface-700 shrink-0 text-[10px]">
            {line.n}
          </span>
          <span className={clsx('px-3 whitespace-pre flex-1',
            line.type === 'add' ? 'text-emerald-300/80' : line.type === 'remove' ? 'text-red-300/80' : 'text-zinc-500'
          )}>
            {line.text || ' '}
          </span>
        </div>
      ))}
    </div>
  )
}