import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Loader2, CheckCircle2, XCircle, Clock, Zap,
  ChevronDown, ChevronUp, GitPullRequest,
  Download, X, FileCode2, TrendingUp, BarChart2, Sparkles, ArrowRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import Markdown from '@/components/Markdown'

interface FileChange { path: string; before: string; after: string; additions: number; deletions: number }
interface Task {
  _id: string; type: string; status: string; repositoryId: any
  changes: FileChange[]; logs: any[]; summary?: string; progress: number; createdAt: string
}

export default function TaskHistory() {
  const [selected, setSelected] = useState<Task | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks').then((r) => r.data.tasks),
  })

  const totalFiles = data?.reduce((a: number, t: Task) => a + (t.changes?.length ?? 0), 0) ?? 0
  const completed = data?.filter((t: Task) => t.status === 'completed').length ?? 0

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 md:p-8 max-w-5xl mx-auto relative">
      {/* ambient orb */}
      <div className="pointer-events-none absolute -top-20 right-10 w-96 h-72 bg-violet-600/8 rounded-full blur-[120px]" />

      {/* Header */}
      <div className="mb-8 relative animate-fade-up">
        <div className="inline-flex items-center gap-2 glass text-brand-300 text-[11px] font-medium px-3 py-1 rounded-full mb-3">
          <Sparkles size={11} className="text-violet-400" /> Activity log
        </div>
        <h1 className="text-3xl font-bold text-gradient">Task History</h1>
        <p className="text-zinc-500 text-sm mt-1.5">Click any task to inspect the full diff, summary, and logs.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 mb-8 stagger relative">
        {[
          { label: 'Total Tasks', value: data?.length ?? 0, icon: Clock, gradient: 'from-blue-500 to-indigo-500' },
          { label: 'Completed', value: completed, icon: CheckCircle2, gradient: 'from-emerald-500 to-teal-500' },
          { label: 'Files Fixed', value: totalFiles, icon: FileCode2, gradient: 'from-violet-500 to-fuchsia-500' },
        ].map(({ label, value, icon: Icon, gradient }) => (
          <div key={label} className="card card-interactive p-5 flex items-center gap-4 relative overflow-hidden">
            <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br ${gradient} opacity-10 blur-2xl`} />
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg shrink-0`}>
              <Icon size={18} className="text-white" />
            </div>
            <div className="relative">
              <p className="text-2xl font-bold text-gradient">{value}</p>
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24"><Loader2 className="animate-spin text-brand-400" /></div>
      ) : (
        <div className="space-y-2.5 stagger relative">
          {data?.map((task: Task) => (
            <button
              key={task._id}
              onClick={() => setSelected(task)}
              className="w-full card card-interactive p-4 flex items-center gap-4 text-left group"
            >
              <StatusIcon status={task.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-zinc-100 capitalize">{task.type.replace(/_/g, ' ')}</p>
                  <span className={clsx('badge border text-[10px]',
                    task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    task.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                    task.status === 'running' ? 'bg-brand-500/10 text-brand-400 border-brand-500/20' :
                    'bg-zinc-700/40 text-zinc-400 border-zinc-600/30'
                  )}>{task.status}</span>
                </div>
                <p className="text-xs text-zinc-500 truncate">
                  {task.repositoryId?.fullName ?? task.repositoryId}
                </p>
                {task.summary && (
                  <p className="text-xs text-zinc-600 mt-0.5 truncate">{task.summary.replace(/[#*`]/g, '').slice(0, 80)}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {(task.changes?.length ?? 0) > 0 && (
                  <div className="text-right">
                    <p className="text-xs font-semibold text-brand-400">{task.changes.length} files</p>
                    <p className="text-[10px] text-zinc-600 font-mono">
                      <span className="text-emerald-400">+{task.changes.reduce((a,c)=>a+c.additions,0)}</span>
                      {' '}<span className="text-red-400">-{task.changes.reduce((a,c)=>a+c.deletions,0)}</span>
                    </p>
                  </div>
                )}
                <span className="text-[10px] text-zinc-600">{new Date(task.createdAt).toLocaleDateString()}</span>
                <ArrowRight size={14} className="text-zinc-700 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          ))}
          {!data?.length && (
            <div className="card p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500/20 to-violet-600/20 flex items-center justify-center mx-auto mb-4">
                <Zap size={24} className="text-brand-400" />
              </div>
              <p className="text-zinc-400 text-sm">No tasks yet</p>
              <p className="text-zinc-600 text-xs mt-1">Open a workspace and click "Fix Workspace" to get started</p>
            </div>
          )}
        </div>
      )}

      {selected && <TaskModal task={selected} onClose={() => setSelected(null)} />}
    </div>
    </div>
  )
}

function TaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(task.changes[0]?.path ?? null)
  const [activeTab, setActiveTab] = useState<'summary' | 'changes' | 'logs'>('summary')
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const { data: fullTask } = useQuery({
    queryKey: ['task', task._id],
    queryFn: () => api.get(`/tasks/${task._id}`).then((r) => r.data.task),
    initialData: task,
  })

  const t: Task = fullTask ?? task
  const totalAdd = t.changes?.reduce((a, c) => a + c.additions, 0) ?? 0
  const totalDel = t.changes?.reduce((a, c) => a + c.deletions, 0) ?? 0

  const prMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${t._id}/create-pr`, { repositoryId: t.repositoryId?._id ?? t.repositoryId }),
    onSuccess: ({ data }: any) => { toast.success('PR created!'); window.open(data.url, '_blank') },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'PR failed'),
  })

  const downloadMutation = useMutation({
    mutationFn: () => api.get(`/tasks/${t._id}/download`, { responseType: 'blob' }),
    onSuccess: ({ data }: any) => {
      const url = window.URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url; a.download = `forge-changes-${t._id.slice(-6)}.zip`; a.click()
    },
    onError: () => toast.error('Download failed'),
  })

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="gradient-border w-full max-w-5xl max-h-[92vh] animate-scale-in">
        <div className="bg-surface-900 rounded-2xl flex flex-col max-h-[92vh] overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-3">
              <StatusIcon status={t.status} large />
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 capitalize">{t.type.replace(/_/g, ' ')}</h2>
                <p className="text-xs text-zinc-500">
                  {t.repositoryId?.fullName ?? t.repositoryId} · {new Date(t.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {t.status === 'completed' && (
                <>
                  <button onClick={() => prMutation.mutate()} disabled={prMutation.isPending}
                    className="btn-primary flex items-center gap-1.5 text-xs !px-3 !py-1.5">
                    <GitPullRequest size={12} />{prMutation.isPending ? 'Creating…' : 'Create PR'}
                  </button>
                  <button onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending}
                    className="btn-secondary flex items-center gap-1.5 text-xs !px-3 !py-1.5">
                    <Download size={12} /> Download
                  </button>
                </>
              )}
              <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-6 px-5 py-3 border-b border-white/5 bg-surface-950/50 shrink-0">
            <div className="flex items-center gap-1.5">
              <FileCode2 size={12} className="text-zinc-500" />
              <span className="text-xs text-zinc-400">{t.changes?.length ?? 0} files changed</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-xs text-emerald-400">+{totalAdd}</span>
              <span className="text-xs text-red-400">-{totalDel}</span>
            </div>
            <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                style={{ width: totalAdd + totalDel > 0 ? `${Math.round(totalAdd/(totalAdd+totalDel)*100)}%` : '0%' }} />
            </div>
            <div className="flex items-center gap-1">
              {(['split', 'unified'] as const).map((m) => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={clsx('text-[10px] px-2 py-0.5 rounded transition-colors',
                    viewMode === m ? 'bg-brand-600/20 text-brand-400' : 'text-zinc-600 hover:text-zinc-400')}>{m}</button>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/5 px-5 shrink-0">
            {([
              ['summary', 'Summary', BarChart2],
              ['changes', `Changes (${t.changes?.length ?? 0})`, FileCode2],
              ['logs', `Logs (${t.logs?.length ?? 0})`, TrendingUp],
            ] as const).map(([key, label, Icon]) => {
              const active = activeTab === key
              return (
                <button key={key} onClick={() => setActiveTab(key as any)}
                  className={clsx('relative flex items-center gap-1.5 px-3.5 py-3 text-xs font-medium transition-colors',
                    active ? 'text-brand-400' : 'text-zinc-500 hover:text-zinc-300')}>
                  <Icon size={12} />{label}
                  {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-brand-500 to-violet-600" />}
                </button>
              )
            })}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'summary' && (
              <div className="p-6 space-y-6">
                {t.summary && (
                  <div className="card-glow p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={13} className="text-violet-400" />
                      <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">What ForgeAI did</p>
                    </div>
                    <Markdown content={t.summary} />
                  </div>
                )}
                {(t.changes?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Files Modified</p>
                    <div className="space-y-2">
                      {t.changes.map((c, ci) => (
                        <div key={`c-${ci}-${c.path}`} className="flex items-center gap-3 card p-2.5">
                          <FileCode2 size={12} className="text-brand-400 shrink-0" />
                          <span className="text-xs text-zinc-300 font-mono flex-1 truncate">{c.path}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-emerald-400 font-mono">+{c.additions}</span>
                            <span className="text-[11px] text-red-400 font-mono">-{c.deletions}</span>
                            <div className="w-24 h-1.5 bg-surface-700 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                                style={{ width: `${Math.round(c.additions / Math.max(c.additions + c.deletions,1) * 100)}%` }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!t.summary && !t.changes?.length && (
                  <p className="text-zinc-500 text-sm text-center py-8">No summary available for this task.</p>
                )}
              </div>
            )}

            {activeTab === 'changes' && (
              <div className="divide-y divide-white/5">
                {!t.changes?.length ? (
                  <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">No file changes recorded.</div>
                ) : t.changes.map((change, ci) => (
                  <div key={`ch-${ci}-${change.path}`}>
                    <button onClick={() => setExpanded(expanded === change.path ? null : change.path)}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors">
                      <span className="text-[11px] text-emerald-400 font-mono shrink-0">+{change.additions}</span>
                      <span className="text-[11px] text-red-400 font-mono shrink-0">-{change.deletions}</span>
                      <div className="w-16 h-1 bg-surface-700 rounded-full overflow-hidden shrink-0">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                          style={{ width: `${Math.round(change.additions/Math.max(change.additions+change.deletions,1)*100)}%` }} />
                      </div>
                      <span className="flex-1 text-left text-xs text-zinc-300 font-mono truncate">{change.path}</span>
                      {expanded === change.path ? <ChevronUp size={12} className="text-zinc-600 shrink-0" /> : <ChevronDown size={12} className="text-zinc-600 shrink-0" />}
                    </button>
                    {expanded === change.path && (viewMode === 'split' ? <SplitDiff change={change} /> : <UnifiedDiff change={change} />)}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="p-4 font-mono text-xs space-y-0.5">
                {t.logs?.map((log, i) => (
                  <div key={`log-${i}`} className={clsx('flex gap-3',
                    log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-zinc-400')}>
                    <span className="text-zinc-700 shrink-0 select-none">{new Date(log.timestamp).toLocaleTimeString('en', { hour12: false })}</span>
                    <span>{log.level !== 'info' && `[${log.level.toUpperCase()}] `}{log.message}</span>
                  </div>
                ))}
                {!t.logs?.length && <p className="text-zinc-600 font-sans text-sm py-4 text-center">No logs recorded.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SplitDiff({ change }: { change: FileChange }) {
  const before = change.before.split('\n')
  const after = change.after.split('\n')
  const max = Math.max(before.length, after.length)
  return (
    <div className="font-mono text-[11px] overflow-x-auto border-t border-white/5">
      <div className="grid grid-cols-2 divide-x divide-white/5">
        <div className="bg-surface-950">
          <div className="px-3 py-1 text-[10px] text-red-400 bg-red-500/5 border-b border-white/5 font-sans sticky top-0">Before</div>
          {Array.from({ length: max }).map((_, i) => {
            const line = before[i] ?? ''
            const changed = line !== (after[i] ?? '')
            return (
              <div key={`sr-${i}`} className={clsx('flex leading-relaxed', changed && 'bg-red-500/10')}>
                <span className="select-none w-8 text-right px-2 text-zinc-700 border-r border-white/5 text-[10px] shrink-0">{i+1}</span>
                <span className={clsx('px-3 whitespace-pre', changed ? 'text-red-300/80' : 'text-zinc-500')}>{line||' '}</span>
              </div>
            )
          })}
        </div>
        <div className="bg-surface-950">
          <div className="px-3 py-1 text-[10px] text-emerald-400 bg-emerald-500/5 border-b border-white/5 font-sans sticky top-0">After</div>
          {Array.from({ length: max }).map((_, i) => {
            const line = after[i] ?? ''
            const changed = line !== (before[i] ?? '')
            return (
              <div key={`sa-${i}`} className={clsx('flex leading-relaxed', changed && 'bg-emerald-500/10')}>
                <span className="select-none w-8 text-right px-2 text-zinc-700 border-r border-white/5 text-[10px] shrink-0">{i+1}</span>
                <span className={clsx('px-3 whitespace-pre', changed ? 'text-emerald-300/80' : 'text-zinc-500')}>{line||' '}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function UnifiedDiff({ change }: { change: FileChange }) {
  const before = change.before.split('\n')
  const after = change.after.split('\n')
  const max = Math.max(before.length, after.length)
  const lines: { type: 'add'|'remove'|'same'; text: string; n: number }[] = []
  for (let i = 0; i < max; i++) {
    const b = before[i], a = after[i]
    if (b === a) { if (b !== undefined) lines.push({ type: 'same', text: b, n: i+1 }) }
    else {
      if (b !== undefined) lines.push({ type: 'remove', text: b, n: i+1 })
      if (a !== undefined) lines.push({ type: 'add', text: a, n: i+1 })
    }
  }
  return (
    <div className="font-mono text-[11px] overflow-x-auto border-t border-white/5 bg-surface-950">
      {lines.map((l, i) => (
        <div key={`uf-${i}`} className={clsx('flex leading-relaxed',
          l.type === 'add' && 'bg-emerald-500/10', l.type === 'remove' && 'bg-red-500/10')}>
          <span className="select-none w-5 text-center text-[10px] border-r border-white/5 shrink-0 text-zinc-600">
            {l.type === 'add' ? '+' : l.type === 'remove' ? '-' : ' '}
          </span>
          <span className="select-none w-7 text-right px-1 text-zinc-700 border-r border-white/5 text-[10px] shrink-0">{l.n}</span>
          <span className={clsx('px-3 whitespace-pre',
            l.type === 'add' ? 'text-emerald-300/80' : l.type === 'remove' ? 'text-red-300/80' : 'text-zinc-500')}>{l.text||' '}</span>
        </div>
      ))}
    </div>
  )
}

function StatusIcon({ status, large }: { status: string; large?: boolean }) {
  const size = large ? 18 : 15
  const wrap = (icon: React.ReactNode, gradient: string) => large ? (
    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-lg`}>{icon}</div>
  ) : icon
  if (status === 'completed') return <>{wrap(<CheckCircle2 size={size} className={large ? 'text-white' : 'text-emerald-400 shrink-0'} />, 'from-emerald-500 to-teal-500')}</>
  if (status === 'failed') return <>{wrap(<XCircle size={size} className={large ? 'text-white' : 'text-red-400 shrink-0'} />, 'from-red-500 to-rose-500')}</>
  if (status === 'running') return <>{wrap(<Zap size={size} className={clsx(large ? 'text-white' : 'text-brand-400 shrink-0', 'animate-pulse')} />, 'from-brand-500 to-violet-600')}</>
  return <>{wrap(<Clock size={size} className={large ? 'text-white' : 'text-zinc-500 shrink-0'} />, 'from-zinc-600 to-zinc-700')}</>
}