import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import {
  GitBranch, Clock, Zap, CheckCircle2, AlertCircle, Loader2,
  ArrowUpRight, Sparkles, TrendingUp, Rocket, XCircle, Activity, Target
} from 'lucide-react'
import clsx from 'clsx'

import UsageWidget from '@/components/UsageWidget'

const BUILDER_IDEAS = [
  '“a portfolio site with a photo gallery and contact form”',
  '“a landing page for my coffee subscription startup”',
  '“a restaurant site with menu and reservations”',
  '“a dark-themed personal blog with article cards”',
]

export default function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [ideaIndex, setIdeaIndex] = useState(0)

  // Rotate the builder example prompt every few seconds
  useEffect(() => {
    const t = setInterval(() => setIdeaIndex((i) => (i + 1) % BUILDER_IDEAS.length), 3500)
    return () => clearInterval(t)
  }, [])

  const { data: repos } = useQuery({
    queryKey: ['repos'],
    queryFn: () => api.get('/repositories').then((r) => r.data.repositories),
  })
  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'recent'],
    queryFn: () => api.get('/tasks?limit=5').then((r) => r.data.tasks),
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const completed = tasks?.filter((t: any) => t.status === 'completed').length ?? 0
  const successRate = tasks?.length ? Math.round((completed / tasks.length) * 100) : 0

  const stats = [
    { label: 'Repositories', value: repos?.length ?? 0, icon: GitBranch, gradient: 'from-blue-500 to-indigo-500' },
    { label: 'Tasks Run', value: tasks?.length ?? 0, icon: TrendingUp, gradient: 'from-indigo-500 to-violet-500' },
    { label: 'Files Fixed', value: tasks?.reduce((a: number, t: any) => a + (t.changes?.length ?? 0), 0) ?? 0, icon: Zap, gradient: 'from-violet-500 to-fuchsia-500' },
    { label: 'Success Rate', value: `${successRate}%`, icon: Target, gradient: 'from-emerald-500 to-teal-500' },
  ]

  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8 animate-fade-up">
        <div className="inline-flex items-center gap-2 glass text-brand-300 text-[11px] font-medium px-3 py-1 rounded-full mb-3">
          <Sparkles size={11} className="text-violet-400" /> Welcome back
        </div>
        <h1 className="text-3xl font-bold text-gradient">
          {greeting}, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-zinc-500 mt-1.5">Here's what's happening across your projects.</p>
      </div>

      {/* AI Builder promo */}
      <style>{PROMO_STYLES}</style>
      <button
        onClick={() => navigate('/builder')}
        className="w-full text-left card p-5 mb-8 relative overflow-hidden group border-brand-500/30 hover:border-brand-400/60 transition-colors"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-brand-600/10 via-violet-600/10 to-transparent" />
        <div className="promo-sheen pointer-events-none absolute inset-0" />
        <div className="relative flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-glow-sm shrink-0 group-hover:scale-110 transition-transform duration-300">
            <Sparkles size={19} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              AI Website Builder
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-brand-500 to-violet-500 text-white promo-badge">NEW</span>
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Describe a website — ForgeAI builds it, creates the GitHub repo, and deploys it live.
            </p>
            <p key={ideaIndex} className="text-[11px] font-mono text-brand-300/90 mt-1.5 promo-idea truncate">
              try: {BUILDER_IDEAS[ideaIndex]}
            </p>
          </div>
          <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-white bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 rounded-xl shadow-lg shadow-brand-600/25 shrink-0 group-hover:from-brand-500 group-hover:to-violet-500 transition-all">
            Build a site <ArrowUpRight size={13} />
          </span>
        </div>
      </button>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-8 stagger">
        {stats.map(({ label, value, icon: Icon, gradient }) => (
          <div key={label} className="card card-interactive p-6 relative overflow-hidden">
            <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${gradient} opacity-10 blur-2xl`} />
            <div className="flex items-center justify-between mb-3 relative">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
                <Icon size={18} className="text-white" />
              </div>
            </div>
            <p className="text-4xl font-bold text-gradient relative">{value}</p>
            <p className="text-xs text-zinc-500 mt-1 relative">{label}</p>
          </div>
        ))}
      </div>
      
      {/* Quick action banner + usage */}
      <div className="grid lg:grid-cols-3 gap-5 mb-8 animate-fade-up">
        <div className="card-glow p-6 lg:col-span-2 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-glow shrink-0">
            <Rocket size={26} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-zinc-100">Ready to fix some code?</h3>
            <p className="text-sm text-zinc-400 mt-0.5">Import a repository and let ForgeAI handle the rest.</p>
          </div>
          <button onClick={() => navigate('/repositories')} className="btn-primary shrink-0">
            <span className="flex items-center gap-2">Import Repo <ArrowUpRight size={15} /></span>
          </button>
        </div>
        <UsageWidget />
      </div>

      {/* Recent Repos + Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-6 pb-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300">Recent Repositories</h2>
            <button onClick={() => navigate('/repositories')} className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1">
              View all <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="space-y-2.5 stagger">
            {repos?.slice(0, 4).map((repo: any) => (
              <button
                key={repo._id}
                onClick={() => navigate(`/repositories/${repo._id}`)}
                className="w-full card card-interactive p-4 flex items-center gap-4 text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-surface-800 flex items-center justify-center shrink-0">
                  <GitBranch size={15} className="text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{repo.fullName}</p>
                  <p className="text-xs text-zinc-500 truncate">{repo.description ?? 'No description'}</p>
                </div>
                <StatusBadge status={repo.status} />
              </button>
            ))}
            {!repos?.length && (
              <div className="card p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500/20 to-violet-600/20 flex items-center justify-center mx-auto mb-4">
                  <GitBranch size={24} className="text-brand-400" />
                </div>
                <p className="text-zinc-400 text-sm mb-4">No repositories yet.</p>
                <button onClick={() => navigate('/repositories')} className="btn-primary">
                  Import Repository
                </button>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300">Recent Activity</h2>
            <button onClick={() => navigate('/tasks')} className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1">
              View all <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="space-y-2.5 stagger">
            {tasks?.slice(0, 4).map((task: any) => (
              <button
                key={task._id}
                onClick={() => navigate('/tasks')}
                className="w-full card card-interactive p-4 flex items-center gap-4 text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-surface-800 flex items-center justify-center shrink-0">
                  <TaskStatusIcon status={task.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 capitalize truncate">
                    {String(task.type ?? 'task').replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {task.repositoryId?.fullName ?? 'Repository'}
                    {(task.changes?.length ?? 0) > 0 && ` · ${task.changes.length} file(s)`}
                  </p>
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">
                  {new Date(task.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))}
            {!tasks?.length && (
              <div className="card p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500/20 to-violet-600/20 flex items-center justify-center mx-auto mb-4">
                  <Activity size={24} className="text-brand-400" />
                </div>
                <p className="text-zinc-400 text-sm">No activity yet.</p>
                <p className="text-zinc-600 text-xs mt-1">Run "Fix Workspace" in any repository to get started.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

function TaskStatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={15} className="text-emerald-400" />
  if (status === 'failed') return <XCircle size={15} className="text-red-400" />
  if (status === 'running') return <Loader2 size={15} className="text-brand-400 animate-spin" />
  return <Clock size={15} className="text-zinc-500" />
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: any; cls: string; label: string }> = {
    ready: { icon: CheckCircle2, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Ready' },
    error: { icon: AlertCircle, cls: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Error' },
    indexing: { icon: Loader2, cls: 'bg-brand-500/10 text-brand-400 border-brand-500/20 [&_svg]:animate-spin', label: 'Indexing' },
    cloning: { icon: Loader2, cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 [&_svg]:animate-spin', label: 'Cloning' },
    idle: { icon: Clock, cls: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/30', label: 'Idle' },
  }
  const { icon: Icon, cls, label } = map[status] ?? map.idle
  return (
    <span className={clsx('badge border', cls)}>
      <Icon size={11} /> {label}
    </span>
  )
}

// Animations for the AI Builder promo card
const PROMO_STYLES = `
@keyframes promo-sheen {
  0% { transform: translateX(-100%) skewX(-15deg); }
  55%, 100% { transform: translateX(240%) skewX(-15deg); }
}
.promo-sheen::after {
  content: '';
  position: absolute; top: 0; bottom: 0; width: 35%;
  background: linear-gradient(90deg, transparent, rgba(139,92,246,.08), transparent);
  animation: promo-sheen 4s ease-in-out infinite;
}
@keyframes promo-idea-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.promo-idea { animation: promo-idea-in .45s ease both; }
@keyframes promo-badge-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(139,92,246,.5); }
  50% { box-shadow: 0 0 0 4px rgba(139,92,246,0); }
}
.promo-badge { animation: promo-badge-pulse 2s ease-in-out infinite; }
`
