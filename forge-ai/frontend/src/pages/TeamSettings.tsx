import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import {
  Users, UserPlus, Trash2, Mail, Check, Clock, Loader2,
  Shield, Crown, RefreshCw, LogOut, ChevronDown, Zap, Star,
  AlertCircle, Copy, Link as LinkIcon, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

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

function InviteLinkBox({ url, onDismiss }: { url: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    copyToClipboard(url)
    setCopied(true)
    toast.success('Invite link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4 bg-brand-500/10 border border-brand-500/30 rounded-xl p-4">
      <div className="flex items-start gap-2 mb-3">
        <LinkIcon size={14} className="text-brand-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-brand-300">Invite link ready</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            Email sending is not configured — share this link directly with your invitee.
          </p>
        </div>
        <button onClick={onDismiss} className="ml-auto text-zinc-600 hover:text-zinc-400 text-xs px-1">✕</button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-surface-900 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 truncate">
          {url}
        </div>
        <button
          onClick={handleCopy}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
            copied
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-brand-500 text-white hover:bg-brand-600',
          )}
        >
          <Copy size={11} />
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}

function SeatMeter({ used, limit }: { used: number; limit: number | null }) {
  if (limit === null) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Star size={13} className="text-violet-400" />
        <span className="text-zinc-400">Unlimited seats on Team plan</span>
        <span className="ml-auto text-zinc-500">{used} active</span>
      </div>
    )
  }
  const pct = Math.min((used / limit) * 100, 100)
  const atLimit = used >= limit
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className={clsx('font-medium', atLimit ? 'text-amber-400' : 'text-zinc-300')}>
          {used} / {limit} seats used
        </span>
        {atLimit && (
          <span className="text-[11px] text-amber-400 flex items-center gap-1">
            <AlertCircle size={11} /> Seat limit reached
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-500',
            atLimit ? 'bg-amber-500' : 'bg-gradient-to-r from-brand-500 to-violet-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: 'owner' | 'admin' | 'member' }) {
  if (role === 'owner') return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 flex items-center gap-1">
      <Zap size={9} /> Owner
    </span>
  )
  if (role === 'admin') return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 flex items-center gap-1">
      <Crown size={9} /> Admin
    </span>
  )
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-700/60 text-zinc-400 flex items-center gap-1">
      <Shield size={9} /> Member
    </span>
  )
}

function PendingInviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(url)
    setCopied(true)
    toast.success('Invite link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1 mt-1"
      >
        <LinkIcon size={9} /> Show invite link
      </button>
    )
  }

  return (
    <div className="mt-2 flex items-center gap-2 max-w-xs">
      <div className="flex-1 bg-surface-900 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-zinc-400 truncate">
        {url}
      </div>
      <button
        onClick={handleCopy}
        className={clsx(
          'shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all',
          copied ? 'text-emerald-400' : 'text-brand-400 hover:text-brand-300',
        )}
      >
        <Copy size={9} />
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-zinc-600 hover:text-zinc-400"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink size={9} />
      </a>
    </div>
  )
}

function MemberRow({
  member,
  canManage,
  isOwner,
  onRemove,
  onResend,
  onRoleChange,
  removing,
  resending,
}: {
  member: TeamMember
  canManage: boolean
  isOwner: boolean
  onRemove: (email: string) => void
  onResend: (email: string) => void
  onRoleChange: (email: string, role: 'admin' | 'member') => void
  removing: boolean
  resending: boolean
}) {
  const [showRoleMenu, setShowRoleMenu] = useState(false)

  return (
    <div className="flex items-start gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors group">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white shrink-0 mt-0.5">
        {member.email[0]?.toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-200 flex items-center gap-1.5">
            <Mail size={12} className="text-zinc-500 shrink-0" />
            {member.email}
          </span>
          <RoleBadge role={member.role} />
        </div>
        <p className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1">
          {member.accepted ? (
            <><Check size={10} className="text-emerald-500" /> Active</>
          ) : (
            <><Clock size={10} /> Invited {new Date(member.invitedAt).toLocaleDateString()}</>
          )}
        </p>
        {/* Show invite link for pending members */}
        {!member.accepted && member.inviteUrl && (
          <PendingInviteLink url={member.inviteUrl} />
        )}
      </div>

      {canManage && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
          {/* Role change — owner only */}
          {isOwner && (
            <div className="relative">
              <button
                onClick={() => setShowRoleMenu(v => !v)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
              >
                Role <ChevronDown size={11} />
              </button>
              {showRoleMenu && (
                <div className="absolute right-0 top-full mt-1 w-28 bg-surface-800 border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                  {(['admin', 'member'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => { onRoleChange(member.email, r); setShowRoleMenu(false) }}
                      className={clsx(
                        'w-full text-left px-3 py-2 text-xs transition-colors',
                        member.role === r
                          ? 'text-brand-400 bg-brand-500/10'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
                      )}
                    >
                      {r === 'admin' ? '👑 Admin' : '🛡️ Member'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resend for pending */}
          {!member.accepted && (
            <button
              onClick={() => onResend(member.email)}
              disabled={resending}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
              title="Resend invite"
            >
              {resending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </button>
          )}

          {/* Remove */}
          <button
            onClick={() => onRemove(member.email)}
            disabled={removing}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove member"
          >
            {removing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      )}
    </div>
  )
}

export default function TeamSettings() {
  const qc = useQueryClient()
  const { updateUser } = useAuthStore()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [removingEmail, setRemovingEmail] = useState<string | null>(null)
  const [resendingEmail, setResendingEmail] = useState<string | null>(null)
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)
  const [lastResendUrl, setLastResendUrl] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get('/teams').then((r) => r.data as TeamData),
  })

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      api.post('/teams/invite', { email, role }),
    onSuccess: ({ data: d }) => {
      toast.success('Invitation created!')
      setInviteEmail('')
      if (d.inviteUrl) {
        setLastInviteUrl(d.inviteUrl)
        // Also try clipboard silently
        copyToClipboard(d.inviteUrl)
      }
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not send invite'),
  })

  const removeMutation = useMutation({
    mutationFn: (email: string) => api.delete(`/teams/${encodeURIComponent(email)}`),
    onSuccess: () => {
      toast.success('Member removed')
      setRemovingEmail(null)
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message ?? 'Could not remove member')
      setRemovingEmail(null)
    },
  })

  const resendMutation = useMutation({
    mutationFn: (email: string) => api.post(`/teams/${encodeURIComponent(email)}/resend`),
    onSuccess: ({ data: d }) => {
      toast.success('Invite regenerated')
      setResendingEmail(null)
      if (d.inviteUrl) {
        setLastResendUrl(d.inviteUrl)
        copyToClipboard(d.inviteUrl)
      }
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message ?? 'Could not resend invite')
      setResendingEmail(null)
    },
  })

  const roleMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      api.patch(`/teams/${encodeURIComponent(email)}/role`, { role }),
    onSuccess: () => {
      toast.success('Role updated')
      qc.invalidateQueries({ queryKey: ['team'] })
    },
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

  const handleRemove = (email: string) => {
    setRemovingEmail(email)
    removeMutation.mutate(email)
  }

  const handleResend = (email: string) => {
    setResendingEmail(email)
    resendMutation.mutate(email)
  }

  const handleRoleChange = (email: string, role: 'admin' | 'member') => {
    roleMutation.mutate({ email, role })
  }

  const team = data
  const members = team?.members ?? []
  const active = members.filter(m => m.accepted)
  const pending = members.filter(m => !m.accepted)
  const canInvite = (team?.myRole === 'owner' || team?.myRole === 'admin') && team?.plan !== 'free'
  const canManage = team?.myRole === 'owner' || team?.myRole === 'admin'
  const isOwner = team?.isOwner ?? true
  const atLimit = team?.seatLimit != null && (team?.seatUsed ?? 0) >= team.seatLimit
  const isFreePlan = team?.plan === 'free'

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <Users size={22} className="text-brand-400" />
              {isOwner ? 'Team' : `${team?.ownerName ?? 'Team'}'s Workspace`}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {isOwner
                ? 'Invite collaborators to your ForgeAI workspace.'
                : `You have ${team?.myRole === 'admin' ? 'admin' : 'member'} access to this workspace.`}
            </p>
          </div>

          {/* Leave button for members */}
          {!isOwner && (
            <button
              onClick={() => leaveMutation.mutate()}
              disabled={leaveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-zinc-500 border border-white/5 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 transition-all"
            >
              {leaveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
              Leave team
            </button>
          )}
        </div>

        {/* Member view — your role banner */}
        {!isOwner && (
          <div className="glass rounded-2xl border border-white/5 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-violet-500/20 border border-brand-500/20 flex items-center justify-center">
              <Users size={16} className="text-brand-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Member of <span className="text-brand-400">{team?.ownerName ?? 'this team'}</span>
              </p>
              <p className="text-xs text-zinc-500">{team?.ownerEmail}</p>
            </div>
            <div className="ml-auto">
              <RoleBadge role={team?.myRole ?? 'member'} />
            </div>
          </div>
        )}

        {/* Plan + seat usage (owner only) */}
        {isOwner && (
          <div className="glass rounded-2xl border border-white/5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-300 flex items-center gap-1.5">
                {team?.plan === 'team' ? <Star size={14} className="text-violet-400" /> : <Zap size={14} className="text-brand-400" />}
                {team?.plan === 'team' ? 'Team Plan' : team?.plan === 'pro' ? 'Pro Plan' : 'Free Plan'}
              </span>
              {team?.plan === 'pro' && atLimit && (
                <a
                  href="/pricing"
                  className="text-[11px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Upgrade for unlimited →
                </a>
              )}
              {isFreePlan && (
                <a
                  href="/pricing"
                  className="text-[11px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Upgrade to invite members →
                </a>
              )}
            </div>
            {team && <SeatMeter used={team.seatUsed} limit={team.seatLimit} />}
          </div>
        )}

        {/* Free plan upgrade notice */}
        {isOwner && isFreePlan && (
          <div className="glass rounded-2xl border border-amber-500/20 p-5 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Team seats require Pro or Team plan</p>
              <p className="text-xs text-zinc-400 mt-1">
                Upgrade your plan to invite team members and collaborate on repos. You're on the free plan.
              </p>
              <a
                href="/pricing"
                className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-brand-400 hover:text-brand-300"
              >
                View pricing <ExternalLink size={10} />
              </a>
            </div>
          </div>
        )}

        {/* Invite form */}
        {(canInvite || (isOwner && !isFreePlan)) && (
          <div className="glass rounded-2xl border border-white/5 p-6">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
              <UserPlus size={15} /> Invite a member
            </h2>

            {/* SMTP notice */}
            {!data?.smtpConfigured && (
              <div className="mb-4 flex items-start gap-2 text-xs text-zinc-500 bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                <AlertCircle size={12} className="text-amber-500 mt-0.5 shrink-0" />
                <span>Email sending is not configured — after inviting, you'll get a link to share manually.</span>
              </div>
            )}

            {atLimit ? (
              <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                <AlertCircle size={14} />
                Seat limit reached.{' '}
                <a href="/pricing" className="underline hover:text-amber-300">Upgrade to Team plan</a> for unlimited seats.
              </div>
            ) : (
              <>
                <div className="flex gap-3 flex-col sm:flex-row">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => { setInviteEmail(e.target.value); setLastInviteUrl(null) }}
                    onKeyDown={(e) => e.key === 'Enter' && inviteEmail.trim() && inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
                    placeholder="colleague@company.com"
                    className="flex-1 bg-surface-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500/50"
                  />
                  <div className="flex gap-2">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                      className="bg-surface-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:border-brand-500/50"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
                      disabled={!inviteEmail.trim() || inviteMutation.isPending}
                      className="gradient-btn px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                    >
                      {inviteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                      Invite
                    </button>
                  </div>
                </div>

                {/* Show invite link prominently after success */}
                {lastInviteUrl && (
                  <InviteLinkBox url={lastInviteUrl} onDismiss={() => setLastInviteUrl(null)} />
                )}

                {/* Show resend result link */}
                {lastResendUrl && (
                  <InviteLinkBox url={lastResendUrl} onDismiss={() => setLastResendUrl(null)} />
                )}
              </>
            )}
            <p className="text-xs text-zinc-600 mt-3">
              <Crown size={10} className="inline mr-1 text-amber-500" />Admin — can invite members and manage the workspace.{' '}
              <Shield size={10} className="inline mr-1 text-zinc-500" />Member — read/write access to repos and tasks.
            </p>
          </div>
        )}

        {/* Active members */}
        <div className="glass rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Check size={13} className="text-emerald-500" />
              Active members
              <span className="text-zinc-600 font-normal">({active.length})</span>
            </h2>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-brand-500" size={24} />
            </div>
          ) : active.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
              <Users size={28} className="mb-2 opacity-30" />
              <p className="text-sm">No active members yet</p>
              <p className="text-xs text-zinc-700 mt-1">Invite someone — they'll appear here once they accept.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {active.map((m) => (
                <MemberRow
                  key={m.email}
                  member={m}
                  canManage={canManage}
                  isOwner={isOwner}
                  onRemove={handleRemove}
                  onResend={handleResend}
                  onRoleChange={handleRoleChange}
                  removing={removingEmail === m.email && removeMutation.isPending}
                  resending={resendingEmail === m.email && resendMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pending invites */}
        {pending.length > 0 && (
          <div className="glass rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                <Clock size={13} className="text-zinc-500" />
                Pending invites
                <span className="text-zinc-600 font-normal">({pending.length})</span>
              </h2>
            </div>
            <div className="divide-y divide-white/5">
              {pending.map((m) => (
                <MemberRow
                  key={m.email}
                  member={m}
                  canManage={canManage}
                  isOwner={isOwner}
                  onRemove={handleRemove}
                  onResend={handleResend}
                  onRoleChange={handleRoleChange}
                  removing={removingEmail === m.email && removeMutation.isPending}
                  resending={resendingEmail === m.email && resendMutation.isPending}
                />
              ))}
            </div>
          </div>
        )}

        {/* Role legend */}
        <div className="glass rounded-2xl border border-white/5 p-5 space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Role permissions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <RoleBadge role="owner" />
              <p className="text-zinc-600">Full control, billing, can transfer ownership</p>
            </div>
            <div className="space-y-1">
              <RoleBadge role="admin" />
              <p className="text-zinc-600">Invite members, manage repos and tasks</p>
            </div>
            <div className="space-y-1">
              <RoleBadge role="member" />
              <p className="text-zinc-600">Access team repos and tasks, read-write</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
