import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import { Github, Palette, Globe, Mail, Loader2, ShieldCheck, Unlink, MessageCircle } from 'lucide-react'

export default function Settings() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [provider, setProvider] = useState<'openai' | 'claude' | 'gemini'>('claude')

  // WhatsApp state
  const [waExpanded, setWaExpanded] = useState(false)
  const [waToken, setWaToken] = useState('')
  const [waPhoneId, setWaPhoneId] = useState('')
  const [waTestTo, setWaTestTo] = useState('')
  const [waTestResult, setWaTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

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

  const { data: waStatus } = useQuery({
    queryKey: ['wa-status'],
    queryFn: () => api.get('/whatsapp/status').then(r => r.data as { connected: boolean; displayPhone: string | null; verifiedName: string | null; phoneNumberId: string | null }),
    staleTime: 30_000,
  })

  const waDisconnect = useMutation({
    mutationFn: () => api.delete('/whatsapp/disconnect'),
    onSuccess: () => { toast.success('WhatsApp disconnected'); qc.invalidateQueries({ queryKey: ['wa-status'] }) },
    onError: () => toast.error('Could not disconnect'),
  })

  const sendWATest = useMutation({
    mutationFn: () => api.post('/settings/whatsapp/send-test', { to: waTestTo }),
    onSuccess: () => setWaTestResult({ ok: true, msg: 'Message sent! Check your WhatsApp.' }),
    onError: (e: any) => setWaTestResult({ ok: false, msg: e.response?.data?.error ?? e.response?.data?.message ?? 'Send failed' }),
  })

  const saveWA = useMutation({
    mutationFn: () => api.put('/settings/whatsapp', { accessToken: waToken, phoneNumberId: waPhoneId }),
    onSuccess: () => { toast.success('WhatsApp credentials saved'); qc.invalidateQueries({ queryKey: ['wa-status'] }); setWaToken(''); setWaPhoneId('') },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not save'),
  })

  // Handle OAuth callback query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const waResult = params.get('wa')
    if (waResult === 'connected') {
      const phone = params.get('phone')
      const name = params.get('name')
      toast.success(`WhatsApp connected${name ? `: ${name}` : ''}${phone ? ` (${phone})` : ''}`)
      qc.invalidateQueries({ queryKey: ['wa-status'] })
      window.history.replaceState({}, '', '/settings')
    } else if (waResult === 'error') {
      const reason = params.get('reason')
      toast.error(`WhatsApp connection failed${reason ? `: ${reason}` : ''}`)
      window.history.replaceState({}, '', '/settings')
    }
  }, [])

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
      <div className="p-4 sm:p-6 md:p-8 max-w-2xl space-y-4">
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

        {/* WhatsApp Business */}
        <section className="card p-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-1 flex items-center gap-2">
            <MessageCircle size={14} className="text-emerald-400" /> WhatsApp Business
          </h2>
          <p className="text-xs text-zinc-600 mb-4">
            Connect your WhatsApp Business account to auto-send messages while you sleep — just like Gmail.
          </p>

          {waStatus?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <ShieldCheck size={15} />
                  <span>{waStatus.verifiedName ?? 'Connected'}</span>
                  {waStatus.displayPhone && <span className="text-zinc-400 text-xs">{waStatus.displayPhone}</span>}
                </div>
                <button
                  onClick={() => waDisconnect.mutate()}
                  disabled={waDisconnect.isPending}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-colors"
                >
                  <Unlink size={12} /> Disconnect
                </button>
              </div>
              <p className="text-xs text-zinc-600">
                Messages will auto-send on schedule from your WhatsApp Business number. Enable auto-send on any prospect sequence in Outreach.
              </p>
              <div className="border-t border-white/5 pt-3 space-y-2">
                <p className="text-xs text-zinc-500 font-medium">Send a test message</p>
                <div className="flex gap-2">
                  <input
                    value={waTestTo}
                    onChange={e => { setWaTestTo(e.target.value); setWaTestResult(null) }}
                    placeholder="+44 7404 891578"
                    className="input flex-1 text-sm h-9"
                  />
                  <button
                    onClick={() => sendWATest.mutate()}
                    disabled={sendWATest.isPending || !waTestTo.trim()}
                    className="btn-secondary text-sm px-4 h-9 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {sendWATest.isPending ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                    Send
                  </button>
                </div>
                {waTestResult && (
                  <p className={`text-xs ${waTestResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {waTestResult.ok ? '✓' : '✗'} {waTestResult.msg}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() =>
                  api.get('/whatsapp/connect')
                    .then(r => { window.location.href = r.data.url })
                    .catch(e => toast.error(e.response?.data?.message ?? 'Could not start WhatsApp connect'))
                }
                className="btn-secondary flex items-center gap-2"
              >
                <MessageCircle size={15} className="text-emerald-400" /> Connect WhatsApp Business
              </button>
              <p className="text-xs text-zinc-600">
                You'll be redirected to Meta to authorize ForgeAI. We only get permission to send messages from your number — we never read your chats.
              </p>

              {/* Advanced / manual setup toggle */}
              <button
                onClick={() => setWaExpanded(v => !v)}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline transition-colors"
              >
                {waExpanded ? '▾ Hide manual setup' : '▸ Advanced: paste credentials manually'}
              </button>

              {waExpanded && (
                <div className="space-y-3 pt-1 border-t border-white/5">
                  <p className="text-xs text-zinc-500">
                    Get your credentials from{' '}
                    <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">Meta Developers</a>
                    {' '}→ your app → WhatsApp → API Setup.
                  </p>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Access Token</label>
                    <input
                      type="password"
                      value={waToken}
                      onChange={e => setWaToken(e.target.value)}
                      placeholder="Paste your permanent access token"
                      className="input w-full text-sm h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">Phone Number ID</label>
                    <input
                      value={waPhoneId}
                      onChange={e => setWaPhoneId(e.target.value)}
                      placeholder="e.g. 123456789012345"
                      className="input w-full text-sm h-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveWA.mutate()}
                      disabled={saveWA.isPending || !waToken || !waPhoneId}
                      className="btn-primary text-sm px-4 py-2"
                    >
                      {saveWA.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* GitHub */}
        <section className="card p-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Github size={14} /> GitHub Integration
          </h2>
          {user?.githubConnected ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <Github size={15} /> GitHub connected
              </div>
              <button onClick={connectGithub} className="btn-secondary flex items-center gap-2 text-xs py-1 px-2">
                <Github size={13} /> Reconnect
              </button>
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
