import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Zap, GitBranch, FileCode2, Clock, Loader2, AlertCircle, Share2, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'

export default function RepositoryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: repo, isLoading } = useQuery({
    queryKey: ['repo', id],
    queryFn: () => api.get(`/repositories/${id}`).then((r) => r.data.repository),
    refetchInterval: (q) => (['cloning', 'indexing'].includes(q.state.data?.status)) ? 3000 : false,
  })

  const { data: tasks } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => api.get(`/tasks?repositoryId=${id}`).then((r) => r.data.tasks),
  })

  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    setSharing(true)
    try {
      const { data } = await api.post(`/repositories/${id}/share`)
      setShareUrl(data.shareUrl)
    } catch {
      toast.error('Could not generate share link')
    } finally {
      setSharing(false)
    }
  }

  const copyUrl = () => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Link copied!')
  }

  if (isLoading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-zinc-500" /></div>
  if (!repo) return <div className="p-8 text-zinc-500">Repository not found.</div>

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
            <button onClick={() => navigate('/repositories')} className="hover:text-zinc-300">Repositories</button>
            <span>/</span>
            <span className="text-zinc-300">{repo.fullName}</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">{repo.name}</h1>
          <p className="text-zinc-400 text-sm mt-1">{repo.description ?? 'No description'}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Share Report */}
          {shareUrl ? (
            <div className="flex items-center gap-1.5">
              <input
                readOnly
                value={shareUrl}
                className="px-2.5 py-1.5 rounded-lg bg-surface-800 border border-surface-600 text-xs font-mono text-zinc-300 w-64 truncate"
              />
              <button
                onClick={copyUrl}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
          ) : (
            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-600 text-xs text-zinc-300 hover:text-zinc-100 hover:border-brand-500/50 transition-colors"
            >
              {sharing ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />}
              Share Report
            </button>
          )}

          <button
            onClick={() => navigate(`/repositories/${id}/workspace`)}
            disabled={repo.status !== 'ready'}
            className="btn-primary flex items-center gap-2"
          >
            <Zap size={15} /> Open Workspace
          </button>
        </div>
      </div>

      {/* Status banner */}
      {repo.status !== 'ready' && (
        <div className="card p-4 mb-6 flex items-center gap-3">
          {repo.status === 'error' ? (
            <AlertCircle size={16} className="text-red-400" />
          ) : (
            <Loader2 size={16} className="animate-spin text-brand-400" />
          )}
          <p className="text-sm text-zinc-300">
            {repo.status === 'cloning' && 'Cloning repository…'}
            {repo.status === 'indexing' && 'Indexing files…'}
            {repo.status === 'error' && 'An error occurred during setup.'}
          </p>
        </div>
      )}

      {/* Meta */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Language', value: repo.language ?? 'Unknown', icon: FileCode2 },
          { label: 'Branch', value: repo.defaultBranch, icon: GitBranch },
          { label: 'Tasks Run', value: tasks?.length ?? 0, icon: Clock },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={13} className="text-zinc-500" />
              <span className="text-xs text-zinc-500">{label}</span>
            </div>
            <p className="text-sm font-semibold text-zinc-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Task history for this repo */}
      <h2 className="text-sm font-semibold text-zinc-300 mb-3">Recent Tasks</h2>
      <div className="space-y-2">
        {tasks?.map((task: any) => (
          <div key={task._id} className="card p-4 flex items-center gap-4">
            <span className={`badge ${task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : task.status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-zinc-700 text-zinc-400'}`}>
              {task.status}
            </span>
            <p className="text-sm text-zinc-300 flex-1">{task.type.replace('_', ' ')}</p>
            <p className="text-xs text-zinc-500">{task.changes?.length ?? 0} files changed</p>
            <p className="text-xs text-zinc-600">{new Date(task.createdAt).toLocaleDateString()}</p>
          </div>
        ))}
        {!tasks?.length && <p className="text-sm text-zinc-600 py-4">No tasks yet. Open the workspace to get started.</p>}
      </div>
    </div>
  )
}
