// Data/BI dashboards — list of all dashboards the user has built.
// Companion to the AI Builder page but for uploaded/live data instead of
// prompt-generated websites.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { BarChart3, Plus, Loader2, RefreshCw, Trash2, Sheet, CreditCard, FileSpreadsheet, Clock, AlertCircle, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface DashboardRow {
  id: string
  name: string
  status: 'idle' | 'cloning' | 'ready' | 'error'
  errorMessage?: string
  dashboardSource: {
    kind: 'upload' | 'google_sheet' | 'stripe'
    refreshCron: string | null
    lastRefreshAt?: string
    lastBuild?: { rowsIn: number; rowsOut: number; warnings: number; errors: number; at: string }
  } | null
  hostedUrl: string
  updatedAt: string
}

const SOURCE_ICON: Record<string, any> = {
  upload: FileSpreadsheet,
  google_sheet: Sheet,
  stripe: CreditCard,
}

const SOURCE_LABEL: Record<string, string> = {
  upload: 'CSV / Excel upload',
  google_sheet: 'Google Sheet',
  stripe: 'Stripe',
}

export default function Dashboards() {
  const nav = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<DashboardRow[]>({
    queryKey: ['dashboards'],
    queryFn: () => api.get('/dashboard').then((r) => r.data),
    refetchInterval: 5000, // catch scheduled-refresh completions
  })

  const refresh = useMutation({
    mutationFn: (id: string) => api.post(`/dashboard/${id}/refresh`),
    onSuccess: () => { toast.success('Refresh queued'); qc.invalidateQueries({ queryKey: ['dashboards'] }) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Refresh failed'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/dashboard/${id}`),
    onSuccess: () => { toast.success('Dashboard deleted'); qc.invalidateQueries({ queryKey: ['dashboards'] }) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Delete failed'),
  })

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6 text-emerald-400" />Data Dashboards</h1>
          <p className="text-sm text-neutral-400 mt-1">Upload a CSV/Excel, connect a Google Sheet or Stripe account, get a hosted dashboard.</p>
        </div>
        <button
          onClick={() => nav('/dashboards/new')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-medium"
        >
          <Plus className="w-4 h-4" />New dashboard
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neutral-500" /></div>
      ) : !data?.length ? (
        <div className="border border-dashed border-neutral-800 rounded-xl p-12 text-center bg-neutral-900/40">
          <BarChart3 className="w-10 h-10 mx-auto mb-4 text-neutral-600" />
          <div className="text-neutral-300 mb-2">No dashboards yet</div>
          <div className="text-sm text-neutral-500 mb-6">Turn any data source into a hosted, shareable dashboard in under a minute.</div>
          <button onClick={() => nav('/dashboards/new')} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-medium">
            Build your first dashboard
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {data.map((d) => {
            const Icon = d.dashboardSource ? SOURCE_ICON[d.dashboardSource.kind] : BarChart3
            const label = d.dashboardSource ? SOURCE_LABEL[d.dashboardSource.kind] : 'unknown'
            const busy = d.status === 'cloning'
            const build = d.dashboardSource?.lastBuild
            return (
              <Link
                key={d.id}
                to={`/dashboards/${d.id}`}
                className="group bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center gap-4 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium truncate">{d.name}</div>
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />}
                    {d.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                    {d.status === 'ready' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <div className="text-xs text-neutral-500 mt-1 flex items-center gap-3 flex-wrap">
                    <span>{label}</span>
                    {build && <span>{build.rowsOut.toLocaleString()} rows</span>}
                    {build && build.errors > 0 && <span className="text-red-400">{build.errors} err</span>}
                    {build && build.warnings > 0 && <span className="text-amber-400">{build.warnings} warn</span>}
                    {d.dashboardSource?.refreshCron && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{d.dashboardSource.refreshCron}</span>}
                    <span>updated {relativeTime(d.updatedAt)}</span>
                  </div>
                  {d.status === 'error' && d.errorMessage && (
                    <div className="text-xs text-red-400 mt-1 line-clamp-1">{d.errorMessage}</div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); refresh.mutate(d.id) }}
                  disabled={busy}
                  className="p-2 rounded hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 disabled:opacity-40"
                  title="Refresh now"
                >
                  <RefreshCw className={busy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirm(`Delete "${d.name}"? This cannot be undone.`)) remove.mutate(d.id) }}
                  className="p-2 rounded hover:bg-neutral-800 text-neutral-400 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </Link>
            )
          })}
        </div>
      )}
    </div>
    </div>
  )
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
