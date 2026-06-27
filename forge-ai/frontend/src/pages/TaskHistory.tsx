import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Loader2, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react'

export default function TaskHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks').then((r) => r.data.tasks),
  })

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-zinc-100 mb-6">Task History</h1>
      {isLoading ? (
        <div className="flex justify-center py-24"><Loader2 className="animate-spin text-zinc-500" /></div>
      ) : (
        <div className="space-y-2">
          {data?.map((task: any) => (
            <div key={task._id} className="card p-4 flex items-center gap-4">
              <StatusIcon status={task.status} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100">{task.type.replace(/_/g, ' ')}</p>
                <p className="text-xs text-zinc-500">{task.repositoryId?.fullName ?? task.repositoryId}</p>
              </div>
              <span className="text-xs text-zinc-500">{task.changes?.length ?? 0} files</span>
              <span className="text-xs text-zinc-600">{new Date(task.createdAt).toLocaleString()}</span>
            </div>
          ))}
          {!data?.length && <p className="text-zinc-600 text-sm py-8">No tasks yet.</p>}
        </div>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
  if (status === 'failed') return <XCircle size={16} className="text-red-400 shrink-0" />
  if (status === 'running') return <Zap size={16} className="text-brand-400 shrink-0 animate-pulse" />
  return <Clock size={16} className="text-zinc-500 shrink-0" />
}
