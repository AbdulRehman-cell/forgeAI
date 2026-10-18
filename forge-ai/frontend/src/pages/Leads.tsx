import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Mail, Phone, MessageSquare, Eye, Trash2, Globe, RefreshCw,
  Inbox, Download, Search, StickyNote, ChevronDown, CheckSquare,
  Square, Users, TrendingUp, UserCheck, Send, Zap, X,
  BarChart3, Kanban, List, Star, DollarSign, Building2,
  Calendar, Clock, Upload, Webhook, Sparkles, Activity,
  AlertTriangle, Target, ArrowUpRight, Flame,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────
type LeadStatus = 'new' | 'qualified' | 'contacted' | 'proposal' | 'converted' | 'lost'
type LeadPriority = 'low' | 'medium' | 'high' | 'urgent'
type ActivityType = 'note' | 'call' | 'email' | 'meeting' | 'status_change'
type ViewMode = 'list' | 'kanban' | 'analytics'

interface LeadActivity { type: ActivityType; body: string; createdAt: string }
interface Lead {
  _id: string; name: string; email: string; phone?: string; message?: string
  source?: string; read: boolean; status: LeadStatus; priority: LeadPriority
  score: number; tags: string[]; dealValue?: number; company?: string
  jobTitle?: string; notes?: string; followUpAt?: string; followUpNote?: string
  activities: LeadActivity[]; utmSource?: string; utmMedium?: string
  utmCampaign?: string; createdAt: string
  siteRepositoryId?: { _id: string; name: string }
}
interface Stats {
  total: number; thisWeek: number; unreadCount: number
  byStatus: Record<LeadStatus, number>
  bySite: { _id: string; name: string; count: number }[]
}
interface Analytics {
  total: number; conversionRate: number; avgTimeToClose: number
  avgScore: number; totalValue: number
  funnel: { stage: string; count: number; rate: number }[]
  bySource: { _id: string; count: number; converted: number; totalValue: number }[]
  byWeek: { _id: string; count: number; converted: number }[]
  byPriority: Record<LeadPriority, number>
}
interface PipelineColumn { status: string; leads: Lead[]; count: number; totalValue: number }

// ─── Constants ────────────────────────────────────────────────
const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string; border: string; col: string }> = {
  new:       { label: 'New',       color: 'text-brand-300',  bg: 'bg-brand-500/15',   border: 'border-brand-500/40',  col: 'bg-brand-500/10' },
  qualified: { label: 'Qualified', color: 'text-violet-300', bg: 'bg-violet-500/15',  border: 'border-violet-500/40', col: 'bg-violet-500/10' },
  contacted: { label: 'Contacted', color: 'text-yellow-300', bg: 'bg-yellow-500/15',  border: 'border-yellow-500/40', col: 'bg-yellow-500/10' },
  proposal:  { label: 'Proposal',  color: 'text-orange-300', bg: 'bg-orange-500/15',  border: 'border-orange-500/40', col: 'bg-orange-500/10' },
  converted: { label: 'Converted', color: 'text-green-300',  bg: 'bg-green-500/15',   border: 'border-green-500/40',  col: 'bg-green-500/10' },
  lost:      { label: 'Lost',      color: 'text-zinc-400',   bg: 'bg-zinc-500/15',    border: 'border-zinc-500/30',   col: 'bg-zinc-500/10' },
}

const PRIORITY_CONFIG: Record<LeadPriority, { label: string; color: string; icon: string; border: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-400',    icon: '🔴', border: 'border-l-red-500' },
  high:   { label: 'High',   color: 'text-amber-400',  icon: '🟠', border: 'border-l-amber-500' },
  medium: { label: 'Medium', color: 'text-brand-400',  icon: '🔵', border: 'border-l-brand-500' },
  low:    { label: 'Low',    color: 'text-zinc-500',   icon: '⚪', border: 'border-l-zinc-600' },
}

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  note: '📝', call: '📞', email: '✉️', meeting: '🤝', status_change: '🔄',
}

// ─── Helpers ──────────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 70) return 'text-red-400 bg-red-500/15 border-red-500/30'
  if (s >= 50) return 'text-amber-400 bg-amber-500/15 border-amber-500/30'
  if (s >= 30) return 'text-brand-400 bg-brand-500/15 border-brand-500/30'
  return 'text-zinc-500 bg-zinc-500/10 border-zinc-600/30'
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isOverdue(date: string) { return new Date(date) < new Date() }

// ─── Score Badge ──────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={clsx('inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border', scoreColor(score))}>
      {score}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────
export default function Leads() {
  const qc = useQueryClient()

  // View & filters
  const [view, setView] = useState<ViewMode>('list')
  const [siteFilter, setSiteFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Per-lead expansion
  const [expandedLead, setExpandedLead] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<'notes' | 'timeline' | 'followup' | 'enrich' | null>(null)
  const [noteText, setNoteText] = useState<Record<string, string>>({})
  const [tagInput, setTagInput] = useState<Record<string, string>>({})
  const [followUpDraft, setFollowUpDraft] = useState<Record<string, { date: string; note: string }>>({})
  const [activityDraft, setActivityDraft] = useState<{ type: ActivityType; body: string }>({ type: 'note', body: '' })

  // Kanban drag
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

  // Modals
  const [smartReplyLead, setSmartReplyLead] = useState<Lead | null>(null)
  const [smartReplyData, setSmartReplyData] = useState<{ subject: string; body: string } | null>(null)
  const [smartReplyLoading, setSmartReplyLoading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importCsv, setImportCsv] = useState('')
  const [importSite, setImportSite] = useState('')
  const [importPreview, setImportPreview] = useState<string[][]>([])
  const [showWebhook, setShowWebhook] = useState(false)
  const [webhookDraft, setWebhookDraft] = useState('')
  const [showAutoReplyEditor, setShowAutoReplyEditor] = useState(false)
  const [replyTemplate, setReplyTemplate] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Queries ──────────────────────────────────────────────────
  const { data: stats } = useQuery<Stats>({
    queryKey: ['leads-stats'],
    queryFn: () => api.get('/leads/stats').then(r => r.data),
    staleTime: 30_000,
  })

  const { data: analytics } = useQuery<Analytics>({
    queryKey: ['leads-analytics'],
    queryFn: () => api.get('/leads/analytics').then(r => r.data),
    staleTime: 60_000,
    enabled: view === 'analytics',
  })

  const { data: pipeline } = useQuery<{ columns: PipelineColumn[] }>({
    queryKey: ['leads-pipeline'],
    queryFn: () => api.get('/leads/pipeline').then(r => r.data),
    staleTime: 30_000,
    enabled: view === 'kanban',
  })

  const { data: followUps } = useQuery<{ leads: Lead[] }>({
    queryKey: ['leads-follow-ups'],
    queryFn: () => api.get('/leads/follow-ups').then(r => r.data),
    staleTime: 60_000,
  })

  const { data: gmailStatus } = useQuery({
    queryKey: ['gmail-status'],
    queryFn: () => api.get('/gmail/status').then(r => r.data as { connected: boolean; email: string | null }),
    staleTime: 60_000,
  })

  const { data: autoReplySettings, refetch: refetchSettings } = useQuery({
    queryKey: ['lead-auto-reply'],
    queryFn: () => api.get('/gmail/lead-settings').then(r => r.data as { autoReply: boolean; template: string; gmailEmail: string | null }),
    staleTime: 30_000,
  })

  const { data: webhookSettings } = useQuery({
    queryKey: ['leads-webhook'],
    queryFn: () => api.get('/leads/webhook-settings').then(r => r.data as { webhookUrl: string }),
    staleTime: 60_000,
    enabled: showWebhook,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['leads', siteFilter, statusFilter, priorityFilter, unreadOnly, debouncedSearch, sortBy],
    queryFn: () => api.get('/leads', {
      params: {
        siteId: siteFilter || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        unread: unreadOnly || undefined,
        search: debouncedSearch || undefined,
        sort: sortBy,
      },
    }).then(r => r.data as { leads: Lead[]; total: number }),
  })

  // ── Mutations ─────────────────────────────────────────────────
  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['leads'] })
    qc.invalidateQueries({ queryKey: ['leads-stats'] })
    qc.invalidateQueries({ queryKey: ['leads-pipeline'] })
    qc.invalidateQueries({ queryKey: ['leads-follow-ups'] })
  }, [qc])

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/leads/${id}`, body).then(r => r.data),
    onSuccess: invalidate,
  })

  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) => api.patch('/leads/read', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/leads/${id}`),
    onSuccess: () => { toast.success('Lead deleted'); invalidate() },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.delete('/leads/bulk', { data: { ids } }),
    onSuccess: (_d, ids) => {
      toast.success(`${ids.length} lead${ids.length > 1 ? 's' : ''} deleted`)
      setSelected(new Set()); invalidate()
    },
  })

  const addActivityMutation = useMutation({
    mutationFn: ({ id, type, body }: { id: string; type: string; body: string }) =>
      api.post(`/leads/${id}/activity`, { type, body }).then(r => r.data),
    onSuccess: () => { toast.success('Activity logged'); invalidate() },
  })

  const importMutation = useMutation({
    mutationFn: (body: { csv: string; siteId: string }) => api.post('/leads/import', body).then(r => r.data),
    onSuccess: (d) => {
      toast.success(`Imported ${d.imported} leads!`)
      setShowImport(false); setImportCsv(''); setImportPreview([])
      invalidate()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Import failed'),
  })

  const saveWebhookMutation = useMutation({
    mutationFn: (webhookUrl: string) => api.put('/leads/webhook-settings', { webhookUrl }),
    onSuccess: () => { toast.success('Webhook saved'); setShowWebhook(false); qc.invalidateQueries({ queryKey: ['leads-webhook'] }) },
    onError: () => toast.error('Could not save webhook'),
  })

  const saveAutoReplyMutation = useMutation({
    mutationFn: (body: { autoReply?: boolean; template?: string }) => api.put('/gmail/lead-settings', body),
    onSuccess: () => { toast.success('Auto-reply settings saved'); refetchSettings() },
    onError: () => toast.error('Could not save settings'),
  })

  const gmailSendMutation = useMutation({
    mutationFn: (body: { to: string; subject: string; body: string }) =>
      api.post('/gmail/send', body).then(r => r.data),
    onSuccess: (_d, vars) => { toast.success(`Sent to ${vars.to}`); setSmartReplyLead(null); setSmartReplyData(null) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Send failed'),
  })

  // ── Computed values ───────────────────────────────────────────
  const leads = data?.leads ?? []
  const total = data?.total ?? 0
  const allSelected = leads.length > 0 && leads.every(l => selected.has(l._id))
  const dueFollowUps = followUps?.leads.filter(l => isOverdue(l.followUpAt!)) ?? []

  // ── Handlers ─────────────────────────────────────────────────
  function handleSearchChange(v: string) {
    setSearch(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(v), 300)
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleExpandLead(id: string, section: typeof expandedSection) {
    if (expandedLead === id && expandedSection === section) {
      setExpandedLead(null); setExpandedSection(null)
    } else {
      setExpandedLead(id); setExpandedSection(section)
    }
  }

  function addTag(lead: Lead, tagValue: string) {
    const t = tagValue.trim()
    if (!t || lead.tags?.includes(t)) return
    updateMutation.mutate({ id: lead._id, tags: [...(lead.tags ?? []), t] })
    setTagInput(p => ({ ...p, [lead._id]: '' }))
  }

  function removeTag(lead: Lead, tag: string) {
    updateMutation.mutate({ id: lead._id, tags: (lead.tags ?? []).filter(t => t !== tag) })
  }

  function exportCSV() {
    const params = new URLSearchParams()
    if (siteFilter) params.set('siteId', siteFilter)
    if (statusFilter) params.set('status', statusFilter)
    const token = JSON.parse(localStorage.getItem('forge-auth') ?? '{}')?.state?.token ?? ''
    const url = `${import.meta.env.VITE_API_URL || '/api'}/leads/export?${params}`
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'leads.csv'
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        toast.success('CSV downloaded')
      })
  }

  function handleFileUpload(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setImportCsv(text)
      const lines = text.split('\n').filter(Boolean)
      setImportPreview(lines.slice(0, 4).map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim())))
    }
    reader.readAsText(file)
  }

  async function triggerSmartReply(lead: Lead) {
    setSmartReplyLead(lead)
    setSmartReplyData(null)
    setSmartReplyLoading(true)
    try {
      const { data } = await api.post(`/leads/${lead._id}/smart-reply`)
      setSmartReplyData({ subject: data.subject, body: data.body })
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Smart reply failed')
      setSmartReplyLead(null)
    } finally {
      setSmartReplyLoading(false)
    }
  }

  // ── Kanban DnD ───────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData('leadId', id)
    setDraggingId(id)
  }

  function onDrop(e: React.DragEvent, status: string) {
    e.preventDefault()
    const id = e.dataTransfer.getData('leadId')
    if (id) {
      updateMutation.mutate({ id, status })
      qc.invalidateQueries({ queryKey: ['leads-pipeline'] })
    }
    setDragOverStatus(null); setDraggingId(null)
  }

  // ─── RENDER ───────────────────────────────────────────────────
  return (
    <>
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="border-b border-white/5 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
              <Inbox size={20} className="text-brand-400" />
              Lead Pipeline
              {(stats?.unreadCount ?? 0) > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-500 text-white">
                  {stats!.unreadCount}
                </span>
              )}
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">{stats?.total ?? 0} leads · {stats?.thisWeek ?? 0} this week</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex items-center gap-0.5 bg-surface-900 border border-white/5 rounded-lg p-0.5">
              {([
                { v: 'list' as ViewMode, icon: List, label: 'List' },
                { v: 'kanban' as ViewMode, icon: Kanban, label: 'Kanban' },
                { v: 'analytics' as ViewMode, icon: BarChart3, label: 'Analytics' },
              ] as const).map(({ v, icon: Icon, label }) => (
                <button key={v} onClick={() => setView(v)}
                  className={clsx('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors',
                    view === v ? 'bg-brand-500/20 text-brand-300' : 'text-zinc-500 hover:text-zinc-300'
                  )}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            {/* Auto-reply */}
            {gmailStatus?.connected && (
              <button
                onClick={() => {
                  const next = !autoReplySettings?.autoReply
                  if (next && !autoReplySettings?.template) setShowAutoReplyEditor(true)
                  saveAutoReplyMutation.mutate({ autoReply: next })
                }}
                className={clsx('flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors',
                  autoReplySettings?.autoReply
                    ? 'border-green-500/40 bg-green-500/10 text-green-300'
                    : 'border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                )}
              >
                <Zap size={12} className={autoReplySettings?.autoReply ? 'text-green-400' : ''} />
                {autoReplySettings?.autoReply ? 'Auto-reply ON' : 'Auto-reply OFF'}
              </button>
            )}
            {!gmailStatus?.connected && (
              <a href="/settings" className="text-xs text-zinc-600 hover:text-brand-400 transition-colors">Connect Gmail →</a>
            )}

            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors">
              <Upload size={13} /> Import
            </button>

            <button onClick={() => { setShowWebhook(true); setWebhookDraft(webhookSettings?.webhookUrl ?? '') }}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors">
              <Webhook size={13} /> Webhook
            </button>

            <button onClick={exportCSV}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors">
              <Download size={13} /> Export
            </button>

            <button onClick={() => invalidate()}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Follow-up alert banner ── */}
      {dueFollowUps.length > 0 && (
        <div className="mx-6 mt-4 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 shrink-0">
          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
          <span className="text-sm text-amber-300 font-medium">{dueFollowUps.length} follow-up{dueFollowUps.length > 1 ? 's' : ''} overdue</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            {dueFollowUps.slice(0, 3).map(l => (
              <button key={l._id} onClick={() => { setView('list'); setExpandedLead(l._id); setExpandedSection('followup') }}
                className="text-xs text-amber-400 hover:text-amber-200 underline underline-offset-2">
                {l.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content area ── */}
      <div className="flex-1 overflow-hidden">

        {/* ════════════════ LIST VIEW ════════════════ */}
        {view === 'list' && (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Stats bar */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 pt-4 pb-2 shrink-0">
                {[
                  { icon: Users, label: 'Total', value: stats.total, sub: `+${stats.thisWeek} this week`, color: 'text-brand-400' },
                  { icon: Target, label: 'New', value: stats.byStatus.new ?? 0, color: 'text-brand-300' },
                  { icon: TrendingUp, label: 'In Pipeline', value: (stats.byStatus.qualified ?? 0) + (stats.byStatus.contacted ?? 0) + (stats.byStatus.proposal ?? 0), color: 'text-yellow-400' },
                  { icon: UserCheck, label: 'Converted', value: stats.byStatus.converted ?? 0, color: 'text-green-400' },
                ].map(({ icon: Icon, label, value, sub, color }) => (
                  <div key={label} className="glass rounded-xl p-4 border border-white/5">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={14} className={color} />
                      <span className="text-xs text-zinc-500">{label}</span>
                    </div>
                    <p className="text-2xl font-bold text-zinc-100">{value}</p>
                    {sub && <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Filters */}
            <div className="px-6 py-2 flex flex-wrap gap-2 items-center shrink-0">
              <div className="relative flex-1 min-w-40">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input className="input pl-8 py-1.5 text-sm w-full" placeholder="Search name, email, company…"
                  value={search} onChange={e => handleSearchChange(e.target.value)} />
              </div>
              {stats?.bySite && stats.bySite.length > 1 && (
                <select className="input py-1.5 text-sm" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
                  <option value="">All sites</option>
                  {stats.bySite.map(s => <option key={s._id} value={s._id}>{s.name} ({s.count})</option>)}
                </select>
              )}
              <select className="input py-1.5 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
              <select className="input py-1.5 text-sm" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
                <option value="">All priorities</option>
                {(Object.keys(PRIORITY_CONFIG) as LeadPriority[]).map(p => (
                  <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                ))}
              </select>
              <select className="input py-1.5 text-sm" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="score">By score</option>
                <option value="value">By deal value</option>
                <option value="followup">By follow-up</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)}
                  className="rounded border-zinc-700 bg-surface-800 text-brand-500" />
                Unread
              </label>
            </div>

            {/* Bulk actions */}
            {selected.size > 0 && (
              <div className="mx-6 mb-2 px-4 py-2 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-center gap-3 shrink-0">
                <span className="text-sm text-brand-300 font-medium">{selected.size} selected</span>
                <button onClick={() => markReadMutation.mutate([...selected])}
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 ml-2">
                  <Eye size={12} /> Mark read
                </button>
                <button onClick={() => bulkDeleteMutation.mutate([...selected])}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 ml-auto">
                  <Trash2 size={12} /> Delete
                </button>
                <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
              </div>
            )}

            {/* Lead list */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : leads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-60 text-zinc-500">
                  <Inbox size={40} className="mb-3 opacity-30" />
                  <p className="text-sm">No leads found.</p>
                  <p className="text-xs mt-1 text-zinc-600">Contact forms on your built sites appear here.</p>
                </div>
              ) : (
                <div className="space-y-2 max-w-4xl">
                  <div className="flex items-center gap-2 px-1 mb-1">
                    <button onClick={() => { if (allSelected) setSelected(new Set()); else setSelected(new Set(leads.map(l => l._id))) }}
                      className="text-zinc-500 hover:text-zinc-300 transition-colors">
                      {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                    </button>
                    <span className="text-xs text-zinc-600">{total} total · {leads.length} shown</span>
                    {(stats?.unreadCount ?? 0) > 0 && (
                      <button onClick={() => markReadMutation.mutate(leads.filter(l => !l.read).map(l => l._id))}
                        className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 ml-2">
                        <Eye size={12} /> Mark all read
                      </button>
                    )}
                  </div>

                  {leads.map(lead => {
                    const sc = STATUS_CONFIG[lead.status ?? 'new']
                    const pc = PRIORITY_CONFIG[lead.priority ?? 'medium']
                    const isOpen = expandedLead === lead._id
                    const hasFollowUpOverdue = lead.followUpAt && isOverdue(lead.followUpAt)

                    return (
                      <div key={lead._id}
                        className={clsx(
                          'glass rounded-xl border-l-4 border border-white/5 transition-all',
                          pc.border,
                          !lead.read && 'bg-brand-500/5 border-brand-500/20',
                          selected.has(lead._id) && 'ring-1 ring-brand-500/40',
                        )}>
                        <div className="flex items-start gap-3 p-4">
                          {/* Checkbox */}
                          <button onClick={() => toggleSelect(lead._id)} className="mt-0.5 shrink-0 text-zinc-500 hover:text-brand-400">
                            {selected.has(lead._id) ? <CheckSquare size={15} className="text-brand-400" /> : <Square size={15} />}
                          </button>

                          {/* Avatar */}
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                            {lead.name[0]?.toUpperCase()}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-zinc-100">{lead.name}</span>
                              {!lead.read && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-500 text-white">NEW</span>}
                              <ScoreBadge score={lead.score} />
                              {lead.siteRepositoryId && (
                                <span className="text-xs text-zinc-500 flex items-center gap-1">
                                  <Globe size={11} /> {lead.siteRepositoryId.name}
                                </span>
                              )}
                              {hasFollowUpOverdue && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 flex items-center gap-1">
                                  <AlertTriangle size={9} /> Follow-up overdue
                                </span>
                              )}
                              {lead.followUpAt && !hasFollowUpOverdue && (
                                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                                  <Calendar size={10} /> {fmt(lead.followUpAt)}
                                </span>
                              )}
                              <span className="text-xs text-zinc-600 ml-auto">{fmt(lead.createdAt)}</span>
                            </div>

                            {/* Contact + company */}
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                              <a href={`mailto:${lead.email}`} className="text-sm text-brand-400 hover:underline flex items-center gap-1">
                                <Mail size={12} /> {lead.email}
                              </a>
                              {lead.phone && (
                                <a href={`tel:${lead.phone}`} className="text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-1">
                                  <Phone size={12} /> {lead.phone}
                                </a>
                              )}
                              {lead.company && (
                                <span className="text-sm text-zinc-500 flex items-center gap-1">
                                  <Building2 size={12} /> {lead.company}{lead.jobTitle ? ` · ${lead.jobTitle}` : ''}
                                </span>
                              )}
                              {lead.dealValue != null && lead.dealValue > 0 && (
                                <span className="text-sm text-green-400 flex items-center gap-1">
                                  <DollarSign size={12} /> {lead.dealValue.toLocaleString()}
                                </span>
                              )}
                            </div>

                            {lead.message && (
                              <p className="mt-1.5 text-sm text-zinc-400 flex items-start gap-1.5 line-clamp-2">
                                <MessageSquare size={13} className="shrink-0 mt-0.5 text-zinc-600" />
                                {lead.message}
                              </p>
                            )}

                            {/* Tags */}
                            <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                              {(lead.tags ?? []).map(tag => (
                                <span key={tag} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                                  {tag}
                                  <button onClick={() => removeTag(lead, tag)} className="hover:text-red-400 transition-colors">
                                    <X size={9} />
                                  </button>
                                </span>
                              ))}
                              {(lead.tags?.length ?? 0) < 8 && (
                                <div className="flex items-center">
                                  <input
                                    className="text-[11px] bg-transparent border-none outline-none text-zinc-500 placeholder-zinc-700 w-16 focus:w-24 transition-all"
                                    placeholder="+ tag"
                                    value={tagInput[lead._id] ?? ''}
                                    onChange={e => setTagInput(p => ({ ...p, [lead._id]: e.target.value }))}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' || e.key === ',') {
                                        e.preventDefault()
                                        addTag(lead, tagInput[lead._id] ?? '')
                                      }
                                    }}
                                  />
                                </div>
                              )}
                            </div>

                            {/* Expandable sections */}
                            {isOpen && expandedSection === 'notes' && (
                              <div className="mt-2">
                                <textarea className="input w-full text-sm py-1.5 resize-none" rows={3}
                                  placeholder="Add a note…"
                                  value={noteText[lead._id] ?? lead.notes ?? ''}
                                  onChange={e => setNoteText(p => ({ ...p, [lead._id]: e.target.value }))}
                                  autoFocus />
                                <div className="flex gap-2 mt-1">
                                  <button onClick={() => {
                                    updateMutation.mutate({ id: lead._id, notes: noteText[lead._id] ?? lead.notes ?? '' })
                                    setExpandedLead(null); toast.success('Note saved')
                                  }} className="text-xs btn-primary px-3 py-1">Save</button>
                                  <button onClick={() => setExpandedLead(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
                                </div>
                              </div>
                            )}

                            {isOpen && expandedSection === 'timeline' && (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs text-zinc-500 font-medium mb-2">Activity Timeline</p>
                                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                  {(lead.activities ?? []).slice().reverse().map((a, i) => (
                                    <div key={i} className="flex gap-2 text-xs">
                                      <span className="shrink-0">{ACTIVITY_ICONS[a.type]}</span>
                                      <span className="text-zinc-400">{a.body}</span>
                                      <span className="text-zinc-600 ml-auto shrink-0">{fmt(a.createdAt)}</span>
                                    </div>
                                  ))}
                                  {(lead.activities ?? []).length === 0 && (
                                    <p className="text-xs text-zinc-600">No activities yet.</p>
                                  )}
                                </div>
                                {/* Add activity */}
                                <div className="pt-2 border-t border-white/5 flex gap-2">
                                  <select className="input py-1 text-xs flex-none w-28"
                                    value={activityDraft.type}
                                    onChange={e => setActivityDraft(d => ({ ...d, type: e.target.value as ActivityType }))}>
                                    {(['note', 'call', 'email', 'meeting'] as ActivityType[]).map(t => (
                                      <option key={t} value={t}>{ACTIVITY_ICONS[t]} {t}</option>
                                    ))}
                                  </select>
                                  <input className="input py-1 text-xs flex-1" placeholder="Log activity…"
                                    value={activityDraft.body}
                                    onChange={e => setActivityDraft(d => ({ ...d, body: e.target.value }))}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' && activityDraft.body.trim()) {
                                        addActivityMutation.mutate({ id: lead._id, ...activityDraft })
                                        setActivityDraft({ type: 'note', body: '' })
                                      }
                                    }} />
                                  <button className="text-xs btn-primary px-2 py-1"
                                    onClick={() => {
                                      if (activityDraft.body.trim()) {
                                        addActivityMutation.mutate({ id: lead._id, ...activityDraft })
                                        setActivityDraft({ type: 'note', body: '' })
                                      }
                                    }}>Log</button>
                                </div>
                              </div>
                            )}

                            {isOpen && expandedSection === 'followup' && (
                              <div className="mt-2 space-y-2">
                                <p className="text-xs text-zinc-500 font-medium">Schedule Follow-up</p>
                                <div className="flex gap-2">
                                  <input type="date" className="input py-1 text-xs"
                                    value={followUpDraft[lead._id]?.date ?? lead.followUpAt?.slice(0, 10) ?? ''}
                                    onChange={e => setFollowUpDraft(p => ({ ...p, [lead._id]: { ...p[lead._id], date: e.target.value } }))} />
                                  <input className="input py-1 text-xs flex-1" placeholder="Follow-up note…"
                                    value={followUpDraft[lead._id]?.note ?? lead.followUpNote ?? ''}
                                    onChange={e => setFollowUpDraft(p => ({ ...p, [lead._id]: { ...p[lead._id], note: e.target.value } }))} />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => {
                                    const d = followUpDraft[lead._id]
                                    updateMutation.mutate({ id: lead._id, followUpAt: d?.date || null, followUpNote: d?.note || '' })
                                    setExpandedLead(null); toast.success('Follow-up scheduled')
                                  }} className="text-xs btn-primary px-3 py-1">Save</button>
                                  {lead.followUpAt && (
                                    <button onClick={() => {
                                      updateMutation.mutate({ id: lead._id, followUpAt: null })
                                      toast.success('Follow-up cleared')
                                    }} className="text-xs text-zinc-500 hover:text-red-400">Clear</button>
                                  )}
                                  <button onClick={() => setExpandedLead(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
                                </div>
                              </div>
                            )}

                            {isOpen && expandedSection === 'enrich' && (
                              <div className="mt-2 space-y-2">
                                <p className="text-xs text-zinc-500 font-medium">Enrich Lead</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <input className="input py-1 text-xs" placeholder="Company"
                                    defaultValue={lead.company ?? ''} id={`company-${lead._id}`} />
                                  <input className="input py-1 text-xs" placeholder="Job title"
                                    defaultValue={lead.jobTitle ?? ''} id={`jobtitle-${lead._id}`} />
                                  <input className="input py-1 text-xs col-span-2" type="number" placeholder="Deal value ($)"
                                    defaultValue={lead.dealValue ?? ''} id={`deal-${lead._id}`} />
                                </div>
                                <button onClick={() => {
                                  const company = (document.getElementById(`company-${lead._id}`) as HTMLInputElement)?.value
                                  const jobTitle = (document.getElementById(`jobtitle-${lead._id}`) as HTMLInputElement)?.value
                                  const dealValue = Number((document.getElementById(`deal-${lead._id}`) as HTMLInputElement)?.value) || undefined
                                  updateMutation.mutate({ id: lead._id, company, jobTitle, dealValue })
                                  setExpandedLead(null); toast.success('Lead enriched')
                                }} className="text-xs btn-primary px-3 py-1">Save</button>
                              </div>
                            )}

                            {lead.notes && expandedSection !== 'notes' && (
                              <p onClick={() => toggleExpandLead(lead._id, 'notes')}
                                className="mt-1.5 text-xs text-zinc-500 flex items-start gap-1.5 cursor-pointer hover:text-zinc-300 transition-colors">
                                <StickyNote size={12} className="shrink-0 mt-0.5" /> {lead.notes}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                            {/* Status */}
                            <div className="relative group">
                              <button className={clsx('flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium', sc.bg, sc.color)}>
                                {sc.label} <ChevronDown size={11} />
                              </button>
                              <div className="absolute right-0 top-full mt-1 z-20 hidden group-hover:flex flex-col bg-surface-800 border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-32">
                                {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map(s => (
                                  <button key={s} onClick={() => updateMutation.mutate({ id: lead._id, status: s, read: true })}
                                    className={clsx('px-3 py-1.5 text-xs text-left hover:bg-white/5', STATUS_CONFIG[s].color)}>
                                    {STATUS_CONFIG[s].label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Smart Reply */}
                            <button onClick={() => triggerSmartReply(lead)} title="AI Smart Reply"
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors">
                              <Sparkles size={14} />
                            </button>

                            {/* Timeline */}
                            <button onClick={() => toggleExpandLead(lead._id, 'timeline')}
                              title={`${lead.activities?.length ?? 0} activities`}
                              className={clsx('p-1.5 rounded-lg text-zinc-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors relative',
                                isOpen && expandedSection === 'timeline' && 'bg-brand-500/10 text-brand-400')}>
                              <Activity size={14} />
                              {(lead.activities?.length ?? 0) > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 text-[8px] w-3 h-3 rounded-full bg-brand-500 text-white flex items-center justify-center font-bold">
                                  {lead.activities.length}
                                </span>
                              )}
                            </button>

                            {/* Follow-up */}
                            <button onClick={() => toggleExpandLead(lead._id, 'followup')} title="Schedule follow-up"
                              className={clsx('p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors',
                                hasFollowUpOverdue && 'text-amber-400')}>
                              <Calendar size={14} />
                            </button>

                            {/* Enrich */}
                            <button onClick={() => toggleExpandLead(lead._id, 'enrich')} title="Enrich lead"
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-green-400 hover:bg-green-500/10 transition-colors">
                              <Building2 size={14} />
                            </button>

                            {/* Notes */}
                            <button onClick={() => toggleExpandLead(lead._id, 'notes')} title="Add note"
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors">
                              <StickyNote size={14} />
                            </button>

                            {/* Mark read */}
                            {!lead.read && (
                              <button onClick={() => updateMutation.mutate({ id: lead._id, read: true })} title="Mark read"
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
                                <Eye size={14} />
                              </button>
                            )}

                            {/* Reply */}
                            {gmailStatus?.connected ? (
                              <button title="Quick reply via Gmail"
                                onClick={() => gmailSendMutation.mutate({ to: lead.email, subject: 'Re: Your enquiry', body: `Hi ${lead.name},\n\n` })}
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-green-400 hover:bg-green-500/10 transition-colors">
                                <Send size={14} />
                              </button>
                            ) : (
                              <a href={`mailto:${lead.email}?subject=Re: Your enquiry&body=Hi ${lead.name},%0D%0A%0D%0A`}
                                className="p-1.5 rounded-lg text-zinc-500 hover:text-green-400 hover:bg-green-500/10 transition-colors">
                                <Mail size={14} />
                              </a>
                            )}

                            {/* Delete */}
                            <button onClick={() => deleteMutation.mutate(lead._id)} title="Delete"
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════ KANBAN VIEW ════════════════ */}
        {view === 'kanban' && (
          <div className="h-full overflow-x-auto px-6 py-4">
            {!pipeline ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex gap-4 h-full min-w-max pb-4">
                {pipeline.columns.map(col => {
                  const sc = STATUS_CONFIG[col.status as LeadStatus]
                  return (
                    <div key={col.status}
                      className={clsx(
                        'flex flex-col w-72 rounded-2xl border transition-all',
                        dragOverStatus === col.status ? `${sc.col} ${sc.border}` : 'border-white/5 glass',
                      )}
                      onDragOver={e => { e.preventDefault(); setDragOverStatus(col.status) }}
                      onDragLeave={() => setDragOverStatus(null)}
                      onDrop={e => onDrop(e, col.status)}>
                      {/* Column header */}
                      <div className="px-4 py-3 border-b border-white/5 shrink-0">
                        <div className="flex items-center justify-between">
                          <span className={clsx('text-sm font-semibold', sc.color)}>{sc.label}</span>
                          <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', sc.bg, sc.color)}>{col.count}</span>
                        </div>
                        {col.totalValue > 0 && (
                          <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                            <DollarSign size={11} /> {col.totalValue.toLocaleString()} pipeline
                          </p>
                        )}
                      </div>

                      {/* Cards */}
                      <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {col.leads.map(lead => {
                          const pc = PRIORITY_CONFIG[lead.priority ?? 'medium']
                          return (
                            <div key={lead._id}
                              draggable
                              onDragStart={e => onDragStart(e, lead._id)}
                              onDragEnd={() => { setDraggingId(null); setDragOverStatus(null) }}
                              className={clsx(
                                'glass rounded-xl border border-l-4 p-3 cursor-grab active:cursor-grabbing select-none transition-opacity',
                                pc.border,
                                draggingId === lead._id && 'opacity-40',
                              )}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                    {lead.name[0]?.toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-zinc-100 truncate">{lead.name}</p>
                                    {lead.company && <p className="text-xs text-zinc-500 truncate">{lead.company}</p>}
                                  </div>
                                </div>
                                <ScoreBadge score={lead.score} />
                              </div>
                              <p className="text-xs text-zinc-500 mt-2 truncate">{lead.email}</p>
                              {lead.dealValue != null && lead.dealValue > 0 && (
                                <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                                  <DollarSign size={10} /> {lead.dealValue.toLocaleString()}
                                </p>
                              )}
                              {lead.message && (
                                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{lead.message}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <button onClick={() => triggerSmartReply(lead)} title="AI Smart Reply"
                                  className="text-zinc-500 hover:text-violet-400 transition-colors">
                                  <Sparkles size={12} />
                                </button>
                                <span className="text-xs text-zinc-600 ml-auto">{fmt(lead.createdAt)}</span>
                              </div>
                            </div>
                          )
                        })}
                        {col.leads.length === 0 && (
                          <div className="text-center py-8 text-zinc-700 text-xs">Drop leads here</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════════ ANALYTICS VIEW ════════════════ */}
        {view === 'analytics' && (
          <div className="h-full overflow-y-auto px-6 py-4 space-y-6">
            {!analytics ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Conversion Rate', value: `${analytics.conversionRate}%`, icon: Target, color: 'text-green-400', sub: `${analytics.funnel.find(f => f.stage === 'converted')?.count ?? 0} converted` },
                    { label: 'Avg Lead Score', value: `${analytics.avgScore}/100`, icon: Star, color: scoreColor(analytics.avgScore).split(' ')[0], sub: 'Rule-based scoring' },
                    { label: 'Avg Time to Close', value: analytics.avgTimeToClose > 0 ? `${analytics.avgTimeToClose}d` : '—', icon: Clock, color: 'text-brand-400', sub: 'From new to converted' },
                    { label: 'Pipeline Value', value: `$${analytics.totalValue.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-400', sub: 'Deal values logged' },
                  ].map(({ label, value, icon: Icon, color, sub }) => (
                    <div key={label} className="glass rounded-xl p-5 border border-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={14} className={color} />
                        <span className="text-xs text-zinc-500">{label}</span>
                      </div>
                      <p className="text-2xl font-bold text-zinc-100 mt-1">{value}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">{sub}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Funnel */}
                  <div className="glass rounded-xl border border-white/5 p-5">
                    <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
                      <TrendingUp size={14} className="text-brand-400" /> Conversion Funnel
                    </h3>
                    <div className="space-y-2">
                      {analytics.funnel.map(f => (
                        <div key={f.stage}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className={STATUS_CONFIG[f.stage as LeadStatus]?.color ?? 'text-zinc-400'}>
                              {STATUS_CONFIG[f.stage as LeadStatus]?.label ?? f.stage}
                            </span>
                            <span className="text-zinc-500">{f.count} <span className="text-zinc-700">({Math.round(f.rate * 100)}%)</span></span>
                          </div>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={clsx('h-full rounded-full transition-all', STATUS_CONFIG[f.stage as LeadStatus]?.bg ?? 'bg-zinc-600')}
                              style={{ width: `${Math.round(f.rate * 100)}%`, backgroundColor: 'currentColor', opacity: 0.8 }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Priority breakdown */}
                  <div className="glass rounded-xl border border-white/5 p-5">
                    <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
                      <Flame size={14} className="text-amber-400" /> Priority Breakdown
                    </h3>
                    <div className="space-y-3">
                      {(Object.entries(analytics.byPriority) as [LeadPriority, number][])
                        .sort((a, b) => b[1] - a[1])
                        .map(([p, count]) => {
                          const total = Object.values(analytics.byPriority).reduce((s, n) => s + n, 0)
                          const pct = total > 0 ? Math.round(count / total * 100) : 0
                          return (
                            <div key={p}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className={PRIORITY_CONFIG[p].color}>{PRIORITY_CONFIG[p].icon} {PRIORITY_CONFIG[p].label}</span>
                                <span className="text-zinc-500">{count} ({pct}%)</span>
                              </div>
                              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>

                  {/* Weekly trend */}
                  <div className="glass rounded-xl border border-white/5 p-5">
                    <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
                      <BarChart3 size={14} className="text-brand-400" /> Weekly Leads (last 8 weeks)
                    </h3>
                    {analytics.byWeek.length > 0 ? (() => {
                      const maxVal = Math.max(...analytics.byWeek.map(w => w.count), 1)
                      return (
                        <div className="flex items-end gap-2 h-24">
                          {analytics.byWeek.map(w => (
                            <div key={w._id} className="flex-1 flex flex-col items-center gap-1">
                              <div className="w-full flex flex-col justify-end h-20">
                                <div
                                  className="w-full bg-gradient-to-t from-brand-600 to-brand-400 rounded-sm opacity-80 hover:opacity-100 transition-opacity"
                                  style={{ height: `${Math.max(4, Math.round(w.count / maxVal * 100))}%` }}
                                  title={`${w._id}: ${w.count} leads`}
                                />
                              </div>
                              <span className="text-[9px] text-zinc-700">{w.count}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })() : (
                      <p className="text-xs text-zinc-600 text-center py-8">No data yet</p>
                    )}
                  </div>

                  {/* Source attribution */}
                  <div className="glass rounded-xl border border-white/5 p-5">
                    <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
                      <ArrowUpRight size={14} className="text-green-400" /> Top Sources
                    </h3>
                    {analytics.bySource.length > 0 ? (
                      <div className="space-y-2">
                        {analytics.bySource.map(s => {
                          const convRate = s.count > 0 ? Math.round(s.converted / s.count * 100) : 0
                          return (
                            <div key={s._id} className="flex items-center gap-3 text-xs">
                              <span className="text-zinc-300 w-28 truncate">{s._id}</span>
                              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.round(s.count / analytics.bySource[0].count * 100)}%` }} />
                              </div>
                              <span className="text-zinc-500 w-8 text-right">{s.count}</span>
                              <span className="text-green-400 w-10 text-right">{convRate}%</span>
                            </div>
                          )
                        })}
                        <div className="flex items-center gap-3 text-[10px] text-zinc-600 mt-1">
                          <span className="w-28">Source</span>
                          <span className="flex-1" />
                          <span className="w-8 text-right">Leads</span>
                          <span className="w-10 text-right">Conv%</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-600 text-center py-8">No source data yet. Add a <code>source</code> field to your contact forms.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>

    {/* ════════════ SMART REPLY MODAL ════════════ */}
    {smartReplyLead && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
        <div className="glass border border-white/10 rounded-2xl w-full max-w-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Sparkles size={16} className="text-violet-400" />
              AI Smart Reply — {smartReplyLead.name}
            </h2>
            <button onClick={() => { setSmartReplyLead(null); setSmartReplyData(null) }} className="text-zinc-500 hover:text-zinc-300">
              <X size={16} />
            </button>
          </div>

          {smartReplyLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">AI is drafting your reply…</p>
            </div>
          ) : smartReplyData ? (
            <>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Subject</label>
                  <input className="input w-full text-sm py-2"
                    value={smartReplyData.subject}
                    onChange={e => setSmartReplyData(d => d ? { ...d, subject: e.target.value } : d)} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Body</label>
                  <textarea className="input w-full text-sm py-2 resize-none leading-relaxed" rows={10}
                    value={smartReplyData.body}
                    onChange={e => setSmartReplyData(d => d ? { ...d, body: e.target.value } : d)} />
                </div>
              </div>
              <div className="flex gap-2">
                {gmailStatus?.connected ? (
                  <button
                    onClick={() => gmailSendMutation.mutate({ to: smartReplyLead.email, subject: smartReplyData.subject, body: smartReplyData.body })}
                    disabled={gmailSendMutation.isPending}
                    className="flex-1 btn-primary py-2 flex items-center justify-center gap-2">
                    <Send size={14} /> {gmailSendMutation.isPending ? 'Sending…' : 'Send via Gmail'}
                  </button>
                ) : (
                  <a href={`mailto:${smartReplyLead.email}?subject=${encodeURIComponent(smartReplyData.subject)}&body=${encodeURIComponent(smartReplyData.body)}`}
                    className="flex-1 btn-primary py-2 flex items-center justify-center gap-2">
                    <Mail size={14} /> Open in Mail Client
                  </a>
                )}
                <button onClick={() => {
                  navigator.clipboard.writeText(smartReplyData.body)
                  toast.success('Copied to clipboard!')
                }} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 rounded-lg border border-white/5 hover:bg-white/5">
                  Copy
                </button>
                <button onClick={() => { setSmartReplyLead(null); setSmartReplyData(null) }}
                  className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 rounded-lg border border-white/5 hover:bg-white/5">
                  Cancel
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    )}

    {/* ════════════ IMPORT CSV MODAL ════════════ */}
    {showImport && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
        <div className="glass border border-white/10 rounded-2xl w-full max-w-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Upload size={16} className="text-brand-400" /> Import Leads from CSV
            </h2>
            <button onClick={() => { setShowImport(false); setImportCsv(''); setImportPreview([]) }} className="text-zinc-500 hover:text-zinc-300">
              <X size={16} />
            </button>
          </div>

          <p className="text-xs text-zinc-500">
            Required columns: <code className="text-brand-400">name</code>, <code className="text-brand-400">email</code>.
            Optional: phone, message, company, source, deal.
          </p>

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center cursor-pointer hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f) }}
          >
            <Upload size={24} className="mx-auto mb-2 text-zinc-600" />
            <p className="text-sm text-zinc-400">{importCsv ? 'File loaded — click to replace' : 'Drop CSV file here or click to browse'}</p>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
          </div>

          {importPreview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr>{importPreview[0]?.map((h, i) => (
                    <th key={i} className="text-left text-zinc-500 pb-1 pr-3 font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {importPreview.slice(1).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="text-zinc-400 pb-1 pr-3 truncate max-w-24">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-zinc-600 mt-1">Preview (first 3 rows)</p>
            </div>
          )}

          {stats?.bySite && stats.bySite.length > 0 && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Associate with site (optional)</label>
              <select className="input py-1.5 text-sm w-full" value={importSite} onChange={e => setImportSite(e.target.value)}>
                <option value="">No specific site</option>
                {stats.bySite.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => { if (importCsv) importMutation.mutate({ csv: importCsv, siteId: importSite }) }}
              disabled={!importCsv || importMutation.isPending}
              className="flex-1 btn-primary py-2 flex items-center justify-center gap-2">
              {importMutation.isPending ? 'Importing…' : 'Import Leads'}
            </button>
            <button onClick={() => { setShowImport(false); setImportCsv(''); setImportPreview([]) }}
              className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 rounded-lg border border-white/5 hover:bg-white/5">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ════════════ WEBHOOK MODAL ════════════ */}
    {showWebhook && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
        <div className="glass border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Webhook size={16} className="text-brand-400" /> Webhook Integration
            </h2>
            <button onClick={() => setShowWebhook(false)} className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            ForgeAI will <code className="text-brand-400">POST</code> a JSON payload to this URL every time a new lead is submitted.
            Compatible with <strong className="text-zinc-300">Zapier</strong>, <strong className="text-zinc-300">Make.com</strong>, <strong className="text-zinc-300">n8n</strong>, and any HTTP endpoint.
          </p>

          <input className="input w-full text-sm py-2" placeholder="https://hooks.zapier.com/hooks/catch/…"
            value={webhookDraft || webhookSettings?.webhookUrl || ''}
            onChange={e => setWebhookDraft(e.target.value)} />

          <div className="bg-zinc-900/60 rounded-xl p-3 text-xs text-zinc-500 font-mono overflow-x-auto">
            <p className="text-zinc-400 mb-1">// Payload sent on each new lead:</p>
            <pre>{`{
  "event": "lead.created",
  "lead": {
    "id": "...",
    "name": "Jane Smith",
    "email": "jane@acme.com",
    "score": 75,
    "priority": "urgent",
    "site": "Acme Corp",
    "utmSource": "google",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}`}</pre>
          </div>

          <div className="flex gap-2">
            <button onClick={() => saveWebhookMutation.mutate(webhookDraft)} disabled={saveWebhookMutation.isPending}
              className="flex-1 btn-primary py-2 flex items-center justify-center gap-2">
              {saveWebhookMutation.isPending ? 'Saving…' : 'Save Webhook URL'}
            </button>
            {(webhookDraft || webhookSettings?.webhookUrl) && (
              <button onClick={() => saveWebhookMutation.mutate('')}
                className="px-4 py-2 text-xs text-red-400 hover:text-red-300 rounded-lg border border-red-500/20 hover:bg-red-500/5">
                Remove
              </button>
            )}
            <button onClick={() => setShowWebhook(false)}
              className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 rounded-lg border border-white/5 hover:bg-white/5">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ════════════ AUTO-REPLY TEMPLATE MODAL ════════════ */}
    {showAutoReplyEditor && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
        <div className="glass border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Zap size={16} className="text-green-400" /> Auto-reply Template
            </h2>
            <button onClick={() => setShowAutoReplyEditor(false)} className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
          </div>
          <p className="text-xs text-zinc-500">
            Sent automatically via Gmail to every new lead. Use <code className="text-brand-400">&#123;name&#125;</code> and <code className="text-brand-400">&#123;site&#125;</code>.
          </p>
          <textarea className="input w-full text-sm py-2 resize-none leading-relaxed" rows={7}
            placeholder={`Hi {name},\n\nThank you for reaching out!…`}
            value={replyTemplate || autoReplySettings?.template || ''}
            onChange={e => setReplyTemplate(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => { saveAutoReplyMutation.mutate({ template: replyTemplate }); setShowAutoReplyEditor(false) }}
              className="flex-1 btn-primary py-2">Save template</button>
            <button onClick={() => setShowAutoReplyEditor(false)}
              className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 rounded-lg border border-white/5 hover:bg-white/5">Cancel</button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
