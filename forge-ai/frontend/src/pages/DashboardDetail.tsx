// Dashboard detail page: live task log while it builds, then the built
// dashboard is iframed in. Refresh + schedule controls live in the sidebar.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { RefreshCw, Clock, ExternalLink, Loader2, AlertCircle, CheckCircle2, Save, Info, Link2, Copy, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

interface DashboardDetail {
  id: string
  name: string
  status: 'idle' | 'cloning' | 'ready' | 'error'
  errorMessage?: string
  dashboardSource: {
    kind: 'upload' | 'google_sheet' | 'stripe'
    refreshCron: string | null
    lastRefreshAt?: string
    lastBuild?: { rowsIn: number; rowsOut: number; warnings: number; errors: number; at: string }
    userPrompt?: string
    theme?: 'dark' | 'exec'
    vertical?: string
  } | null
  hostedUrl: string
}

interface TaskDoc {
  _id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  logs: { level: string; message: string; timestamp: string }[]
  summary?: string
  error?: string
  type: string
  repositoryId: string
}

const CRON_PRESETS: { label: string; value: string | null }[] = [
  { label: 'Manual only', value: null },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 06:00', value: '0 6 * * *' },
  { label: 'Weekdays at 09:00', value: '0 9 * * 1-5' },
  { label: 'Weekly Monday 08:00', value: '0 8 * * 1' },
]

export default function DashboardDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [liveTask, setLiveTask] = useState<TaskDoc | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  const { data: dash } = useQuery<DashboardDetail>({
    queryKey: ['dashboard', id],
    queryFn: () => api.get(`/dashboard/${id}`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === 'ready' ? false : 3000),
  })

  // Pull the most recent build_dashboard task for this repo so we can show
  // progress on page load (not just via a socket event we might miss).
  const { data: recentTask } = useQuery<TaskDoc | null>({
    queryKey: ['dashboard-task', id],
    queryFn: () =>
      api.get(`/tasks?repositoryId=${id}&limit=1`).then((r) => (r.data.tasks?.[0] ?? null)).catch(() => null),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && ['pending', 'running'].includes(q.state.data.status) ? 2000 : false),
  })

  const task = liveTask ?? recentTask
  const isBuilding = task && (task.status === 'pending' || task.status === 'running')

  // Subscribe to the task WS just like Builder.tsx does
  useEffect(() => {
    const taskId = task?._id
    if (!taskId) return
    const socket = getSocket()
    socket.emit('subscribe:task', taskId)
    const handler = (updated: TaskDoc) => {
      if (updated._id !== taskId) return
      setLiveTask(updated)
      if (updated.status === 'completed' || updated.status === 'failed') {
        qc.invalidateQueries({ queryKey: ['dashboard', id] })
      }
    }
    socket.on('task:update', handler)
    return () => { socket.off('task:update', handler); socket.emit('unsubscribe:task', taskId) }
  }, [task?._id, id, qc])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [task?.logs?.length])

  const refresh = useMutation({
    mutationFn: () => api.post(`/dashboard/${id}/refresh`),
    onSuccess: () => { toast.success('Refresh queued'); qc.invalidateQueries({ queryKey: ['dashboard-task', id] }) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Refresh failed'),
  })

  const [cronDraft, setCronDraft] = useState<string | null>(dash?.dashboardSource?.refreshCron ?? null)
  useEffect(() => { setCronDraft(dash?.dashboardSource?.refreshCron ?? null) }, [dash?.dashboardSource?.refreshCron])

  const setSchedule = useMutation({
    mutationFn: (cron: string | null) => api.patch(`/dashboard/${id}/schedule`, { cron }),
    onSuccess: () => { toast.success('Schedule saved'); qc.invalidateQueries({ queryKey: ['dashboard', id] }) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  })

  const [promptDraft, setPromptDraft] = useState<string>(dash?.dashboardSource?.userPrompt ?? '')
  useEffect(() => { setPromptDraft(dash?.dashboardSource?.userPrompt ?? '') }, [dash?.dashboardSource?.userPrompt])

  const setPrompt = useMutation({
    mutationFn: (prompt: string) => api.patch(`/dashboard/${id}/prompt`, { prompt }),
    onSuccess: () => { toast.success('Prompt saved — hit Refresh to apply it'); qc.invalidateQueries({ queryKey: ['dashboard', id] }) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  })

  const setTheme = useMutation({
    mutationFn: (theme: 'dark' | 'exec') => api.patch(`/dashboard/${id}/theme`, { theme }),
    onSuccess: () => { toast.success('Theme saved — hit Refresh to apply'); qc.invalidateQueries({ queryKey: ['dashboard', id] }) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  })

  // Absolute URL for the iframe — pointing at the backend static-serve mount.
  const iframeSrc = useMemo(() => {
    if (!dash?.hostedUrl) return null
    const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/api\/?$/, '') ?? 'http://localhost:4000'
    return `${apiBase}${dash.hostedUrl}`
  }, [dash?.hostedUrl])

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{dash?.name ?? 'Loading…'}</h1>
          <div className="text-xs text-neutral-500 mt-1 flex items-center gap-3">
            {dash?.dashboardSource?.kind && <span>Source: {dash.dashboardSource.kind}</span>}
            {dash?.dashboardSource?.lastBuild && <span>· {dash.dashboardSource.lastBuild.rowsOut.toLocaleString()} rows</span>}
            {dash?.status === 'ready' && <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3 h-3" />ready</span>}
            {isBuilding && <span className="inline-flex items-center gap-1 text-emerald-400"><Loader2 className="w-3 h-3 animate-spin" />building</span>}
            {dash?.status === 'error' && <span className="inline-flex items-center gap-1 text-red-400"><AlertCircle className="w-3 h-3" />error</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {iframeSrc && (
            <a href={iframeSrc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-neutral-800 hover:bg-neutral-900">
              <ExternalLink className="w-4 h-4" />Open
            </a>
          )}
          <button
            onClick={() => refresh.mutate()}
            disabled={isBuilding || refresh.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-medium disabled:opacity-40"
          >
            <RefreshCw className={isBuilding ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />Refresh
          </button>
        </div>
      </div>

      {/* ── Live URL banner — dashboards are hosted directly, no external deploy needed ── */}
      {iframeSrc && dash?.status === 'ready' && (
        <div className="mb-4 bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
            <Link2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-emerald-400/80 font-medium uppercase tracking-wider">Live dashboard URL</div>
            <div className="text-sm font-mono text-neutral-200 truncate">{iframeSrc}</div>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(iframeSrc); toast.success('Link copied') }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-300"
          >
            <Copy className="w-3.5 h-3.5" />Copy
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* ── main ── */}
        <div>
          {isBuilding ? (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <div className="text-sm font-medium">Building dashboard… {task?.progress ?? 0}%</div>
              </div>
              <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${task?.progress ?? 0}%` }} />
              </div>
              <div className="mt-4 max-h-80 overflow-y-auto text-xs font-mono space-y-1">
                {task?.logs?.map((l, i) => (
                  <div key={i} className={clsx(
                    l.level === 'error' ? 'text-red-400' :
                    l.level === 'warn' ? 'text-amber-400' :
                    'text-neutral-400',
                  )}>{l.message}</div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          ) : dash?.status === 'error' ? (
            <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-400 font-medium mb-2"><AlertCircle className="w-4 h-4" />Build failed</div>
              <div className="text-sm text-red-300">{dash.errorMessage}</div>
              <button onClick={() => refresh.mutate()} className="mt-3 text-sm px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" />Try again</button>
            </div>
          ) : iframeSrc ? (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl overflow-hidden">
              <iframe src={iframeSrc} className="w-full h-[calc(100vh-220px)] bg-white" title={dash?.name ?? 'dashboard'} />
            </div>
          ) : (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-8 text-center text-neutral-500 text-sm">Loading dashboard…</div>
          )}
        </div>

        {/* ── sidebar ── */}
        <aside className="space-y-4">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm font-medium mb-2"><Sparkles className="w-4 h-4 text-emerald-400" />Requirements</div>
            <p className="text-xs text-neutral-500 mb-2">Describe what this dashboard should focus on. The AI planner uses this on every refresh.</p>
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={4}
              placeholder="e.g. Monthly revenue, top products, return rate. Highlight drops over 20%."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none resize-y"
            />
            <button
              onClick={() => setPrompt.mutate(promptDraft)}
              disabled={setPrompt.isPending || promptDraft === (dash?.dashboardSource?.userPrompt ?? '')}
              className="mt-2 w-full py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 text-sm font-medium inline-flex items-center justify-center gap-1"
            >
              <Save className="w-3.5 h-3.5" />Save requirements
            </button>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm font-medium mb-3">🎨 Theme</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme.mutate('dark')}
                disabled={dash?.dashboardSource?.theme === 'dark' || setTheme.isPending}
                className={clsx('py-2 px-3 rounded-lg text-xs font-medium border', dash?.dashboardSource?.theme === 'dark' ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700')}
              >
                🌑 Dark
              </button>
              <button
                onClick={() => setTheme.mutate('exec')}
                disabled={dash?.dashboardSource?.theme === 'exec' || setTheme.isPending}
                className={clsx('py-2 px-3 rounded-lg text-xs font-medium border', dash?.dashboardSource?.theme === 'exec' ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700')}
              >
                💼 Exec
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-2">Refresh after switching.</p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-sm font-medium mb-3"><Clock className="w-4 h-4 text-emerald-400" />Schedule</div>
            <div className="space-y-2">
              {CRON_PRESETS.map((p) => (
                <label key={p.label} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="cron"
                    checked={cronDraft === p.value}
                    onChange={() => setCronDraft(p.value)}
                    className="accent-emerald-500"
                  />
                  <span>{p.label}</span>
                  {p.value && <span className="text-xs text-neutral-500 font-mono ml-auto">{p.value}</span>}
                </label>
              ))}
            </div>
            <button
              onClick={() => setSchedule.mutate(cronDraft)}
              disabled={setSchedule.isPending || cronDraft === dash?.dashboardSource?.refreshCron}
              className="mt-3 w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-black text-sm font-medium inline-flex items-center justify-center gap-1"
            >
              <Save className="w-4 h-4" />Save schedule
            </button>
            {dash?.dashboardSource?.lastRefreshAt && (
              <div className="text-xs text-neutral-500 mt-2">Last refresh: {new Date(dash.dashboardSource.lastRefreshAt).toLocaleString()}</div>
            )}
          </div>

          {dash?.dashboardSource?.lastBuild && (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 text-sm space-y-1">
              <div className="flex items-center gap-2 font-medium mb-2"><Info className="w-4 h-4 text-emerald-400" />Last build</div>
              <Row label="Rows in"     value={dash.dashboardSource.lastBuild.rowsIn.toLocaleString()} />
              <Row label="Rows out"    value={dash.dashboardSource.lastBuild.rowsOut.toLocaleString()} />
              <Row label="Warnings"    value={dash.dashboardSource.lastBuild.warnings} color={dash.dashboardSource.lastBuild.warnings ? 'amber' : 'neutral'} />
              <Row label="Errors"      value={dash.dashboardSource.lastBuild.errors} color={dash.dashboardSource.lastBuild.errors ? 'red' : 'neutral'} />
              <Row label="At"          value={new Date(dash.dashboardSource.lastBuild.at).toLocaleString()} />
            </div>
          )}
        </aside>
      </div>
    </div>
    </div>
  )
}

function Row({ label, value, color = 'neutral' as 'neutral' | 'amber' | 'red' }: { label: string; value: string | number; color?: 'neutral' | 'amber' | 'red' }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className={clsx(color === 'amber' && 'text-amber-400', color === 'red' && 'text-red-400')}>{value}</span>
    </div>
  )
}
