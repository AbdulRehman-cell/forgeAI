import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Users, UserPlus, Trash2, Mail, Check, Clock, Loader2, Shield, Crown } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

interface TeamMember {
  email: string
  role: 'admin' | 'member'
  accepted: boolean
  invitedAt: string
  userId?: string
}

export default function TeamSettings() {
  const qc = useQueryClient()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')

  const { data, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get('/teams').then((r) => r.data as { members: TeamMember[] }),
  })

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      api.post('/teams/invite', { email, role }),
    onSuccess: ({ data: d }) => {
      toast.success('Invitation sent')
      if (d.inviteUrl) {
        navigator.clipboard?.writeText(d.inviteUrl).catch(() => {})
        toast('Invite link copied to clipboard', { icon: '🔗' })
      }
      setInviteEmail('')
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not send invite'),
  })

  const removeMutation = useMutation({
    mutationFn: (email: string) => api.delete(`/teams/${encodeURIComponent(email)}`),
    onSuccess: () => {
      toast.success('Member removed')
      qc.invalidateQueries({ queryKey: ['team'] })
    },
  })

  const members = data?.members ?? []

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Users size={22} className="text-brand-400" />
            Team Seats
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Invite collaborators to your ForgeAI workspace. Pro plan supports 3 seats; Team plan is unlimited.</p>
        </div>

        {/* Invite form */}
        <div className="glass rounded-2xl border border-white/5 p-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <UserPlus size={15} /> Invite a member
          </h2>
          <div className="flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="flex-1 bg-surface-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500/50"
            />
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
              className="gradient-btn px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
            >
              {inviteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Invite
            </button>
          </div>
        </div>

        {/* Member list */}
        <div className="glass rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-sm font-semibold text-zinc-300">
              Members ({members.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-brand-500" size={24} />
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
              <Users size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No team members yet</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {members.map((m) => (
                <div key={m.email} className="flex items-center gap-4 px-6 py-4">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                    {m.email[0]?.toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200 flex items-center gap-1.5">
                        <Mail size={12} className="text-zinc-500" />
                        {m.email}
                      </span>
                      {m.role === 'admin' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 flex items-center gap-1">
                          <Crown size={9} /> Admin
                        </span>
                      )}
                      {m.role === 'member' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-700/60 text-zinc-400 flex items-center gap-1">
                          <Shield size={9} /> Member
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1">
                      {m.accepted ? (
                        <><Check size={10} className="text-green-500" /> Accepted</>
                      ) : (
                        <><Clock size={10} /> Invited {new Date(m.invitedAt).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>

                  <button
                    onClick={() => removeMutation.mutate(m.email)}
                    className={clsx(
                      'p-1.5 rounded-lg transition-colors text-zinc-600',
                      'hover:text-red-400 hover:bg-red-500/10',
                    )}
                    title="Remove member"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
