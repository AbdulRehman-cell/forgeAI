// AI Website Builder — Lovable-style: describe a site, ForgeAI generates it,
// pushes it to a brand-new GitHub repo, and deploys it with Blitz Deploy.
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import Markdown from '@/components/Markdown'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  Sparkles, Loader2, Github, FolderOpen, Rocket, Globe, CheckCircle2, XCircle, Wand2, FileText,
  Monitor, Tablet, Smartphone, Send, BarChart2, Construction, UserCheck, CalendarClock,
  Zap, TrendingUp, ArrowLeftRight, KeyRound, MessageCircle, ShieldCheck, Search, Star,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import type { Task } from '@/types'

const EXAMPLES = [
  'A sleek portfolio for a freelance photographer with a masonry gallery, about page, and contact form',
  'A landing page for a coffee subscription startup — hero, pricing tiers, testimonials, FAQ',
  'A restaurant website with a menu page, reservations form, and a photo gallery',
  'A personal blog with a dark aesthetic, article cards, and an about page',
]

const MERN_EXAMPLES = [
  'A recipe sharing app — browse recipes, add your own with ingredients and steps, search by name',
  'A task manager with projects, due dates, and a dashboard showing what is overdue',
  'A book review site — list books, write reviews with star ratings, top-rated page',
  'A simple job board — post jobs with tags, browse and filter openings',
]

function ScoreRow({ score }: { score: { performance: number; seo: number; accessibility: number; lcp?: string; fcp?: string } }) {
  const color = (n: number) => n >= 90 ? 'text-emerald-400' : n >= 50 ? 'text-yellow-400' : 'text-red-400'
  return (
    <div className="space-y-1.5">
      {[
        { label: 'Performance', val: score.performance },
        { label: 'SEO', val: score.seo },
        { label: 'Accessibility', val: score.accessibility },
      ].map(({ label, val }) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 w-24 shrink-0">{label}</span>
          <div className="flex-1 h-1.5 bg-surface-800 rounded-full overflow-hidden">
            <div className={clsx('h-full rounded-full', val >= 90 ? 'bg-emerald-500' : val >= 50 ? 'bg-yellow-500' : 'bg-red-500')} style={{ width: `${val}%` }} />
          </div>
          <span className={clsx('text-[10px] font-bold w-6 text-right', color(val))}>{val}</span>
        </div>
      ))}
      {score.lcp && (
        <div className="flex gap-3 mt-1">
          <span className="text-[10px] text-zinc-600">LCP {score.lcp}</span>
          {score.fcp && <span className="text-[10px] text-zinc-600">FCP {score.fcp}</span>}
        </div>
      )}
    </div>
  )
}

export default function Builder() {
  const [prompt, setPrompt] = useState('')
  const [name, setName] = useState('')
  const [stack, setStack] = useState<'static' | 'mern'>('static')
  const [style, setStyle] = useState<'auto' | 'minimal' | 'bold' | 'elegant'>('auto')
  const [importUrl, setImportUrl] = useState('')
  const [audit, setAudit] = useState<any>(null)
  // Two distinct jobs: build something new, or work on a site that already exists
  const [flow, setFlow] = useState<'new' | 'existing'>('new')
  const [force, setForce] = useState(false)
  const [domain, setDomain] = useState('')
  const [domainInfo, setDomainInfo] = useState<any>(null)
  const [verifyMsg, setVerifyMsg] = useState('')
  const [mongoUri, setMongoUri] = useState('')
  const [task, setTask] = useState<Task | null>(null)
  const [repoId, setRepoId] = useState<string | null>(null)
  const [tokenPlatform, setTokenPlatform] = useState<string | null>(null)
  const [tokenValue, setTokenValue] = useState('')
  // ── New feature state ──
  const [analyticsProvider, setAnalyticsProvider] = useState<'ga' | 'plausible' | ''>('')
  const [analyticsId, setAnalyticsId] = useState('')
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [showPreview, setShowPreview] = useState(false)
  const [editInstruction, setEditInstruction] = useState('')
  const [speedData, setSpeedData] = useState<any>(null)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [approvalData, setApprovalData] = useState<any>(null)
  const [maintenancePlanActive, setMaintenancePlanActive] = useState(false)
  const [envVarsRaw, setEnvVarsRaw] = useState('')
  const [savedEnvKeys, setSavedEnvKeys] = useState<string[]>([])
  // ── Add-ons ──
  const [addons, setAddons] = useState<string[]>([])
  const [vibeMode, setVibeMode] = useState(false)
  const [waTestState, setWaTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const logEndRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isPaidPlan = ['pro', 'team'].includes((user as any)?.plan ?? '')

  const isBuilding = task?.type === 'build_site' && (task.status === 'pending' || task.status === 'running')
  const isDeploying = task?.type === 'blitz_deploy' && (task.status === 'pending' || task.status === 'running')
  const buildDone = task?.type === 'build_site' && task.status === 'completed'
  const deployDone = task?.type === 'blitz_deploy' && task.status === 'completed'
  const deployUrl = (task?.metadata as any)?.deploymentUrl

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [task?.logs?.length])

  // ── Live task updates ──
  useEffect(() => {
    if (!task?._id) return
    const socket = getSocket()
    socket.emit('subscribe:task', task._id)
    const handler = (updated: Task) => {
      if (updated._id !== task._id) return
      setTask(updated)
      if (updated.status === 'completed') {
        toast.success(updated.type === 'build_site' ? '🎉 Website built!' : '🌐 Deployed!')
      }
      if (updated.status === 'failed') toast.error('Task failed — see the log')
    }
    socket.on('task:update', handler)
    return () => {
      socket.off('task:update', handler)
      socket.emit('unsubscribe:task', task._id)
    }
  }, [task?._id])

  // ── Build ──
  const buildMutation = useMutation({
    mutationFn: () => api.post('/tasks/build-site', {
      prompt: prompt.trim(),
      name: name.trim(),
      stack: flow === 'existing' ? 'static' : stack,
      style,
      ...(flow === 'existing' ? { importUrl: importUrl.trim(), force } : {}),
      ...(flow === 'new' && stack === 'mern' && mongoUri.trim() ? { mongoUri: mongoUri.trim() } : {}),
      ...(analyticsProvider ? { analyticsProvider, analyticsId: analyticsId.trim() } : {}),
      ...(addons.length > 0 ? { addons } : {}),
      ...(vibeMode ? { vibeMode: true } : {}),
    }),
    onSuccess: ({ data }) => {
      setTask(data.task)
      setRepoId(data.repository._id)
    },
    onError: (e: any) => {
      const data = e.response?.data
      // The server refused because the site is already good — surface its score
      if (data?.code === 'SITE_ALREADY_GOOD') {
        setAudit(data.audit)
        toast.error(data.message ?? 'That site is already in good shape')
        return
      }
      toast.error(data?.message ?? 'Could not start the build')
    },
  })

  // ── Deploy (reuses Blitz Deploy) ──
  const deployMutation = useMutation({
    mutationFn: (body: any) => api.post('/tasks/blitz-deploy', { repositoryId: repoId, platform: 'auto', ...body }),
    onSuccess: ({ data }) => {
      setTask(data.task)
      setTokenPlatform(null)
      setTokenValue('')
    },
    onError: (e: any) => {
      const data = e.response?.data
      if (data?.code === 'TOKEN_REQUIRED') {
        setTokenPlatform(data.platform)
        return
      }
      toast.error(data?.message ?? 'Deploy failed to start')
    },
  })

  // ── Website audit ──
  const auditMutation = useMutation({
    // Crawling several pages legitimately takes longer than the client default
    mutationFn: () => api.post('/tasks/audit', { url: importUrl.trim() }, { timeout: 60_000 }),
    // Audit is context (score + issues shown in the report); the flow is
    // always Claude Rebuild, so the verdict no longer picks a mode.
    onSuccess: ({ data }) => { setAudit(data.audit); setForce(false) },
    onError: (e: any) => {
      // No response at all = the request timed out or the API is unreachable —
      // say that, rather than blaming the site being scored.
      if (!e.response) {
        toast.error(e.code === 'ECONNABORTED'
          ? 'That site took too long to analyze — it may be very slow. Try again.'
          : 'Could not reach the ForgeAI server — is the backend running?')
        return
      }
      toast.error(e.response?.data?.message ?? 'Could not analyze that site')
    },
  })

  // ── Custom domain ──
  const domainMutation = useMutation({
    mutationFn: () => api.post('/tasks/domain', { repositoryId: repoId, domain: domain.trim() }),
    onSuccess: ({ data }) => {
      setDomainInfo(data)
      setVerifyMsg('')
      toast.success('Domain added — now add the DNS record below')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not add that domain'),
  })

  const verifyMutation = useMutation({
    mutationFn: () => api.post('/tasks/domain/verify', { repositoryId: repoId, domainId: domainInfo?.domain?.id }),
    onSuccess: ({ data }) => {
      setVerifyMsg(data.message)
      if (data.verified) toast.success('Domain verified and live!')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not verify yet'),
  })

  // ── Edit-After-Generate ──
  const patchMutation = useMutation({
    mutationFn: () => api.post('/tasks/patch-site', { repositoryId: repoId, instruction: editInstruction.trim() }),
    onSuccess: ({ data }) => { setTask(data.task); setEditInstruction(''); toast.success('Patch started!') },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not start patch'),
  })

  // ── Page Speed Score ──
  const speedScoreMutation = useMutation({
    mutationFn: () => api.get(`/repositories/${repoId}/speed-score`, {
      params: { importUrl: importUrl || undefined },
    }),
    onSuccess: ({ data }) => setSpeedData(data),
    onError: () => toast.error('Could not fetch speed scores — try again in a moment'),
  })

  // ── Maintenance Mode ──
  const maintenanceMutation = useMutation({
    mutationFn: (enabled: boolean) => api.post(`/repositories/${repoId}/maintenance`, { enabled }),
    onSuccess: ({ data }) => { setMaintenanceMode(data.maintenanceMode); toast.success(data.maintenanceMode ? 'Maintenance mode ON' : 'Maintenance mode OFF') },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not toggle maintenance'),
  })

  // ── Client Approval ──
  const approvalMutation = useMutation({
    mutationFn: () => api.post(`/repositories/${repoId}/approval`),
    onSuccess: ({ data }) => {
      setApprovalData(data)
      navigator.clipboard?.writeText(data.approvalUrl).catch(() => {})
      toast.success('Approval link copied to clipboard!')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not create approval link'),
  })

  // ── Maintenance Plan ──
  const maintenancePlanMutation = useMutation({
    mutationFn: (active: boolean) => api.post(`/repositories/${repoId}/maintenance-plan`, { active }),
    onSuccess: ({ data }) => {
      setMaintenancePlanActive(data.maintenancePlan?.active ?? false)
      toast.success(data.maintenancePlan?.active ? 'Monthly maintenance plan activated' : 'Maintenance plan cancelled')
    },
  })

  const envVarsMutation = useMutation({
    mutationFn: () => api.put(`/repositories/${repoId}/env-vars`, { raw: envVarsRaw }),
    onSuccess: ({ data }) => {
      setSavedEnvKeys(data.savedKeys)
      toast.success(`${data.savedKeys.length} env var${data.savedKeys.length !== 1 ? 's' : ''} saved — applied on next deploy`)
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Could not save env vars'),
  })

  const { data: waStatus } = useQuery({
    queryKey: ['wa-status'],
    queryFn: () => api.get('/whatsapp/status').then(r => r.data as { connected: boolean; displayPhone: string | null; verifiedName: string | null }),
    staleTime: 60_000,
  })

  const repoFullName = buildDone || deployDone || isDeploying
    ? /\[([^\]]+\/[^\]]+)\]/.exec(task?.summary ?? '')?.[1] ?? null
    : null

  const busy = isBuilding || buildMutation.isPending

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* ── Hero ── */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-600/10 border border-brand-500/30 text-brand-400 text-xs font-semibold mb-4">
            <Sparkles size={12} /> NEW · AI Builder
          </div>
          <h1 className="text-4xl font-bold text-zinc-100 mb-3">
            Build a website <span className="text-gradient">with AI</span>
          </h1>
          <p className="text-zinc-400 text-sm max-w-xl mx-auto">
            Describe the site you want. ForgeAI designs and codes it, creates a new GitHub
            repository under your account, and deploys it live — all in one flow.
          </p>
        </div>

        {/* ── Prompt form ── */}
        {!task && (
          <div className="card p-6">
            {/* ── Which job is this? ── */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              {([
                { id: 'new', title: 'Build a new website', text: 'From a description — no existing site' },
                { id: 'existing', title: 'Rebuild an existing site', text: 'Keep their content, Claude writes a new design' },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => { setFlow(opt.id); setAudit(null); setForce(false); if (opt.id === 'new') setImportUrl('') }}
                  disabled={busy}
                  className={clsx(
                    'text-left rounded-xl border px-4 py-3 transition-colors',
                    flow === opt.id
                      ? 'border-brand-500/60 bg-brand-600/10'
                      : 'border-surface-600 hover:border-brand-500/40',
                  )}
                >
                  <p className="text-xs font-semibold text-zinc-200">{opt.title}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{opt.text}</p>
                </button>
              ))}
            </div>

            {flow === 'new' && (<>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Project type
            </label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {([
                { id: 'static', title: 'Static site', text: 'HTML/CSS/JS — portfolios, landing pages, blogs' },
                { id: 'mern', title: 'MERN full-stack', text: 'React + Express + MongoDB — apps with data & APIs' },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setStack(opt.id)}
                  disabled={busy}
                  className={clsx(
                    'text-left rounded-xl border px-4 py-3 transition-colors',
                    stack === opt.id
                      ? 'border-brand-500/60 bg-brand-600/10'
                      : 'border-surface-600 hover:border-brand-500/40',
                  )}
                >
                  <p className="text-xs font-semibold text-zinc-200">{opt.title}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{opt.text}</p>
                </button>
              ))}
            </div>
            {stack === 'mern' && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  MongoDB connection string <span className="text-zinc-600 normal-case font-normal">(optional)</span>
                </label>
                <input
                  className="input font-mono text-xs"
                  placeholder="mongodb+srv://user:pass@cluster.mongodb.net/dbname — leave empty to add later"
                  value={mongoUri}
                  onChange={(e) => setMongoUri(e.target.value)}
                  disabled={busy}
                  spellCheck={false}
                />
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  With one, the API works out of the box (it's kept out of git and applied on deploy).
                  Without one, the app still builds, runs, and deploys — API routes stay off until you add
                  a string to <code className="text-zinc-400">.env</code> (a free MongoDB Atlas cluster works).
                </p>
              </div>
            )}

            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Theme style
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {([
                { id: 'auto', title: 'Auto', text: 'Match the type' },
                { id: 'minimal', title: 'Minimal', text: 'Clean & calm' },
                { id: 'bold', title: 'Bold', text: 'Vivid & punchy' },
                { id: 'elegant', title: 'Elegant', text: 'Refined & premium' },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setStyle(opt.id)}
                  disabled={busy}
                  className={clsx(
                    'text-left rounded-xl border px-3 py-2 transition-colors',
                    style === opt.id
                      ? 'border-brand-500/60 bg-brand-600/10'
                      : 'border-surface-600 hover:border-brand-500/40',
                  )}
                >
                  <p className="text-xs font-semibold text-zinc-200">{opt.title}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{opt.text}</p>
                </button>
              ))}
            </div>

            {/* Vibe mode toggle */}
            <button
              type="button"
              onClick={() => setVibeMode((v) => !v)}
              disabled={busy}
              className={clsx(
                'w-full flex items-center justify-between rounded-xl border px-4 py-3 mb-4 transition-colors text-left',
                vibeMode
                  ? 'border-violet-500/60 bg-violet-600/10'
                  : 'border-surface-600 hover:border-brand-500/40',
              )}
            >
              <div>
                <p className="text-xs font-semibold text-zinc-200">
                  {vibeMode ? '⚡ Vibe coded mode' : '✦ Professional mode'}
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {vibeMode
                    ? 'AI invents its own class names and styles freely — creative but inconsistent'
                    : 'Constrained to ForgeAI\'s design system — consistent, polished, production-ready'}
                </p>
              </div>
              <div className={clsx(
                'w-8 h-4 rounded-full transition-colors shrink-0 ml-4',
                vibeMode ? 'bg-violet-500' : 'bg-brand-500',
              )}>
                <div className={clsx(
                  'w-3 h-3 bg-white rounded-full mt-0.5 transition-transform',
                  vibeMode ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5',
                )} />
              </div>
            </button>

            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Site name
            </label>
            <input
              className="input mb-4"
              placeholder="my-portfolio (becomes the GitHub repo name)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            </>)}

            {flow === 'existing' && (<>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Their current website
            </label>
            <div className="flex gap-2 mb-1">
              <input
                className="input flex-1"
                placeholder="theirbrand.com — we read their real content"
                value={importUrl}
                onChange={(e) => { setImportUrl(e.target.value); setAudit(null) }}
                disabled={busy}
                spellCheck={false}
              />
              <button
                onClick={() => auditMutation.mutate()}
                disabled={!importUrl.trim() || auditMutation.isPending || busy}
                className="px-4 rounded-xl border border-surface-600 text-xs font-medium text-zinc-300 hover:border-brand-500/50 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {auditMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Score it'}
              </button>
            </div>

            {audit && (
              <div className="mb-4 mt-2 border border-surface-600 rounded-xl p-4">
                <div className="flex items-start gap-4">
                  <div className="text-center shrink-0">
                    <p className={clsx('text-3xl font-bold',
                      audit.score >= 8 ? 'text-emerald-400' : audit.score >= 5.5 ? 'text-yellow-400' : 'text-red-400')}>
                      {audit.score.toFixed(1)}
                    </p>
                    <p className="text-[10px] text-zinc-500">out of 10</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-100">{audit.headline}</p>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{audit.reasoning}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
                  {audit.categories.map((c: any) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500 w-28 shrink-0 truncate">{c.name}</span>
                      <div className="flex-1 h-1.5 bg-surface-800 rounded-full overflow-hidden">
                        <div
                          className={clsx('h-full rounded-full',
                            c.score >= 7 ? 'bg-emerald-500' : c.score >= 4 ? 'bg-yellow-500' : 'bg-red-500')}
                          style={{ width: `${Math.max(4, c.score * 10)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-500 w-6 text-right">{c.score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>

                {audit.issues?.length > 0 && (
                  <p className="text-[11px] text-zinc-500 mt-3">
                    <span className="text-zinc-400 font-medium">Issues: </span>{audit.issues.slice(0, 4).join(' · ')}
                  </p>
                )}
                {/* One flow: a professional rebuild from their real content. */}
                <div className="mt-4 pt-3 border-t border-surface-700">
                  {audit.verdict === 'perfect' ? (
                    <>
                      <p className="text-[11px] text-emerald-400/90">
                        This site is already strong. Rebuilding it risks making it worse.
                      </p>
                      <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <input type="checkbox" className="accent-brand-500" checked={force} onChange={(e) => setForce(e.target.checked)} />
                        <span className="text-[11px] text-zinc-400">Rebuild it anyway (against the recommendation)</span>
                      </label>
                    </>
                  ) : (
                    <p className="text-[11px] text-zinc-300">
                      <span className="font-semibold text-brand-400">Professional Rebuild</span>
                      <span className="text-zinc-500">
                        {' '}— we scrape every service, page and photo from the current site, then build a fresh site around that real content. Matched to their industry's register (professional for B2B, warm for consumer, etc.), never a generic template.
                      </span>
                    </p>
                  )}
                </div>
              </div>
            )}
            {!audit && (
              <p className="text-[11px] text-zinc-500 mb-4">
                Score the site first — the result decides whether it should be enhanced, rebuilt, or left alone.
              </p>
            )}

            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 mt-4">
              Site name
            </label>
            <input
              className="input mb-4"
              placeholder="brandname (becomes the GitHub repo name)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
            </>)}

            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              {flow === 'existing' ? 'Anything specific to change?' : 'Describe your website'}
            </label>
            <textarea
              className="input resize-none leading-relaxed mb-3"
              rows={5}
              placeholder="What should it be? Who is it for? What pages and sections? Any style preferences (dark, playful, minimal)?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
            />

            {flow === 'new' && (
              <div className="flex flex-wrap gap-2 mb-5">
                {(stack === 'mern' ? MERN_EXAMPLES : EXAMPLES).map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setPrompt(ex)}
                    className="text-left text-[11px] text-zinc-500 hover:text-zinc-200 border border-surface-600 hover:border-brand-500/50 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    {ex.slice(0, 58)}…
                  </button>
                ))}
              </div>
            )}

            {/* Analytics embed */}
            {flow === 'new' && stack !== 'mern' && (
              <div className="border border-surface-600 rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-zinc-200 mb-3 flex items-center gap-1.5">
                  <BarChart2 size={13} className="text-brand-400" /> Analytics
                  <span className="text-zinc-600 font-normal">(optional — injected into every page)</span>
                </p>
                <div className="flex gap-2 mb-3">
                  {(['', 'ga', 'plausible'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => { setAnalyticsProvider(p); setAnalyticsId('') }}
                      disabled={busy}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                        analyticsProvider === p
                          ? 'border-brand-500/60 bg-brand-600/10 text-brand-300'
                          : 'border-surface-600 text-zinc-500 hover:text-zinc-300',
                      )}
                    >
                      {p === '' ? 'None' : p === 'ga' ? 'Google Analytics' : 'Plausible'}
                    </button>
                  ))}
                </div>
                {analyticsProvider && (
                  <input
                    className="input text-xs"
                    placeholder={analyticsProvider === 'ga' ? 'G-XXXXXXXXXX or UA-XXXXXX-X' : 'yourdomain.com'}
                    value={analyticsId}
                    onChange={(e) => setAnalyticsId(e.target.value)}
                    disabled={busy}
                  />
                )}
              </div>
            )}

            {/* ── Add-ons ── */}
            <div className="border border-surface-600 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-violet-400" /> Add-ons
                  <span className="text-zinc-600 font-normal">(Pro / Team)</span>
                </p>
                {!isPaidPlan && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">PRO</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  { id: 'whatsapp', icon: MessageCircle, label: 'WhatsApp Chat Widget', desc: 'Live chat bubble + lead notifications', color: 'text-emerald-400' },
                  { id: 'leads',    icon: TrendingUp,    label: 'Lead Generation & CRM', desc: 'Smart lead form + WhatsApp/email alerts', color: 'text-blue-400' },
                  { id: 'seo',      icon: Search,        label: 'SEO Package', desc: 'Sitemap, Schema, Google Business, meta', color: 'text-yellow-400' },
                  { id: 'booking',  icon: CalendarClock, label: 'Appointment Booking', desc: 'Embedded calendar with WA confirmations', color: 'text-violet-400' },
                  { id: 'reviews',  icon: Star,          label: 'Google Reviews Bot', desc: 'Auto-send WA asking customers for a review', color: 'text-orange-400' },
                  { id: 'chatbot',  icon: Sparkles,      label: 'WhatsApp AI Chatbot', desc: 'Automated FAQ + booking flow via WhatsApp', color: 'text-brand-400' },
                ] as const).map(({ id, icon: Icon, label, desc, color }) => {
                  const checked = addons.includes(id)
                  const disabled = !isPaidPlan || busy
                  return (
                    <button
                      key={id}
                      disabled={disabled}
                      onClick={() => setAddons(prev => checked ? prev.filter(a => a !== id) : [...prev, id])}
                      className={clsx(
                        'text-left rounded-xl border px-3 py-2.5 transition-colors flex items-start gap-2.5',
                        checked
                          ? 'border-brand-500/60 bg-brand-600/10'
                          : 'border-surface-600 hover:border-brand-500/30',
                        disabled && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      <div className={clsx('mt-0.5 shrink-0', color)}>
                        <Icon size={13} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-200 leading-tight">{label}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{desc}</p>
                      </div>
                      <div className={clsx(
                        'ml-auto shrink-0 w-4 h-4 rounded border flex items-center justify-center mt-0.5',
                        checked ? 'bg-brand-500 border-brand-500' : 'border-surface-500',
                      )}>
                        {checked && <CheckCircle2 size={10} className="text-white" />}
                      </div>
                    </button>
                  )
                })}
              </div>
              {addons.includes('whatsapp') && (
                <div className={clsx(
                  'mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg border',
                  waStatus?.connected
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/5 text-amber-400',
                )}>
                  {waStatus?.connected
                    ? <><ShieldCheck size={12} /> WhatsApp connected — {waStatus.displayPhone ?? waStatus.verifiedName}</>
                    : <><MessageCircle size={12} /> WhatsApp not connected — <a href="/settings" className="underline font-medium">go to Settings</a> to connect it first</>
                  }
                  {waTestState === 'ok' && <span className="ml-auto text-emerald-400">✓ API reachable</span>}
                  {waTestState === 'fail' && <span className="ml-auto text-red-400">✗ API error</span>}
                  {waTestState === 'testing' && <Loader2 size={11} className="ml-auto animate-spin" />}
                </div>
              )}
              {!isPaidPlan && (
                <p className="text-[10px] text-zinc-600 mt-2">
                  Add-ons are available on Pro and Team plans. <a href="/pricing" className="text-brand-400 hover:underline">Upgrade</a> to enable them.
                </p>
              )}
            </div>

            {(() => {
              // Existing sites are gated on the audit: score first, and a site the
              // audit rates "perfect" needs an explicit override to touch.
              const blocked = flow === 'existing' && (
                !audit || (audit.verdict === 'perfect' && !force)
              )
              const label = flow === 'existing'
                ? (!audit ? 'Score the site first' : 'Rebuild this website')
                : 'Build my website'

              const handleBuild = async () => {
                if (addons.includes('whatsapp')) {
                  if (!waStatus?.connected) {
                    toast.error('Connect WhatsApp in Settings before using the WhatsApp add-on')
                    return
                  }
                  setWaTestState('testing')
                  try {
                    const { data } = await api.post('/settings/whatsapp/test')
                    if (data.ok) {
                      setWaTestState('ok')
                      toast.success('WhatsApp API verified ✓')
                    } else {
                      setWaTestState('fail')
                      toast.error('WhatsApp API check failed — verify your credentials in Settings')
                      return
                    }
                  } catch (e: any) {
                    setWaTestState('fail')
                    toast.error(e.response?.data?.error ?? 'WhatsApp connection test failed')
                    return
                  }
                }
                buildMutation.mutate()
              }

              return (
                <button
                  onClick={handleBuild}
                  disabled={blocked || (flow === 'new' && !prompt.trim()) || busy || waTestState === 'testing'}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50"
                >
                  {busy || waTestState === 'testing' ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {waTestState === 'testing' ? 'Testing WhatsApp…' : busy ? 'Working…' : label}
                </button>
              )
            })()}
          </div>
        )}

        {/* ── Progress / logs ── */}
        {task && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {(isBuilding || isDeploying) && <Loader2 size={15} className="animate-spin text-brand-400" />}
                {task.status === 'completed' && <CheckCircle2 size={15} className="text-emerald-400" />}
                {task.status === 'failed' && <XCircle size={15} className="text-red-400" />}
                <p className="text-sm font-semibold text-zinc-200">
                  {isBuilding && 'Building your website…'}
                  {isDeploying && 'Deploying…'}
                  {buildDone && 'Website ready'}
                  {deployDone && 'Deployed!'}
                  {task.status === 'failed' && 'Something went wrong'}
                </p>
              </div>
              <span className="text-xs text-zinc-500">{task.progress ?? 0}%</span>
            </div>

            <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all duration-500"
                style={{ width: `${task.progress ?? 0}%` }}
              />
            </div>

            <div className="bg-surface-950 border border-surface-700 rounded-xl p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-1 mb-4">
              {task.logs?.map((log, i) => (
                <div
                  key={i}
                  className={clsx(
                    log.level === 'error' && 'text-red-400',
                    log.level === 'warn' && 'text-yellow-400',
                    log.level === 'info' && 'text-zinc-400',
                  )}
                >
                  {log.message}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>

            {task.status === 'failed' && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
                <p className="text-xs text-red-300">{task.error ?? 'The task failed — check the log above.'}</p>
              </div>
            )}

            {/* What the enhance pass actually changed — visible, not just in the PDF */}
            {task.status === 'completed' && ((task.metadata as any)?.enhancements?.length > 0) && (
              <div className="border border-surface-600 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-zinc-100">What was enhanced</p>
                  {(task.metadata as any)?.audit && (
                    <span className="text-[11px] text-zinc-500">
                      original scored{' '}
                      <span className="text-zinc-300 font-semibold">
                        {(task.metadata as any).audit.score}/10
                      </span>
                    </span>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {((task.metadata as any).enhancements as string[]).map((item, i) => (
                    <li key={i} className="flex gap-2 text-[11px] text-zinc-400 leading-relaxed">
                      <span className="text-emerald-400 shrink-0">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                {(task.metadata as any)?.audit?.issues?.length > 0 && (
                  <p className="text-[11px] text-zinc-500 mt-3 pt-2 border-t border-surface-700">
                    <span className="text-zinc-400 font-medium">Problems found on the original: </span>
                    {(task.metadata as any).audit.issues.slice(0, 5).join(' · ')}
                  </p>
                )}
              </div>
            )}

            {task.summary && task.status === 'completed' && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 mb-4">
                <Markdown content={task.summary} />
              </div>
            )}

            {/* Live URL */}
            {deployUrl && (
              <div className="mb-4">
                <a
                  href={deployUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl px-4 py-3 text-sm font-medium hover:bg-emerald-500/20 transition-colors"
                >
                  <Globe size={15} /> Your site is live: {deployUrl}
                </a>
                <p className="text-[11px] text-zinc-500 mt-1.5 px-1">
                  ⏳ First build takes 2–5 minutes — a 404 right after deploying just means it's still starting; refresh in a bit.
                  Free-tier services also sleep when idle, so the first visit after a quiet spell takes ~30–60s to wake.
                </p>
              </div>
            )}

            {/* ── Mobile Preview Toggle ── */}
            {deployUrl && (
              <div className="border border-surface-600 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Monitor size={13} className="text-brand-400" /> Preview
                  </p>
                  <div className="flex items-center gap-1">
                    {([
                      { id: 'desktop', icon: Monitor, label: 'Desktop' },
                      { id: 'tablet', icon: Tablet, label: 'Tablet' },
                      { id: 'mobile', icon: Smartphone, label: 'Mobile' },
                    ] as const).map(({ id, icon: Icon, label }) => (
                      <button
                        key={id}
                        onClick={() => { setPreviewDevice(id); setShowPreview(true) }}
                        title={label}
                        className={clsx(
                          'p-1.5 rounded-lg transition-colors',
                          previewDevice === id && showPreview
                            ? 'bg-brand-500/20 text-brand-300'
                            : 'text-zinc-500 hover:text-zinc-300',
                        )}
                      >
                        <Icon size={14} />
                      </button>
                    ))}
                    <button
                      onClick={() => setShowPreview((v) => !v)}
                      className="ml-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {showPreview ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {showPreview && (
                  <div className="flex justify-center">
                    <div
                      className={clsx(
                        'border border-white/10 rounded-xl overflow-hidden transition-all',
                        previewDevice === 'desktop' && 'w-full',
                        previewDevice === 'tablet' && 'w-[768px] max-w-full',
                        previewDevice === 'mobile' && 'w-[375px] max-w-full',
                      )}
                    >
                      <div className="flex items-center gap-2 px-3 py-2 bg-surface-900 border-b border-white/5">
                        <div className="flex gap-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono truncate flex-1">{deployUrl}</span>
                      </div>
                      <iframe
                        src={deployUrl}
                        title="Site preview"
                        style={{ width: '100%', height: previewDevice === 'mobile' ? '667px' : '450px', border: 'none' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Page Speed Score ── */}
            {deployUrl && (
              <div className="border border-surface-600 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <TrendingUp size={13} className="text-brand-400" /> Page Speed Score
                    {importUrl && <span className="text-zinc-600 font-normal">— before vs after</span>}
                  </p>
                  <button
                    onClick={() => speedScoreMutation.mutate()}
                    disabled={speedScoreMutation.isPending}
                    className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {speedScoreMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                    {speedData ? 'Refresh' : 'Run'}
                  </button>
                </div>

                {speedData && (
                  <div className={clsx('grid gap-3', importUrl && speedData.before ? 'grid-cols-2' : 'grid-cols-1')}>
                    {importUrl && speedData.before && (
                      <div className="bg-surface-900 rounded-xl p-3">
                        <p className="text-[10px] text-zinc-500 mb-2 font-semibold flex items-center gap-1"><ArrowLeftRight size={10} /> Before (original)</p>
                        <ScoreRow score={speedData.before} />
                      </div>
                    )}
                    {speedData.after && (
                      <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-3">
                        <p className="text-[10px] text-brand-400 mb-2 font-semibold flex items-center gap-1"><Zap size={10} /> After (ForgeAI)</p>
                        <ScoreRow score={speedData.after} />
                      </div>
                    )}
                  </div>
                )}
                {speedScoreMutation.isError && (
                  <p className="text-xs text-zinc-500">Could not fetch scores — try again once the site is fully deployed.</p>
                )}
              </div>
            )}

            {/* ── Edit-After-Generate ── */}
            {deployUrl && (
              <div className="border border-surface-600 rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-zinc-200 mb-3 flex items-center gap-1.5">
                  <Wand2 size={13} className="text-brand-400" /> Edit this site
                  <span className="text-zinc-600 font-normal">— AI patches only what you ask</span>
                </p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-xs"
                    placeholder="Change the hero headline to 'We build what others dream' · Make the nav sticky · Add a testimonials section"
                    value={editInstruction}
                    onChange={(e) => setEditInstruction(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && editInstruction.trim()) { e.preventDefault(); patchMutation.mutate() } }}
                    disabled={patchMutation.isPending}
                  />
                  <button
                    onClick={() => patchMutation.mutate()}
                    disabled={!editInstruction.trim() || patchMutation.isPending}
                    className="gradient-btn px-3 rounded-xl disabled:opacity-50"
                    title="Send"
                  >
                    {patchMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </div>
            )}

            {/* ── Client Approval ── */}
            {(buildDone || deployUrl) && repoId && (
              <div className="border border-surface-600 rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-zinc-200 mb-2 flex items-center gap-1.5">
                  <UserCheck size={13} className="text-brand-400" /> Client Approval
                </p>
                <p className="text-[11px] text-zinc-500 mb-3">Send the client a link to preview the site and click "Approve to go live".</p>
                <button
                  onClick={() => approvalMutation.mutate()}
                  disabled={approvalMutation.isPending}
                  className="px-4 py-2 rounded-xl border border-brand-500/40 text-xs font-medium text-brand-300 hover:bg-brand-500/10 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {approvalMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
                  {approvalData ? 'Resend approval link' : 'Generate approval link'}
                </button>
                {approvalData && (
                  <div className="mt-3 bg-surface-950 border border-surface-700 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-400 truncate flex-1">{approvalData.approvalUrl}</span>
                    <button
                      onClick={() => { navigator.clipboard?.writeText(approvalData.approvalUrl); toast.success('Copied!') }}
                      className="text-[10px] text-zinc-500 hover:text-zinc-200 shrink-0"
                    >Copy</button>
                  </div>
                )}
              </div>
            )}

            {/* ── Maintenance Mode ── */}
            {(buildDone || deployUrl) && repoId && (
              <div className="border border-surface-600 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Construction size={13} className="text-brand-400" /> Maintenance Mode
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Show a "Coming Soon" page while you work on changes.</p>
                  </div>
                  <button
                    onClick={() => maintenanceMutation.mutate(!maintenanceMode)}
                    disabled={maintenanceMutation.isPending}
                    className={clsx(
                      'relative w-11 h-6 rounded-full transition-colors focus:outline-none',
                      maintenanceMode ? 'bg-brand-500' : 'bg-surface-700',
                    )}
                  >
                    <span className={clsx(
                      'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow',
                      maintenanceMode ? 'translate-x-6' : 'translate-x-1',
                    )} />
                  </button>
                </div>
              </div>
            )}

            {/* ── Environment Variables ── */}
            {(buildDone || deployDone) && repoId && (
              <div className="border border-surface-600 rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-zinc-200 mb-1 flex items-center gap-1.5">
                  <KeyRound size={13} className="text-brand-400" /> Environment Variables
                  <span className="text-zinc-600 font-normal">— applied to Render on every deploy</span>
                </p>
                <p className="text-[11px] text-zinc-500 mb-3">
                  Paste your <code className="text-zinc-400">KEY=VALUE</code> pairs, one per line. For MERN sites, <code className="text-zinc-400">MONGODB_URI</code> is added automatically — you can override it here.
                </p>
                <textarea
                  className="input resize-none font-mono text-xs leading-relaxed mb-3 w-full"
                  rows={5}
                  placeholder={'DATABASE_URL=postgresql://...\nSTRIPE_SECRET_KEY=sk_live_...\nJWT_SECRET=changeme'}
                  value={envVarsRaw}
                  onChange={(e) => setEnvVarsRaw(e.target.value)}
                  spellCheck={false}
                />
                <div className="flex items-center justify-between">
                  <div>
                    {savedEnvKeys.length > 0 && (
                      <p className="text-[11px] text-emerald-400">
                        {savedEnvKeys.length} var{savedEnvKeys.length !== 1 ? 's' : ''} saved: {savedEnvKeys.join(', ')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => envVarsMutation.mutate()}
                    disabled={!envVarsRaw.trim() || envVarsMutation.isPending}
                    className="px-4 py-2 rounded-xl border border-brand-500/40 text-xs font-medium text-brand-300 hover:bg-brand-500/10 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {envVarsMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                    Save vars
                  </button>
                </div>
              </div>
            )}

            {/* ── Monthly Maintenance Plan ── */}
            {(buildDone || deployUrl) && repoId && (
              <div className="border border-surface-600 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <CalendarClock size={13} className="text-brand-400" /> Monthly Maintenance Plan
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">PRO</span>
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Auto re-enhance this site every 30 days — fresh photos, updated copy.</p>
                  </div>
                  <button
                    onClick={() => maintenancePlanMutation.mutate(!maintenancePlanActive)}
                    disabled={maintenancePlanMutation.isPending}
                    className={clsx(
                      'relative w-11 h-6 rounded-full transition-colors focus:outline-none',
                      maintenancePlanActive ? 'bg-brand-500' : 'bg-surface-700',
                    )}
                  >
                    <span className={clsx(
                      'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow',
                      maintenancePlanActive ? 'translate-x-6' : 'translate-x-1',
                    )} />
                  </button>
                </div>
              </div>
            )}

            {/* Custom domain — the client's own brand.com */}
            {deployUrl && (
              <div className="border border-surface-600 rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-zinc-200 mb-1">Connect a custom domain</p>
                <p className="text-[11px] text-zinc-500 mb-3">
                  Put this site on the client's own domain. HTTPS is issued automatically once DNS resolves.
                </p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-xs"
                    placeholder="brandname.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    spellCheck={false}
                  />
                  <button
                    onClick={() => domainMutation.mutate()}
                    disabled={!domain.trim() || domainMutation.isPending}
                    className="btn-primary text-xs disabled:opacity-50 whitespace-nowrap"
                  >
                    {domainMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Add domain'}
                  </button>
                </div>

                {domainInfo && (
                  <div className="mt-3 bg-surface-950 border border-surface-700 rounded-lg p-3">
                    <p className="text-[11px] text-zinc-400 mb-2">
                      Add this DNS record at the domain's registrar (GoDaddy, Namecheap, Cloudflare…):
                    </p>
                    <div className="font-mono text-[11px] text-zinc-200 space-y-1">
                      <div>Type: <span className="text-brand-400">{domainInfo.domain?.dns?.type}</span></div>
                      <div>Name/Host: <span className="text-brand-400">{domainInfo.domain?.dns?.host}</span></div>
                      <div>Value: <span className="text-brand-400">{domainInfo.domain?.dns?.value}</span></div>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-2">{domainInfo.note}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => verifyMutation.mutate()}
                        disabled={verifyMutation.isPending}
                        className="px-3 py-1.5 rounded-lg border border-surface-600 text-[11px] text-zinc-300 hover:border-brand-500/50 transition-colors disabled:opacity-50"
                      >
                        {verifyMutation.isPending ? 'Checking…' : 'Check DNS'}
                      </button>
                      {verifyMsg && <span className="text-[11px] text-zinc-400">{verifyMsg}</span>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Token prompt for first deploy on a platform */}
            {tokenPlatform && (
              <div className="border border-brand-500/30 bg-brand-600/5 rounded-xl p-4 mb-4">
                <p className="text-xs text-zinc-300 mb-2">
                  First deploy to <strong className="capitalize">{tokenPlatform}</strong> — paste an API token once (it's saved for next time):
                </p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-xs"
                    placeholder={`${tokenPlatform} API token`}
                    value={tokenValue}
                    onChange={(e) => setTokenValue(e.target.value)}
                  />
                  <button
                    onClick={() => deployMutation.mutate({ token: tokenValue })}
                    disabled={!tokenValue.trim() || deployMutation.isPending}
                    className="btn-primary text-xs disabled:opacity-50"
                  >
                    Deploy
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {(buildDone || deployDone) && (
                <>
                  {repoFullName && (
                    <a
                      href={`https://github.com/${repoFullName}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-surface-600 text-xs font-medium text-zinc-300 hover:border-brand-500/50 transition-colors"
                    >
                      <Github size={13} /> View on GitHub
                    </a>
                  )}
                  {repoId && (task?.metadata as any)?.mode === 'enhance' && (
                    <button
                      onClick={async () => {
                        try {
                          const r = await api.get(`/tasks/report/${repoId}`, { responseType: 'blob' })
                          const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `${(task?.metadata as any)?.siteName ?? 'site'}-enhancement-report.pdf`
                          a.click()
                          URL.revokeObjectURL(url)
                        } catch {
                          toast.error('Report not ready yet — try again in a moment')
                        }
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-surface-600 text-xs font-medium text-zinc-300 hover:border-brand-500/50 transition-colors"
                    >
                      <FileText size={13} /> Download report (PDF)
                    </button>
                  )}
                  {repoId && (
                    <button
                      onClick={() => navigate(`/repositories/${repoId}/workspace`)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-surface-600 text-xs font-medium text-zinc-300 hover:border-brand-500/50 transition-colors"
                    >
                      <FolderOpen size={13} /> Open Workspace
                    </button>
                  )}
                  {buildDone && !deployUrl && (
                    <button
                      onClick={() => deployMutation.mutate({})}
                      disabled={deployMutation.isPending}
                      className="btn-primary flex items-center gap-1.5 text-xs disabled:opacity-50"
                    >
                      {deployMutation.isPending
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Rocket size={13} />}
                      Deploy now
                    </button>
                  )}
                </>
              )}
              {(task.status === 'completed' || task.status === 'failed') && (
                <button
                  onClick={() => { setTask(null); setRepoId(null); setPrompt(''); setName(''); setMongoUri(''); setStyle('auto'); setImportUrl(''); setAudit(null); setDomain(''); setDomainInfo(null); setVerifyMsg(''); setTokenPlatform(null) }}
                  className="px-4 py-2 rounded-xl text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Build another site
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── How it works ── */}
        {!task && (
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { icon: Wand2, title: '1 · Describe', text: 'Tell the AI what you want — pages, style, purpose.' },
              { icon: Github, title: '2 · Get a repo', text: 'A new GitHub repository is created and pushed for you.' },
              { icon: Rocket, title: '3 · Go live', text: 'One click deploys it with Blitz Deploy.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="card p-4">
                <Icon size={16} className="text-brand-400 mb-2" />
                <p className="text-xs font-semibold text-zinc-200 mb-1">{title}</p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
