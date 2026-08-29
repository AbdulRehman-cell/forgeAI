import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import { Github, Palette, Globe, Mail, Loader2, ShieldCheck, Unlink } from 'lucide-react'

export default function Settings() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [provider, setProvider] = useState<'openai' | 'claude' | 'gemini'>('claude')

  // White-label state
  const [wlBrandName, setWlBrandName] = useState('')
  const [wlLogoUrl, setWlLogoUrl] = useState('')
  const [wlColor, setWlColor] = useState('#6366f1')
  const [wlEmail, setWlEmail] = useState('')

  const { data: wlData } = useQuery({
    queryKey: ['whitelabel'],
    queryFn: () => api.get('/whitelabel').then((r) => r.data as { whiteLabel: any }),
  })

  useEffect(() => {
    if (wlData?.whiteLabel) {
      setWlBrandName(wlData.whiteLabel.brandName ?? '')
      setWlLogoUrl(wlData.whiteLabel.logoUrl ?? '')
      setWlColor(wlData.whiteLabel.primaryColor ?? '#6366f1')
      setWlEmail(wlData.whiteLabel.supportEmail ?? '')
    }
  }, [wlData])

  const connectGithub = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/github`
  }

  const { data: gmailStatus } = useQuery({
    queryKey: ['gmail-status'],
    queryFn: () => api.get('/gmail/status').then(r => r.data as { connected: boolean; email: string | null }),
    staleTime: 30_000,
  })

  const gmailDisconnect = useMutation({
    mutationFn: () => api.delete('/gmail/disconnect'),
    onSuccess: () => { toast.success('Gmail disconnected'); qc.invalidateQueries({ queryKey: ['gmail-status'] }) },
    onError: () => toast.error('Could not disconnect'),
  })

  const saveProvider = useMutation({
    mutationFn: () => api.put('/settings/ai-provider', { provider }),
    onSuccess: () => toast.success('AI provider saved'),
  })

  const saveWhiteLabel = useMutation({
    mutationFn: () => api.put('/whitelabel', {
      brandName: wlBrandName, logoUrl: wlLogoUrl, primaryColor: wlColor, supportEmail: wlEmail,
    }),
    onSuccess: () => toast.success('White-label settings saved'),
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not save'),
  })

  const isPaidPlan = ['pro', 'team'].includes((user as any)?.plan ?? '')

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-zinc-100 mb-8">Settings</h1>

        {/* Gmail — cold outreach */}
        <section className="card p-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-1 flex items-center gap-2">
            <Mail size={14} /> Gmail Integration
          </h2>
          <p className="text-xs text-zinc-600 mb-4">Connect your Gmail account to send cold emails directly from the Outreach page without leaving ForgeAI.</p>

          {gmailStatus?.connected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <ShieldCheck size={15} /> Connected as <span className="text-zinc-300 ml-1">{gmailStatus.email}</span>
              </div>
              <button
                onClick={() => gmailDisconnect.mutate()}
                disabled={gmailDisconnect.isPending}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-colors"
              >
                <Unlink size={12} /> Disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => api.get('/gmail/connect').then(r => { window.location.href = r.data.url }).catch(e => toast.error(e.response?.data?.message ?? 'Could not start Gmail connect'))}
                className="btn-secondary flex items-center gap-2"
              >
                <Mail size={15} /> Connect Gmail
              </button>
              <p className="text-xs text-zinc-600">You'll be redirected to Google to authorize ForgeAI to send emails on your behalf. We only request send permission — we never read your inbox.</p>
            </div>
          )}
        </section>

        {/* GitHub */}
        <section className="card p-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Github size={14} /> GitHub Integration
          </h2>
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
        <section className="card p-6">
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

        {/* White-label (Pro/Team) */}
        <section className="card p-6 relative">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Palette size={14} /> Agency White-Label
              {!isPaidPlan && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">PRO</span>
              )}
            </h2>
          </div>

          {!isPaidPlan && (
            <div className="absolute inset-0 bg-surface-900/60 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
              <p className="text-sm text-zinc-400">Upgrade to Pro or Team to enable white-labeling</p>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Brand Name</label>
              <input
                value={wlBrandName}
                onChange={(e) => setWlBrandName(e.target.value)}
                placeholder="Acme Digital"
                className="w-full bg-surface-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block flex items-center gap-1"><Globe size={11} /> Logo URL</label>
              <input
                value={wlLogoUrl}
                onChange={(e) => setWlLogoUrl(e.target.value)}
                placeholder="https://yoursite.com/logo.png"
                className="w-full bg-surface-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Primary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={wlColor}
                  onChange={(e) => setWlColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                />
                <input
                  value={wlColor}
                  onChange={(e) => setWlColor(e.target.value)}
                  className="flex-1 bg-surface-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-brand-500/50"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block flex items-center gap-1"><Mail size={11} /> Support Email</label>
              <input
                value={wlEmail}
                onChange={(e) => setWlEmail(e.target.value)}
                placeholder="support@youragency.com"
                className="w-full bg-surface-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500/50"
              />
            </div>
            <button
              onClick={() => saveWhiteLabel.mutate()}
              disabled={saveWhiteLabel.isPending}
              className="btn-primary flex items-center gap-2"
            >
              {saveWhiteLabel.isPending && <Loader2 size={14} className="animate-spin" />}
              Save White-Label
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
