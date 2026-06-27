import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import { Github } from 'lucide-react'

export default function Settings() {
  const { user, updateUser } = useAuthStore()
  const [provider, setProvider] = useState<'openai' | 'claude' | 'gemini'>('claude')

  const connectGithub = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/github`
  }

  const saveProvider = useMutation({
    mutationFn: () => api.put('/settings/ai-provider', { provider }),
    onSuccess: () => toast.success('Settings saved'),
  })

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-100 mb-8">Settings</h1>

      {/* GitHub */}
      <section className="card p-6 mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">GitHub Integration</h2>
        {user?.githubConnected ? (
          <div className="flex items-center gap-2 text-emerald-400 text-sm">
            <Github size={15} /> GitHub connected
          </div>
        ) : (
          <button onClick={connectGithub} className="btn-secondary flex items-center gap-2">
            <Github size={15} /> Connect GitHub
          </button>
        )}
      </section>

      {/* AI Provider */}
      <section className="card p-6 mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">AI Provider</h2>
        <div className="flex gap-2 mb-4">
          {(['openai', 'claude', 'gemini'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                provider === p
                  ? 'bg-brand-600/20 border-brand-600/50 text-brand-400'
                  : 'border-surface-600 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p === 'openai' ? 'OpenAI' : p === 'claude' ? 'Claude' : 'Gemini'}
            </button>
          ))}
        </div>
        <button onClick={() => saveProvider.mutate()} className="btn-primary">
          Save
        </button>
      </section>
    </div>
  )
}
