import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Users, UserPlus, Trash2, Mail, Check, Clock, Loader2,
  Shield, Crown, RefreshCw, LogOut, ChevronDown, Zap, Star,
  AlertCircle, Copy, Link as LinkIcon, ExternalLink,
  Activity, BarChart3, Wrench, Eye, TestTube, Lock,
  Rocket, Bot, Globe, LayoutDashboard, CheckCircle2, XCircle,
  SlidersHorizontal,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── types ─────────────────────────────────────────────────────────────────────

interface TeamMember {
  email: string
  role: 'admin' | 'member'
  accepted: boolean
  invitedAt: string
  userId?: string
  inviteUrl?: string
}

interface TeamData {
  members: TeamMember[]
  plan: 'free' | 'pro' | 'team'
  seatLimit: number | null
  seatUsed: number
  isOwner: boolean
  myRole: 'owner' | 'admin' | 'member'
  ownerName?: string
  ownerEmail?: string
  smtpConfigured?: boolean
}

interface ActivityItem {
  id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  summary: string | null
  repoName: string
  userEmail: string
  createdAt: string
}

interface StatRow {
  email: string
  userId: string
  role: 'owner' | 'admin' | 'member'
  monthlyLimit: number | null
  taskCount: number
  lastActiveAt: string | null
}

// ── helpers ───────────────────────────────────────────────────────────────────

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  })
}

function relativeTime(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const TASK_META: Record<string, { label: string; icon: any; color: string }> = {
  fix_workspace:    { label: 'AI Fix',         icon: Wrench,        color: 'text-brand-400' },
  fix_file:         { label: 'File Fix',        icon: Wrench,        color: 'text-brand-400' },
  fix_folder:       { label: 'Folder Fix',      icon: Wrench,        color: 'text-brand-400' },
  review:           { label: 'Code Review',     icon: Eye,           color: 'text-amber-400' },
  generate_tests:   { label: 'Generate Tests',  icon: TestTube,      color: 'text-emerald-400' },
  security_scan:    { label: 'Security Scan',   icon: Lock,          color: 'text-red-400' },
  blitz_deploy:     { label: 'Deploy',          icon: Rocket,        color: 'text-violet-400' },
  agent:            { label: 'AI Agent',        icon: Bot,           color: 'text-cyan-400' },
  build_site:       { label: 'Build Site',      icon: Globe,         color: 'text-emerald-400' },
  build_dashboard:  { label: 'Dashboard Build', icon: LayoutDashboard, color: 'text-emerald-400' },
  chat:             { label: 'Chat',            icon: Bot,           color: 'text-zinc-400' },
}

// ── sub-components ────────────────────────────────────────────────────────────

function InviteLinkBox({ url, onDismiss }: { url: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-4 bg-brand-500/10 border border-brand-500/30 rounded-xl p-4">
      <div className="flex items-start gap-2 mb-3">
        <LinkIcon size={14} className="text-brand-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-brand-300">Invite link ready</p>
          <p className="text-xs text-zinc-400 mt-0.5">Share this link directly — email delivery is not configured.</p>
        </div>
        <button onClick={onDismiss} className="text-zinc-600 hover:text-zinc-400 text-xs">✕</button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-surface-900 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 truncate">{url}</div>
        <button
          onClick={() => { copyToClipboard(url); setCopied(true); toast.success('Copied!'); setTimeout(() => setCopied(false), 2000) }}
          className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all',
            copied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-brand-500 text-white hover:bg-brand-600')}
        >
          <Copy size={11} />{copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}

function PendingInviteLink({ url }: { url: string }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!expanded) return (
    <button onClick={() => setExpanded(true)} className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1 mt-1">
      <LinkIcon size={9} /> Show invite link
    </button>
  )
  return (
    <div className="mt-2 flex items-center gap-2 max-w-xs">
      <div className="flex-1 bg-surface-900 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-zinc-400 truncate">{url}</div>
      <button onClick={() => { copyToClipboard(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
        className={clsx('shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all', copied ? 'text-emerald-400' : 'text-brand-400 hover:text-brand-300')}>
        <Copy size={9} />{copied ? 'Copied!' : 'Copy'}
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-zinc-600 hover:text-zinc-400" onClick={e => e.stopPropagation()}>
        <ExternalLink size={9} />
      </a>
    </div>
  )
}

function SeatMeter({ used, limit }: { used: number; limit: number | null }) {
  if (limit === null) return (
    <div className="flex items-center gap-2 text-sm">
      <Star size={13} className="text-violet-400" />
      <span className="text-zinc-400">Unlimited seats</span>
      <span className="ml-auto text-zinc-500">{used} active</span>
    </div>
  )
  const pct = Math.min((used / limit) * 100, 100)
  const atLimit = used >= limit
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className={clsx('font-medium', atLimit ? 'text-amber-400' : 'text-zinc-300')}>{used} / {limit} seats used</span>
        {atLimit && <span className="text-[11px] text-amber-400 flex items-center gap-1"><AlertCircle size={11} /> Seat limit reached</span>}
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', atLimit ? 'bg-amber-500' : 'bg-gradient-to-r from-brand-500 to-violet-500')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: 'owner' | 'admin' | 'member' }) {
  if (role === 'owner') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 flex items-center gap-1"><Zap size={9} /> Owner</span>
  if (role === 'admin') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 flex items-center gap-1"><Crown size={9} /> Admin</span>
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-700/60 text-zinc-400 flex items-center gap-1"><Shield size={9} /> Member</span>
}

function StatusDot({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
  if (status === 'failed') return <XCircle size={12} className="text-red-400 shrink-0" />
  if (status === 'running') return <Loader2 size={12} className="text-brand-400 animate-spin shrink-0" />
  return <Clock size={12} className="text-zinc-600 shrink-0" />
}

function MemberRow({ member, canManage, isOwner, onRemove, onResend, onRoleChange, removing, resending }: {
  member: TeamMember; canManage: boolean; isOwner: boolean
  onRemove: (e: string) => void; onResend: (e: string) => void
  onRoleChange: (e: string, r: 'admin' | 'member') => void
  removing: boolean; resending: boolean
}) {
  const [showRoleMenu, setShowRoleMenu] = useState(false)
  return (
    <div className="flex items-start gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors group">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white shrink-0 mt-0.5">
        {member.email[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-200 flex items-center gap-1.5"><Mail size={12} className="text-zinc-500 shrink-0" />{member.email}</span>
          <RoleBadge role={member.role} />
        </div>
        <p className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1">
          {member.accepted ? <><Check size={10} className="text-emerald-500" /> Active</> : <><Clock size={10} /> Invited {new Date(member.invitedAt).toLocaleDateString()}</>}
        </p>
        {!member.accepted && member.inviteUrl && <PendingInviteLink url={member.inviteUrl} />}
      </div>
      {canManage && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
          {isOwner && (
            <div className="relative">
              <button onClick={() => setShowRoleMenu(v => !v)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-white/5">
                Role <ChevronDown size={11} />
              </button>
              {showRoleMenu && (
                <div className="absolute right-0 top-full mt-1 w-28 bg-surface-800 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                  {(['admin', 'member'] as const).map(r => (
                    <button key={r} onClick={() => { onRoleChange(member.email, r); setShowRoleMenu(false) }}
                      className={clsx('w-full text-left px-3 py-2 text-xs transition-colors', member.role === r ? 'text-brand-400 bg-brand-500/10' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5')}>
                      {r === 'admin' ? '👑 Admin' : '🛡️ Member'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!member.accepted && (
            <button onClick={() => onResend(member.email)} disabled={resending}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-brand-400 hover:bg-brand-500/10" title="Resend invite">
              {resending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </button>
          )}
          <button onClick={() => onRemove(member.email)} disabled={removing}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10" title="Remove">
            {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Activity tab ──────────────────────────────────────────────────────────────

function ActivityTab() {
  const { data, isLoading } = useQuery<ActivityItem[]>({
    queryKey: ['team-activity'],
    queryFn: () => api.get('/teams/activity').then(r => r.data),
    refetchInterval: 15000,
  })

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-brand-500" size={24} /></div>
  if (!data?.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
      <Activity size={32} className="mb-3 opacity-30" />
      <p className="text-sm">No team activity yet</p>
      <p className="text-xs text-zinc-700 mt-1">AI tasks run by team members will appear here.</p>
    </div>
  )

  return (
    <div className="divide-y divide-white/5">
      {data.map(item => {
        const meta = TASK_META[item.type] ?? { label: item.type, icon: Bot, color: 'text-zinc-400' }
        const Icon = meta.icon
        return (
          <div key={item.id} className="flex items-start gap-4 px-6 py-3.5 hover:bg-white/[0.02] transition-colors">
            <div className={clsx('mt-0.5 shrink-0', meta.color)}>
              <Icon size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-zinc-200">{meta.label}</span>
                <StatusDot status={item.status} />
                <span className="text-xs text-zinc-600 truncate max-w-[120px]">{item.repoName}</span>
              </div>
              {item.summary && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{item.summary}</p>}
              <p className="text-[10px] text-zinc-600 mt-0.5">{item.userEmail} · {relativeTime(item.createdAt)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Usage & Budget tab ────────────────────────────────────────────────────────

function UsageTab({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<StatRow[]>({
    queryKey: ['team-stats'],
    queryFn: () => api.get('/teams/stats').then(r => r.data),
    enabled: isOwner,
  })

  const limitMutation = useMutation({
    mutationFn: ({ email, limit }: { email: string; limit: number | null }) =>
      api.patch(`/teams/${encodeURIComponent(email)}/limit`, { limit }),
    onSuccess: () => { toast.success('Budget updated'); qc.invalidateQueries({ queryKey: ['team-stats'] }) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Failed'),
  })

  if (!isOwner) return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
      <BarChart3 size={32} className="mb-3 opacity-30" />
      <p className="text-sm">Usage stats are visible to the team owner only.</p>
    </div>
  )
  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-brand-500" size={24} /></div>

  const now = new Date()
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const maxCount = Math.max(...(data ?? []).map(r => r.taskCount), 1)

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">AI tasks — {monthName}</p>
        <p className="text-xs text-zinc-600">Set per-member monthly limits to control costs</p>
      </div>
      {(data ?? []).map(row => {
        const pct = Math.min((row.taskCount / Math.max(row.monthlyLimit ?? maxCount, 1)) * 100, 100)
        const atLimit = row.monthlyLimit != null && row.taskCount >= row.monthlyLimit
        return (
          <div key={row.email} className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {row.email[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-200 truncate">{row.email}</span>
                  <RoleBadge role={row.role} />
                  {atLimit && <span className="text-[10px] text-amber-400 flex items-center gap-0.5"><AlertCircle size={9} />limit reached</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className={clsx('h-full rounded-full transition-all', atLimit ? 'bg-amber-500' : 'bg-gradient-to-r from-brand-500 to-violet-500')}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500 shrink-0 tabular-nums">
                    {row.taskCount}{row.monthlyLimit != null ? ` / ${row.monthlyLimit}` : ''} tasks
                  </span>
                </div>
              </div>
              {/* Limit setter — owner only, not for themselves */}
              {row.role !== 'owner' && (
                <LimitSetter
                  currentLimit={row.monthlyLimit}
                  onSave={limit => limitMutation.mutate({ email: row.email, limit })}
                  saving={limitMutation.isPending}
                />
              )}
            </div>
            {row.lastActiveAt && (
              <p className="text-[10px] text-zinc-700 pl-10">Last active {relativeTime(row.lastActiveAt)}</p>
            )}
          </div>
        )
      })}

      <div className="mt-4 pt-4 border-t border-white/5 text-xs text-zinc-600 flex items-start gap-2">
        <SlidersHorizontal size={12} className="shrink-0 mt-0.5 text-zinc-500" />
        <span>Members who hit their limit will see a "Team budget reached" error when running AI tasks. Set to <strong className="text-zinc-400">Unlimited</strong> to remove the cap.</span>
      </div>
    </div>
  )
}

function LimitSetter({ currentLimit, onSave, saving }: { currentLimit: number | null; onSave: (l: number | null) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(currentLimit?.toString() ?? '')

  if (!editing) return (
    <button onClick={() => setEditing(true)}
      className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-white/5 transition-colors whitespace-nowrap">
      <SlidersHorizontal size={10} />
      {currentLimit == null ? 'Set limit' : `Limit: ${currentLimit}`}
    </button>
  )

  return (
    <div className="shrink-0 flex items-center gap-1">
      <input
        type="number" min={1} placeholder="e.g. 50"
        value={val} onChange={e => setVal(e.target.value)}
        className="w-20 bg-surface-800 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-brand-500/50"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(val.trim() ? parseInt(val) : null); setEditing(false) }
          if (e.key === 'Escape') setEditing(false)
        }}
      />
      <button onClick={() => { onSave(val.trim() ? parseInt(val) : null); setEditing(false) }}
        disabled={saving} className="px-2 py-1 rounded text-xs bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50">
        {saving ? <Loader2 size={10} className="animate-spin" /> : 'Save'}
      </button>
      <button onClick={() => { onSave(null); setEditing(false) }}
        className="px-2 py-1 rounded text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5">
        Unlimited
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeamSettings() {
  const qc = useQueryClient()
  const { updateUser } = useAuthStore()
  const [tab, setTab] = useState<'members' | 'activity' | 'usage'>('members')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [removingEmail, setRemovingEmail] = useState<string | null>(null)
  const [resendingEmail, setResendingEmail] = useState<string | null>(null)
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get('/teams').then(r => r.data as TeamData),
  })

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) => api.post('/teams/invite', { email, role }),
    onSuccess: ({ data: d }) => {
      toast.success('Invitation created!')
      setInviteEmail('')
      if (d.inviteUrl) { setLastInviteUrl(d.inviteUrl); copyToClipboard(d.inviteUrl) }
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not send invite'),
  })

  const removeMutation = useMutation({
    mutationFn: (email: string) => api.delete(`/teams/${encodeURIComponent(email)}`),
    onSuccess: () => { toast.success('Member removed'); setRemovingEmail(null); qc.invalidateQueries({ queryKey: ['team'] }) },
    onError: (e: any) => { toast.error(e.response?.data?.message ?? 'Could not remove'); setRemovingEmail(null) },
  })

  const resendMutation = useMutation({
    mutationFn: (email: string) => api.post(`/teams/${encodeURIComponent(email)}/resend`),
    onSuccess: ({ data: d }) => {
      toast.success('Invite link regenerated')
      setResendingEmail(null)
      if (d.inviteUrl) { setLastInviteUrl(d.inviteUrl); copyToClipboard(d.inviteUrl) }
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (e: any) => { toast.error(e.response?.data?.message ?? 'Could not resend'); setResendingEmail(null) },
  })

  const roleMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) => api.patch(`/teams/${encodeURIComponent(email)}/role`, { role }),
    onSuccess: () => { toast.success('Role updated'); qc.invalidateQueries({ queryKey: ['team'] }) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not update role'),
  })

  const leaveMutation = useMutation({
    mutationFn: () => api.post('/teams/leave'),
    onSuccess: () => {
      toast.success('You have left the team')
      updateUser({ teamOwnerId: undefined, teamRole: undefined })
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not leave team'),
  })

  const team = data
  const members = team?.members ?? []
  const active = members.filter(m => m.accepted)
  const pending = members.filter(m => !m.accepted)
  const canInvite = (team?.myRole === 'owner' || team?.myRole === 'admin') && team?.plan !== 'free'
  const canManage = team?.myRole === 'owner' || team?.myRole === 'admin'
  const isOwner = team?.isOwner ?? true
  const atLimit = team?.seatLimit != null && (team?.seatUsed ?? 0) >= team.seatLimit
  const isFreePlan = team?.plan === 'free'

  const TABS = [
    { id: 'members', label: 'Members', icon: Users },
    { id: 'activity', label: 'Activity', icon: Activity },
    ...(isOwner ? [{ id: 'usage', label: 'Usage & Budget', icon: BarChart3 }] : []),
  ] as const

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <Users size={22} className="text-brand-400" />
              {isOwner ? 'Team' : `${team?.ownerName ?? 'Team'}'s Workspace`}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {isOwner ? 'Manage members, monitor activity, and control AI budgets.' : `You have ${team?.myRole === 'admin' ? 'admin' : 'member'} access.`}
            </p>
          </div>
          {!isOwner && (
            <button onClick={() => leaveMutation.mutate()} disabled={leaveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-zinc-500 border border-white/5 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-all">
              {leaveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
              Leave team
            </button>
          )}
        </div>

        {/* Member banner */}
        {!isOwner && (
          <div className="glass rounded-2xl border border-white/5 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-violet-500/20 border border-brand-500/20 flex items-center justify-center">
              <Users size={16} className="text-brand-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Member of <span className="text-brand-400">{team?.ownerName ?? 'this team'}</span></p>
              <p className="text-xs text-zinc-500">{team?.ownerEmail}</p>
            </div>
            <div className="ml-auto"><RoleBadge role={team?.myRole ?? 'member'} /></div>
          </div>
        )}

        {/* Plan card */}
        {isOwner && (
          <div className="glass rounded-2xl border border-white/5 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-300 flex items-center gap-1.5">
                {team?.plan === 'team' ? <Star size={14} className="text-violet-400" /> : <Zap size={14} className="text-brand-400" />}
                {team?.plan === 'team' ? 'Team Plan' : team?.plan === 'pro' ? 'Pro Plan' : 'Free Plan'}
              </span>
              {(team?.plan === 'pro' && atLimit) && <a href="/pricing" className="text-[11px] font-semibold text-brand-400 hover:text-brand-300">Upgrade for unlimited →</a>}
              {isFreePlan && <a href="/pricing" className="text-[11px] font-semibold text-brand-400 hover:text-brand-300">Upgrade to invite members →</a>}
            </div>
            {team && <SeatMeter used={team.seatUsed} limit={team.seatLimit} />}
          </div>
        )}

        {/* Free plan notice */}
        {isOwner && isFreePlan && (
          <div className="glass rounded-2xl border border-amber-500/20 p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Team seats require Pro or Team plan</p>
              <p className="text-xs text-zinc-400 mt-1">Upgrade to invite members and unlock the full team collaboration suite.</p>
              <a href="/pricing" className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-brand-400 hover:text-brand-300">View pricing <ExternalLink size={10} /></a>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white/[0.03] border border-white/5 rounded-xl p-1">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={clsx('flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  tab === t.id ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}>
                <Icon size={14} />{t.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        {tab === 'members' && (
          <div className="space-y-4">
            {/* Invite form */}
            {(canInvite || (isOwner && !isFreePlan)) && (
              <div className="glass rounded-2xl border border-white/5 p-5">
                <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2"><UserPlus size={15} /> Invite a member</h2>
                {!data?.smtpConfigured && (
                  <div className="mb-3 flex items-start gap-2 text-xs text-zinc-500 bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                    <AlertCircle size={12} className="text-amber-500 mt-0.5 shrink-0" />
                    <span>Email sending not configured — you'll get a shareable link after inviting.</span>
                  </div>
                )}
                {atLimit ? (
                  <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                    <AlertCircle size={14} />Seat limit reached. <a href="/pricing" className="underline hover:text-amber-300">Upgrade to Team plan</a> for unlimited.
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 flex-col sm:flex-row">
                      <input type="email" value={inviteEmail}
                        onChange={e => { setInviteEmail(e.target.value); setLastInviteUrl(null) }}
                        onKeyDown={e => e.key === 'Enter' && inviteEmail.trim() && inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
                        placeholder="colleague@company.com"
                        className="flex-1 bg-surface-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500/50" />
                      <div className="flex gap-2">
                        <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}
                          className="bg-surface-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:border-brand-500/50">
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
                          disabled={!inviteEmail.trim() || inviteMutation.isPending}
                          className="gradient-btn px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50 whitespace-nowrap">
                          {inviteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}Invite
                        </button>
                      </div>
                    </div>
                    {lastInviteUrl && <InviteLinkBox url={lastInviteUrl} onDismiss={() => setLastInviteUrl(null)} />}
                  </>
                )}
                <p className="text-xs text-zinc-600 mt-3">
                  <Crown size={10} className="inline mr-1 text-amber-500" />Admin — can invite &amp; manage.{' '}
                  <Shield size={10} className="inline mr-1 text-zinc-500" />Member — repo &amp; task access.
                </p>
              </div>
            )}

            {/* Active members */}
            <div className="glass rounded-2xl border border-white/5 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5">
                <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                  <Check size={13} className="text-emerald-500" />Active members<span className="text-zinc-600 font-normal">({active.length})</span>
                </h2>
              </div>
              {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-brand-500" size={24} /></div>
              ) : active.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-zinc-600">
                  <Users size={28} className="mb-2 opacity-30" />
                  <p className="text-sm">No active members yet</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {active.map(m => (
                    <MemberRow key={m.email} member={m} canManage={canManage} isOwner={isOwner}
                      onRemove={e => { setRemovingEmail(e); removeMutation.mutate(e) }}
                      onResend={e => { setResendingEmail(e); resendMutation.mutate(e) }}
                      onRoleChange={(e, r) => roleMutation.mutate({ email: e, role: r })}
                      removing={removingEmail === m.email && removeMutation.isPending}
                      resending={resendingEmail === m.email && resendMutation.isPending} />
                  ))}
                </div>
              )}
            </div>

            {/* Pending */}
            {pending.length > 0 && (
              <div className="glass rounded-2xl border border-white/5 overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5">
                  <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                    <Clock size={13} className="text-zinc-500" />Pending invites<span className="text-zinc-600 font-normal">({pending.length})</span>
                  </h2>
                </div>
                <div className="divide-y divide-white/5">
                  {pending.map(m => (
                    <MemberRow key={m.email} member={m} canManage={canManage} isOwner={isOwner}
                      onRemove={e => { setRemovingEmail(e); removeMutation.mutate(e) }}
                      onResend={e => { setResendingEmail(e); resendMutation.mutate(e) }}
                      onRoleChange={(e, r) => roleMutation.mutate({ email: e, role: r })}
                      removing={removingEmail === m.email && removeMutation.isPending}
                      resending={resendingEmail === m.email && resendMutation.isPending} />
                  ))}
                </div>
              </div>
            )}

            {/* Role legend */}
            <div className="glass rounded-2xl border border-white/5 p-5">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Role permissions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="space-y-1"><RoleBadge role="owner" /><p className="text-zinc-600">Full control, billing, set budgets</p></div>
                <div className="space-y-1"><RoleBadge role="admin" /><p className="text-zinc-600">Invite members, manage repos &amp; tasks</p></div>
                <div className="space-y-1"><RoleBadge role="member" /><p className="text-zinc-600">Run AI tasks, read-write on team repos</p></div>
              </div>
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="glass rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2"><Activity size={14} className="text-brand-400" />Team Activity</h2>
              <span className="text-xs text-zinc-600">Last 50 AI actions · refreshes every 15s</span>
            </div>
            <ActivityTab />
          </div>
        )}

        {tab === 'usage' && (
          <div className="glass rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2"><BarChart3 size={14} className="text-brand-400" />Usage &amp; Budget</h2>
            </div>
            <UsageTab isOwner={isOwner} />
          </div>
        )}
      </div>
    </div>
  )
}
