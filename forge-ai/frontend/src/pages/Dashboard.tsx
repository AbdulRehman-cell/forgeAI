import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { GitBranch, Clock, Zap, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const { data: repos } = useQuery({
    queryKey: ['repos'],
    queryFn: () => api.get('/repositories').then((r) => r.data.repositories),
  })

  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'recent'],
    queryFn: () => api.get('/tasks?limit=5').then((r) => r.data.tasks),
  })

  const stats = [
    { label: 'Repositories', value: repos?.length ?? 0, icon: GitBranch },
    { label: 'Tasks Run', value: tasks?.length ?? 0, icon: Clock },
    { label: 'Files Fixed', value: tasks?.reduce((a: number, t: any) => a + (t.changes?.length ?? 0), 0) ?? 0, icon: Zap },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">
          Good morning, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-zinc-400 mt-1">Here's what's happening with your projects.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500 font-medium">{label}</span>
              <Icon size={14} className="text-zinc-600" />
            </div>
            <p className="text-3xl font-bold text-zinc-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Recent Repos */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-300">Recent Repositories</h2>
          <button onClick={() => navigate('/repositories')} className="text-xs text-brand-400 hover:underline">
            View all
          </button>
        </div>
        <div className="space-y-2">
          {repos?.slice(0, 4).map((repo: any) => (
            <div
              key={repo._id}
              onClick={() => navigate(`/repositories/${repo._id}`)}
              className="card p-4 flex items-center gap-4 cursor-pointer hover:border-surface-600 transition-colors"
            >
              <GitBranch size={16} className="text-zinc-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">{repo.fullName}</p>
                <p className="text-xs text-zinc-500 truncate">{repo.description ?? 'No description'}</p>
              </div>
              <StatusBadge status={repo.status} />
            </div>
          ))}
          {!repos?.length && (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm mb-3">No repositories yet.</p>
              <button onClick={() => navigate('/repositories')} className="btn-primary">
                Import Repository
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: any; color: string; label: string }> = {
    ready: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Ready' },
    error: { icon: AlertCircle, color: 'text-red-400', label: 'Error' },
    indexing: { icon: Loader2, color: 'text-brand-400 animate-spin', label: 'Indexing' },
    cloning: { icon: Loader2, color: 'text-yellow-400 animate-spin', label: 'Cloning' },
    idle: { icon: Clock, color: 'text-zinc-500', label: 'Idle' },
  }
  const { icon: Icon, color, label } = map[status] ?? map.idle
  return (
    <span className={`flex items-center gap-1 text-xs ${color}`}>
      <Icon size={12} /> {label}
    </span>
  )
}
