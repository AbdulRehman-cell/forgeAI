import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Plus, Search, Loader2, Lock, Globe, ArrowRight, FolderOpen, Laptop, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import LocalFolderPicker from '@/components/LocalFolderPicker'

export default function Repositories() {
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: () => api.get('/repositories').then((r) => r.data.repositories),
  })

  const { data: ghRepos, isLoading: ghLoading } = useQuery({
    queryKey: ['github-repos'],
    queryFn: () => api.get('/github/repos').then((r) => r.data.repositories),
    enabled: showImport,
  })

  const importMutation = useMutation({
    mutationFn: (repoData: any) => api.post('/repositories/import', repoData),
    onSuccess: () => {
      toast.success('Repository import started')
      qc.invalidateQueries({ queryKey: ['repos'] })
      setShowImport(false)
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Import failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/repositories/${id}`),
    onSuccess: () => {
      toast.success('Repository removed')
      qc.invalidateQueries({ queryKey: ['repos'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not remove repository'),
  })

  const removeRepo = (e: React.MouseEvent, repo: any) => {
    e.stopPropagation()
    const detail = repo.source === 'local'
      ? 'Your folder on disk is not touched.'
      : 'The local clone and its task history will be deleted. The GitHub repository itself is not touched.'
    if (window.confirm(`Remove ${repo.fullName} from Forge AI?\n\n${detail}`)) {
      deleteMutation.mutate(repo._id)
    }
  }

  const openFolderMutation = useMutation({
    mutationFn: (path: string) => api.post('/local/open', { path }),
    onSuccess: ({ data }) => {
      toast.success('Folder opened — Forge AI is in command')
      qc.invalidateQueries({ queryKey: ['repos'] })
      setShowFolderPicker(false)
      navigate(`/repositories/${data.repository._id}/workspace`)
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not open folder'),
  })

  const filtered = data?.filter((r: any) =>
    r.fullName.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Repositories</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage your connected repositories.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFolderPicker(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-surface-600 text-sm font-medium text-zinc-300 hover:text-zinc-100 hover:border-brand-500/50 transition-colors"
          >
            <FolderOpen size={15} /> Open Local Folder
          </button>
          <button onClick={() => setShowImport(true)} className="btn-primary flex items-center gap-2">
            <Plus size={15} /> Import Repository
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          className="input pl-9"
          placeholder="Search repositories…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-zinc-500" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered?.map((repo: any) => (
            <div
              key={repo._id}
              className="card p-4 flex items-center gap-4 cursor-pointer hover:border-surface-600 transition-colors"
              onClick={() => navigate(repo.source === 'local'
                ? `/repositories/${repo._id}/workspace`
                : `/repositories/${repo._id}`)}
            >
              {repo.source === 'local'
                ? <Laptop size={14} className="text-brand-400" />
                : repo.private ? <Lock size={14} className="text-zinc-500" /> : <Globe size={14} className="text-zinc-500" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100">{repo.fullName}</p>
                <p className="text-xs text-zinc-500 truncate">
                  {repo.source === 'local'
                    ? (repo.description ?? 'Local folder')
                    : `${repo.language ?? 'Unknown'} · ${repo.defaultBranch}`}
                </p>
              </div>
              {repo.deployState?.monitor?.status && (
                <span
                  title={`${repo.deployState.render?.url ?? ''} — last check: ${repo.deployState.monitor.lastDetail ?? ''}`}
                  className={`badge ${repo.deployState.monitor.status === 'up'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400'}`}
                >
                  {repo.deployState.monitor.status === 'up' ? '● live' : '● down'}
                </span>
              )}
              <span className={`badge ${repo.status === 'ready' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-700 text-zinc-400'}`}>
                {repo.status}
              </span>
              <button
                onClick={(e) => removeRepo(e, repo)}
                disabled={deleteMutation.isPending}
                title="Remove from Forge AI"
                className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
              <ArrowRight size={14} className="text-zinc-600" />
            </div>
          ))}
        </div>
      )}

      {/* Local Folder Picker */}
      {showFolderPicker && (
        <LocalFolderPicker
          onClose={() => setShowFolderPicker(false)}
          onSelect={(path) => openFolderMutation.mutate(path)}
          busy={openFolderMutation.isPending}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-zinc-100">Import from GitHub</h2>
              <button onClick={() => setShowImport(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>
            {ghLoading ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-zinc-500" />
              </div>
            ) : (
              <div className="overflow-y-auto space-y-1.5">
                {ghRepos?.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => importMutation.mutate({ githubId: r.id, fullName: r.full_name, name: r.name, description: r.description, language: r.language, private: r.private, defaultBranch: r.default_branch, cloneUrl: r.clone_url })}
                    className="w-full text-left card p-3 hover:border-brand-600/50 transition-colors"
                  >
                    <p className="text-sm font-medium text-zinc-100">{r.full_name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{r.language ?? 'Unknown'}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
