// A build conversation on the home page: the chat on the left, the preview always
// on the right, deploy and share on top. Questions and design previews come from
// ForgeAI's own code; AI only runs once the client presses Build.
import { useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  ArrowUp, Check, Code2, Eye, FolderOpen, ImagePlus, Loader2, Monitor, Rocket, Share2, Smartphone, Sparkles, Tablet, Trash2, XCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import CodeView from './CodeView'
import ScaledFrame from './ScaledFrame'
import { apiUrl, isRunning, type Conversation, type DesignOptions, type PreviewBundle, type StudioMessage, type StudioQuestion, type StudioTask } from './studio'

const DEVICES = [
  { id: 'desktop', icon: Monitor, label: 'Desktop', width: 1280 },
  { id: 'tablet', icon: Tablet, label: 'Tablet', width: 768 },
  { id: 'mobile', icon: Smartphone, label: 'Phone', width: 390 },
] as const

const MAX_LOGO_BYTES = 1_000_000

function Bubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text)' }}>{text}</div>
    </div>
  )
}

function QuestionCard({ question, onAnswer, busy }: { question: StudioQuestion; onAnswer: (value: any, label?: string) => void; busy: boolean }) {
  const [picked, setPicked] = useState<string[]>([])
  const toggle = (v: string) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5">
        {question.options?.map((o) => {
          const on = picked.includes(o.value)
          return (
            <button
              key={o.label}
              disabled={busy}
              onClick={() => (question.type === 'multi' ? toggle(o.value) : onAnswer(o.value, o.label))}
              aria-pressed={question.type === 'multi' ? on : undefined}
              className={clsx('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50', on ? 'border-brand-500 bg-brand-500/15' : 'hover:border-brand-500/50')}
              style={{ borderColor: on ? undefined : 'var(--border-strong)', color: 'var(--text)' }}
            >
              {on && <Check size={11} />}{o.label}
            </button>
          )
        })}
      </div>
      {question.type === 'multi' && (
        <button disabled={busy} onClick={() => onAnswer(picked, picked.join(', ') || 'Let ForgeAI decide')} className="btn-primary text-xs mt-2.5 disabled:opacity-50">
          {picked.length ? 'Continue' : 'Skip: let ForgeAI decide'}
        </button>
      )}
    </div>
  )
}

function DesignCard({ options, hero, color, logo, locked, building, onChange, onLogo, onBuild }: {
  options: DesignOptions; hero: string; color: number; logo?: string; locked: boolean; building: boolean
  onChange: (d: { hero?: string; color?: number }) => void; onLogo: (f: File | null) => void; onBuild: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const label = 'text-[11px] font-semibold uppercase tracking-wider mb-1.5'
  return (
    <div className="mt-2.5 space-y-3.5">
      <div>
        <p className={label} style={{ color: 'var(--text-3)' }}>Home page</p>
        <div className="grid gap-1.5">
          {options.heroes.map((h) => (
            <button key={h.id} disabled={locked} onClick={() => onChange({ hero: h.id })} aria-pressed={hero === h.id}
              className={clsx('text-left rounded-xl border px-3 py-2 transition-colors disabled:cursor-default', hero === h.id ? 'border-brand-500 bg-brand-500/10' : !locked && 'hover:border-brand-500/50')}
              style={{ borderColor: hero === h.id ? undefined : 'var(--border)' }}>
              <span className="block text-xs font-semibold" style={{ color: 'var(--text)' }}>{h.label}</span>
              <span className="block text-[11px]" style={{ color: 'var(--text-3)' }}>{h.text}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className={label} style={{ color: 'var(--text-3)' }}>Colours</p>
        <div className="grid grid-cols-3 gap-1.5">
          {options.colors.map((c, i) => (
            <button key={c.brandHex} disabled={locked} onClick={() => onChange({ color: i })} aria-pressed={color === i}
              className={clsx('rounded-xl border p-2 text-left transition-colors disabled:cursor-default', color === i ? 'border-brand-500 bg-brand-500/10' : !locked && 'hover:border-brand-500/50')}
              style={{ borderColor: color === i ? undefined : 'var(--border)' }}>
              <span className="flex h-6 rounded-md overflow-hidden ring-1 ring-black/10 mb-1.5">
                <span className="flex-1" style={{ background: c.bg }} />
                <span className="flex-[2]" style={{ background: c.brandHex }} />
                <span className="flex-1" style={{ background: c.ink }} />
              </span>
              <span className="block text-[11px] font-medium truncate" style={{ color: 'var(--text)' }}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className={label} style={{ color: 'var(--text-3)' }}>Logo (optional)</p>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { onLogo(e.target.files?.[0] ?? null); e.target.value = '' }} />
        {logo ? (
          <div className="flex items-center gap-2">
            <img src={logo} alt="Your logo" className="w-9 h-9 rounded-lg object-contain ring-1 ring-black/10 bg-white" />
            {!locked && <button onClick={() => onLogo(null)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-500"><Trash2 size={12} /> Remove</button>}
          </div>
        ) : !locked && (
          <button onClick={() => input.current?.click()} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border hover:border-brand-500/50" style={{ borderColor: 'var(--border-strong)', color: 'var(--text-2)' }}>
            <ImagePlus size={13} /> Upload a logo
          </button>
        )}
      </div>
      {!locked && (
        <button onClick={onBuild} disabled={building} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
          {building ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Build this site
        </button>
      )}
    </div>
  )
}

function TaskLine({ task, onRetry }: { task: StudioTask; onRetry: () => void }) {
  const running = isRunning(task)
  // A finished preview shows itself: only waiting and problems need a card
  if (task.preview && task.status === 'completed') return null
  const words: Record<string, [string, string, string]> = {
    build_site: ['Building your site…', 'Your site is built. Check the preview, then deploy it when you are happy.', 'The build failed.'],
    blitz_deploy: ['Deploying…', 'Your site is live.', 'The deploy failed.'],
    agent: ['Making your change…', 'Your change is done.', 'That change could not be made.'],
  }
  const [busy, done, bad] = task.preview
    ? ['Preparing your preview…', 'Your preview is ready.', 'The preview could not be prepared. Your site is fine.']
    : words[task.type] ?? ['Working…', 'Done.', 'That did not work.']
  return (
    <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text)' }}>
      <p className="flex items-center gap-2 font-medium">
        {running ? <Loader2 size={14} className="animate-spin text-brand-500 shrink-0" /> : task.status === 'failed' ? <XCircle size={14} className="text-red-500 shrink-0" /> : <Check size={14} className="text-emerald-500 shrink-0" />}
        {running ? busy : task.status === 'failed' ? bad : done}
      </p>
      {running && (
        <>
          <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${Math.max(4, task.progress ?? 0)}%` }} />
          </div>
          {/* Progress notes are for clients: nothing about which AI is doing the work */}
          {task.lastLog && !/\b(model|claude|gemini|gpt|tool call|provider|retry|quota)\b/i.test(task.lastLog) && <p className="mt-1.5 text-xs truncate" style={{ color: 'var(--text-3)' }}>{task.lastLog}</p>}
        </>
      )}
      {task.status === 'failed' && task.error && <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>{task.error.slice(0, 240)}</p>}
      {task.status === 'failed' && task.preview && <button onClick={onRetry} className="mt-1.5 text-xs text-brand-500 underline">Try again</button>}
      {task.status === 'completed' && task.deploymentUrl && <a href={task.deploymentUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-brand-500 underline break-all">{task.deploymentUrl}</a>}
    </div>
  )
}

export default function BuildThread({ conversation }: { conversation: Conversation }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [starting, setStarting] = useState(false)
  const [view, setView] = useState<'preview' | 'code'>('preview')
  const [device, setDevice] = useState<(typeof DEVICES)[number]['id']>('desktop')
  const [pane, setPane] = useState<'chat' | 'site'>('chat')
  const [hero, setHero] = useState(conversation.design.hero)
  const [color, setColor] = useState(conversation.design.color)
  const bottom = useRef<HTMLDivElement>(null)

  const id = conversation._id
  const store = (next: Conversation) => qc.setQueryData(['conversation', next._id], next)
  const refresh = () => qc.invalidateQueries({ queryKey: ['conversation', id] })

  const tasks = conversation.tasks
  const active = tasks.find(isRunning)
  const buildDone = tasks.some((t) => t.type === 'build_site' && t.status === 'completed')
  const live = [...tasks].reverse().find((t) => t.type === 'blitz_deploy' && !t.preview && t.status === 'completed' && t.deploymentUrl)?.deploymentUrl
  const finishedCount = tasks.filter((t) => !isRunning(t)).length
  const repoId = conversation.repositoryId

  // Live build progress
  useEffect(() => {
    if (!active) return
    const socket = getSocket()
    socket.emit('subscribe:task', active._id)
    const onUpdate = (u: any) => {
      if (u._id !== active._id) return
      qc.setQueryData(['conversation', id], (old: Conversation | undefined) => old && ({
        ...old,
        tasks: old.tasks.map((t) => (t._id === u._id ? { ...t, status: u.status, progress: u.progress, error: u.error, lastLog: u.logs?.[u.logs.length - 1]?.message ?? t.lastLog } : t)),
      }))
      if (u.status === 'completed' || u.status === 'failed') refresh()
    }
    socket.on('task:update', onUpdate)
    // A dropped socket must not leave the bar frozen
    const poll = setInterval(refresh, 6000)
    return () => { socket.off('task:update', onUpdate); socket.emit('unsubscribe:task', active._id); clearInterval(poll) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?._id])

  // Straight to the newest message when a thread opens, smoothly after that
  const opened = useRef(false)
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: opened.current ? 'smooth' : 'auto', block: 'end' })
    opened.current = true
  }, [conversation.messages.length, tasks.length])

  // The design preview: one package per conversation from ForgeAI's own code. After
  // that, every choice is swapped inside the browser with no request and no AI.
  const showDesign = !live && !conversation.previewUrl && !conversation.previewPath
  const { data: bundle, isFetching: previewLoading } = useQuery({
    queryKey: ['studio-preview', id, conversation.answers.name ?? '', conversation.answers.kind ?? '', conversation.photos.length],
    queryFn: () => api.post(`/studio/conversations/${id}/preview`).then((r) => r.data as PreviewBundle),
    enabled: showDesign,
    staleTime: Infinity,
    gcTime: 300_000,
    // The old look stays up until the new one arrives, so an answer never flashes blank
    placeholderData: keepPreviousData,
  })

  const options = bundle?.options
  const shownHero = hero && options?.heroes.some((h) => h.id === hero) ? hero : options?.heroes[0]?.id ?? ''
  const shownColor = color ?? 0
  const frame = useRef<HTMLIFrameElement>(null)
  const showChoice = () => {
    if (!bundle) return
    const middle = bundle.css.middles[shownColor] ?? bundle.css.middles[0]
    frame.current?.contentWindow?.postMessage({ css: bundle.css.prefix + middle + bundle.css.suffix, main: bundle.pages[shownHero] ?? '', logo: conversation.design.logo ?? '' }, '*')
  }
  useEffect(showChoice)

  const answer = async (q: StudioQuestion, value: any, label?: string) => {
    setSending(true)
    try {
      const { data } = await api.post(`/studio/conversations/${id}/answer`, { id: q.id, value, label }, { timeout: 30_000 })
      store(data.conversation)
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Could not save that answer')
      refresh()
    } finally { setSending(false) }
  }

  const choose = (d: { hero?: string; color?: number }) => {
    if (d.hero !== undefined) setHero(d.hero)
    if (d.color !== undefined) setColor(d.color)
    api.patch(`/studio/conversations/${id}/design`, d).catch(() => toast.error('Could not save that choice'))
  }

  const pickLogo = async (file: File | null) => {
    try {
      if (!file) {
        const { data } = await api.patch(`/studio/conversations/${id}/design`, { logo: null })
        store(data.conversation)
        return
      }
      if (file.size > MAX_LOGO_BYTES) { toast.error('Please use a logo under 1 MB'); return }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = reject
        r.readAsDataURL(file)
      })
      const { data } = await api.patch(`/studio/conversations/${id}/design`, { logo: dataUrl })
      store(data.conversation)
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Could not add that logo')
    }
  }

  const startBuild = async (extra: Record<string, any> = {}) => {
    setStarting(true)
    try {
      await api.post('/tasks/build-site', { conversationId: id, design: { hero, color }, ...extra })
      await refresh()
      qc.invalidateQueries({ queryKey: ['conversations'] })
    } catch (e: any) {
      const data = e.response?.data
      if (data?.code === 'SITE_BUILD_PAYMENT_REQUIRED') {
        const res = await api.post('/billing/create-build-checkout', { returnTo: `/dashboard/c/${id}` }).catch(() => null)
        if (res?.data?.checkoutUrl) { window.location.href = res.data.checkoutUrl; return }
        toast.error('Could not start checkout. Please try again')
      } else toast.error(data?.message ?? 'Could not start the build')
    } finally { setStarting(false) }
  }

  // Back from paying for this build
  useEffect(() => {
    const session = params.get('session_id')
    if (params.get('build_paid') !== '1' || !session || repoId) return
    setParams({}, { replace: true })
    startBuild({ buildCheckoutSessionId: session })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = async () => {
    const content = input.trim()
    if (!content || sending || active) return
    setInput('')
    setSending(true)
    try {
      const { data } = await api.post(`/studio/conversations/${id}/messages`, { content }, { timeout: 30_000 })
      store(data.conversation)
      if (data.conversation.stage === 'built' && repoId) {
        await api.post('/tasks/patch-site', { repositoryId: repoId, instruction: content })
        await refresh()
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? 'Could not send that')
    } finally { setSending(false) }
  }

  const deploy = async () => {
    if (!repoId || !buildDone) return
    try {
      await api.post('/tasks/blitz-deploy', { repositoryId: repoId, platform: 'self-hosted' })
      await refresh()
    } catch (e: any) { toast.error(e.response?.data?.message ?? 'The deploy could not start') }
  }

  const shareUrl = live ?? conversation.previewUrl ?? (conversation.previewPath ? apiUrl(conversation.previewPath) : '')
  const share = async () => {
    if (!shareUrl) { toast('Deploy your site first to get a link you can share'); return }
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(live ? 'Live link copied' : 'Preview link copied')
    } catch { window.prompt('Copy this link', shareUrl) }
  }

  const timeline = useMemo(() => {
    const items: { at: number; message?: StudioMessage; task?: StudioTask }[] = [
      ...conversation.messages.map((message) => ({ at: Date.parse(message.at), message })),
      ...tasks.map((task) => ({ at: Date.parse(task.createdAt), task })),
    ]
    return items.sort((a, b) => a.at - b.at)
  }, [conversation.messages, tasks])

  const pendingQuestion = conversation.stage === 'questions' ? [...conversation.messages].reverse().find((m) => m.kind === 'question')?._id : undefined
  const siteSrc = live ?? (conversation.previewUrl || (conversation.previewPath ? apiUrl(conversation.previewPath) : ''))
  // React apps need their own origin (module scripts, sign-in storage). Hosted sites have one, on another
  // domain from this app. The API's fallback copy does not, so it stays fully walled off.
  const siteOnOwnOrigin = !!(live || conversation.previewUrl)
  const placeholder = conversation.stage === 'built' ? 'Ask for a change…' : conversation.stage === 'design' ? 'Anything else the build should know?' : 'Type your answer…'
  const stripText = active?.type === 'build_site' ? 'Building your real site. This is the design you chose, with sample words.'
    : active?.preview && !siteSrc ? 'Preparing your preview. It appears here in a moment.'
    : conversation.stack === 'supabase' && conversation.previewUrl && !live ? 'This preview uses your real database: anything added here stays when the site goes live.' : ''

  return (
    <div className="h-full flex flex-col lg:flex-row min-h-0">
      {/* Phones: one pane at a time */}
      <div className="lg:hidden flex shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        {(['chat', 'site'] as const).map((p) => (
          <button key={p} onClick={() => setPane(p)} className={clsx('flex-1 py-2 text-sm font-medium', pane === p && 'text-brand-500')} style={{ color: pane === p ? undefined : 'var(--text-3)' }}>{p === 'chat' ? 'Chat' : 'Preview'}</button>
        ))}
      </div>

      {/* The conversation */}
      <div className={clsx('lg:w-[400px] lg:shrink-0 min-h-0 flex-col border-r flex-1 lg:flex-none', pane === 'chat' ? 'flex' : 'hidden lg:flex')} style={{ borderColor: 'var(--border)' }}>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {timeline.map(({ message: m, task }) => {
            if (task) return <TaskLine key={task._id} task={task} onRetry={() => api.post(`/studio/conversations/${id}/preview-refresh`).then(refresh).catch(() => toast.error('Could not try again just now'))} />
            if (!m) return null
            if (m.role === 'user') return <Bubble key={m._id} text={m.content} />
            return (
              <div key={m._id} className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
                {m.content}
                {m.kind === 'question' && m._id === pendingQuestion && <QuestionCard question={m.data} busy={sending} onAnswer={(v, l) => answer(m.data, v, l)} />}
                {m.kind === 'design' && (
                  <DesignCard
                    options={m.data as DesignOptions}
                    hero={hero ?? (m.data as DesignOptions).heroes[0]?.id ?? shownHero}
                    color={shownColor}
                    logo={conversation.design.logo}
                    locked={conversation.stage === 'built'}
                    building={starting}
                    onChange={choose}
                    onLogo={pickLogo}
                    onBuild={() => startBuild()}
                  />
                )}
              </div>
            )
          })}
          {sending && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-3)' }} />}
          <div ref={bottom} />
        </div>
        <div className="p-3 shrink-0">
          <div className="flex items-end gap-2 rounded-2xl p-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={2}
              disabled={!!active}
              placeholder={active ? 'Working on it…' : placeholder}
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none disabled:opacity-60"
              style={{ color: 'var(--text)' }}
            />
            <button onClick={send} disabled={!input.trim() || sending || !!active} aria-label="Send" className="p-2 rounded-xl text-white bg-brand-600 disabled:opacity-40"><ArrowUp size={16} /></button>
          </div>
        </div>
      </div>

      {/* The site */}
      <div className={clsx('flex-1 min-w-0 min-h-0 flex-col', pane === 'site' ? 'flex' : 'hidden lg:flex')}>
        <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0 flex-wrap" style={{ borderColor: 'var(--border)' }}>
          <div className="flex rounded-lg p-0.5" style={{ background: 'var(--bg-raised)' }}>
            {([['preview', Eye, 'Preview'], ['code', Code2, 'Code']] as const).map(([v, Icon, text]) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium" style={{ background: view === v ? 'var(--bg-card)' : undefined, color: view === v ? 'var(--text)' : 'var(--text-3)' }}>
                <Icon size={13} />{text}
              </button>
            ))}
          </div>
          {view === 'preview' && (
            <div className="hidden md:flex items-center gap-0.5">
              {DEVICES.map(({ id: d, icon: Icon, label }) => (
                <button key={d} onClick={() => setDevice(d)} title={label} aria-label={label} aria-pressed={device === d} className={clsx('p-1.5 rounded-md', device === d && 'text-brand-500')} style={{ color: device === d ? undefined : 'var(--text-3)' }}><Icon size={14} /></button>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => repoId && navigate(`/repositories/${repoId}/workspace`)}
              disabled={!buildDone}
              title={buildDone ? 'Open the full workspace' : 'Available once your site is built'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
              style={{ border: '1px solid var(--border-strong)', color: 'var(--text-2)' }}
            ><FolderOpen size={13} /> Workspace</button>
            <button onClick={share} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium" style={{ border: '1px solid var(--border-strong)', color: 'var(--text-2)' }}><Share2 size={13} /> Share</button>
            <button onClick={deploy} disabled={!buildDone || !!active} title={buildDone ? 'Put your site online' : 'Available once your site is built'} className="btn-primary flex items-center gap-1.5 !py-1.5 !px-3 text-xs disabled:opacity-40">
              <Rocket size={13} /> {live ? 'Redeploy' : 'Deploy'}
            </button>
          </div>
        </div>

        {stripText && view === 'preview' && <p className="px-4 py-1.5 text-xs text-center shrink-0 bg-brand-500/10" style={{ color: 'var(--text-2)' }}>{stripText}</p>}

        <div className="flex-1 min-h-0" style={{ background: 'var(--bg-raised)' }}>
          {view === 'code' ? (
            <div className="h-full" style={{ background: 'var(--bg)' }}><CodeView repositoryId={buildDone ? repoId : undefined} version={String(finishedCount)} /></div>
          ) : (
            <ScaledFrame width={DEVICES.find((d) => d.id === device)!.width}>
                {siteSrc ? (
                  <iframe key={siteSrc} src={siteSrc} title="Your site" sandbox={siteOnOwnOrigin ? 'allow-scripts allow-same-origin allow-forms allow-popups' : 'allow-scripts allow-forms allow-popups'} className="w-full h-full border-0 bg-white" />
                ) : bundle ? (
                  <iframe ref={frame} title="Design preview" srcDoc={bundle.shell} onLoad={showChoice} sandbox="allow-scripts" className="w-full h-full border-0 bg-white" />
                ) : (
                  <div className="h-full grid place-items-center" style={{ color: 'var(--text-3)' }}>
                    {previewLoading ? <Loader2 size={18} className="animate-spin" /> : 'The preview could not load.'}
                  </div>
                )}
            </ScaledFrame>
          )}
        </div>
      </div>
    </div>
  )
}
