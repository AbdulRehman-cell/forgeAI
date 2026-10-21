// frontend/src/components/workspace/AIActionsMenu.tsx — FINAL COMBINED VERSION
import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  ChevronDown,
  Search,
  ShieldCheck,
  FlaskConical,
  Loader2,
  Sparkles,
  Rocket,
  Container,
  Triangle,
  TrainFront,
  Server,
  FileSearch,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

interface Props {
  repositoryId: string
  onTaskStarted: (task: any) => void
}

/* ───────────────── AI Actions ───────────────── */
const ACTIONS = [
  {
    id: 'rebuild',
    endpoint: '/tasks/rebuild-proposal',
    label: 'Rebuild Proposal',
    desc: 'Phased rebuild plan + new stack recommendation',
    icon: FileSearch,
    body: {},
    badge: 'NEW',
  },
  {
    id: 'review',
    endpoint: '/tasks/review',
    label: 'AI Code Review',
    desc: 'Severity-graded findings + quality score',
    icon: Search,
    body: {},
  },
  {
    id: 'security',
    endpoint: '/tasks/security-scan',
    label: 'Security Scan',
    desc: 'Vulnerabilities, secrets, injection risks',
    icon: ShieldCheck,
    body: {},
  },
  {
    id: 'tests',
    endpoint: '/tasks/generate-tests',
    label: 'Generate Tests',
    desc: 'Runnable test files for key modules',
    icon: FlaskConical,
    body: {},
  },
] as const

/* ───────────────── Deploy Platforms ───────────────── */
const DEPLOY_PLATFORMS = [
  { id: 'self-hosted', label: 'Forge AI', icon: Zap, desc: 'Instant — no external account needed', highlight: true },
  { id: 'auto', label: 'Auto-detect', icon: Sparkles, desc: 'AI picks & deploys live' },
  { id: 'docker', label: 'Docker', icon: Container, desc: 'Configs only (self-host)' },
  { id: 'vercel', label: 'Vercel', icon: Triangle, desc: 'Live URL in minutes' },
  { id: 'railway', label: 'Railway', icon: TrainFront, desc: 'Live URL, full-stack' },
  { id: 'render', label: 'Render', icon: Server, desc: 'Live URL, web services' },
]

/* Where to create an API token for each platform */
const TOKEN_HELP: Record<string, { label: string; url: string }> = {
  vercel: { label: 'vercel.com → Settings → Tokens', url: 'https://vercel.com/account/tokens' },
  railway: { label: 'railway.com → Account → Tokens', url: 'https://railway.com/account/tokens' },
  render: { label: 'render.com → Account → API Keys', url: 'https://dashboard.render.com/u/settings#api-keys' },
}

export default function AIActionsMenu({ repositoryId, onTaskStarted }: Props) {
  const [open, setOpen] = useState(false)
  const [deployOpen, setDeployOpen] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const [tokenPlatform, setTokenPlatform] = useState<string | null>(null)
  const [tokenValue, setTokenValue] = useState('')

  const ref = useRef<HTMLDivElement>(null)

  /* close on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setDeployOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ───────────────── API call ───────────────── */
  const runAction = useMutation({
    mutationFn: ({ endpoint, body }: { endpoint: string; body: any }) =>
      api.post(endpoint, { repositoryId, ...body }),

    onSuccess: ({ data }) => {
      onTaskStarted(data.task)
      toast.success('⚡ Task started — watch logs')
      setOpen(false)
      setDeployOpen(false)
      setRunning(null)
      setTokenPlatform(null)
      setTokenValue('')
    },

    onError: (e: any) => {
      const data = e.response?.data
      if (data?.code === 'TOKEN_REQUIRED') {
        // First deploy to this platform: ask for its API token once
        setTokenPlatform(data.platform)
        setRunning(null)
        return
      }
      toast.error(data?.message ?? 'Failed to start task')
      setRunning(null)
    },
  })

  const startTask = (id: string, endpoint: string, body: any = {}) => {
    setRunning(id)
    runAction.mutate({ endpoint, body })
  }

  const startDeploy = (platform: string, token?: string) => {
    setRunning('deploy')
    runAction.mutate({
      endpoint: '/tasks/blitz-deploy',
      body: { platform, ...(token ? { token } : {}) },
    })
  }

  return (
    <div className="relative" ref={ref}>
      {/* ───────── Trigger Button ───────── */}
      <button
        onClick={() => {
          setOpen(!open)
          setDeployOpen(false)
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-[#26262e] to-[#2a2a34] hover:from-[#30303a] hover:to-[#343440] text-zinc-200 border border-[#34343e]"
      >
        <Sparkles size={12} className="text-brand-400" />
        AI Actions
        <ChevronDown size={11} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>

      {/* ───────── Dropdown ───────── */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 bg-[#15151b]/95 backdrop-blur-xl border border-[#2a2a34] rounded-2xl shadow-2xl z-50 overflow-hidden">

          {/* ───────── BLITZ DEPLOY ───────── */}
          <div className="p-2">
            <button
              onClick={() => setDeployOpen(!deployOpen)}
              disabled={running !== null}
              className="w-full flex items-start gap-3 p-3 rounded-xl bg-gradient-to-r from-brand-600/20 to-violet-600/15 border border-brand-500/30 hover:border-brand-500/60 text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center">
                {running === 'deploy' ? (
                  <Loader2 size={15} className="text-white animate-spin" />
                ) : (
                  <Rocket size={15} className="text-white" />
                )}
              </div>

              <div className="flex-1">
                <p className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                  Blitz Deploy
                  <span className="text-[8px] bg-brand-500 text-white px-1.5 py-0.5 rounded-full">
                    New
                  </span>
                </p>
                <p className="text-[11px] text-zinc-500">
                  Deploy instantly with AI configs
                </p>
              </div>

              <ChevronDown
                size={12}
                className={clsx('text-zinc-500 transition-transform', deployOpen && 'rotate-180')}
              />
            </button>

            {/* Platforms */}
            {deployOpen && !tokenPlatform && (
              <div className="mt-1.5 space-y-0.5 pl-2">
                {DEPLOY_PLATFORMS.map(({ id, label, icon: Icon, desc, ...rest }) => {
                  const highlight = 'highlight' in rest && rest.highlight
                  return (
                    <button
                      key={id}
                      disabled={running !== null}
                      onClick={() => startDeploy(id)}
                      className={clsx(
                        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left',
                        highlight
                          ? 'bg-brand-600/10 border border-brand-500/30 hover:border-brand-500/60 hover:bg-brand-600/20'
                          : 'hover:bg-[#1e1e26]',
                      )}
                    >
                      <Icon size={13} className={highlight ? 'text-brand-400' : 'text-brand-400'} />
                      <div className="flex-1">
                        <span className={clsx('text-[11.5px] font-medium', highlight ? 'text-brand-300' : 'text-zinc-300')}>
                          {label}
                        </span>
                        <span className="text-[10px] text-zinc-600 ml-2">{desc}</span>
                      </div>
                      {highlight && (
                        <span className="text-[8px] bg-brand-500 text-white px-1.5 py-0.5 rounded-full shrink-0">
                          FREE
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Token prompt — shown once per platform, then remembered */}
            {deployOpen && tokenPlatform && (
              <div className="mt-1.5 p-3 rounded-xl bg-[#1a1a22] border border-[#2a2a34] space-y-2">
                <p className="text-[11px] text-zinc-300 font-medium capitalize">
                  Connect {tokenPlatform} to deploy
                </p>
                <p className="text-[10px] text-zinc-500">
                  Paste an API token — created at{' '}
                  <a
                    href={TOKEN_HELP[tokenPlatform]?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-400 hover:underline"
                  >
                    {TOKEN_HELP[tokenPlatform]?.label}
                  </a>
                  . Saved securely for next time.
                </p>
                <input
                  type="password"
                  value={tokenValue}
                  onChange={(e) => setTokenValue(e.target.value)}
                  placeholder={`${tokenPlatform} API token`}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#12121a] border border-[#2a2a34] text-[11px] text-zinc-200 placeholder-zinc-600 focus:border-brand-500 outline-none"
                />
                <div className="flex gap-1.5">
                  <button
                    disabled={!tokenValue.trim() || running !== null}
                    onClick={() => startDeploy(tokenPlatform, tokenValue.trim())}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-[11px] font-medium text-white"
                  >
                    {running === 'deploy' ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Rocket size={11} />
                    )}
                    Deploy
                  </button>
                  <button
                    onClick={() => { setTokenPlatform(null); setTokenValue('') }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#22222a] hover:bg-[#2a2a34] text-[11px] text-zinc-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="h-px bg-[#26262e] mx-2" />

          {/* ───────── AI ACTIONS ───────── */}
          <div className="p-2 space-y-0.5">
            {ACTIONS.map(({ id, endpoint, label, desc, icon: Icon, body, ...rest }) => (
              <button
                key={id}
                disabled={running !== null}
                onClick={() => startTask(id, endpoint, body)}
                className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-[#1e1e26] text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-[#22222a] flex items-center justify-center mt-0.5">
                  {running === id ? (
                    <Loader2 size={13} className="text-brand-400 animate-spin" />
                  ) : (
                    <Icon size={13} className="text-brand-400" />
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                    {label}
                    {'badge' in rest && rest.badge && (
                      <span className="text-[8px] bg-violet-600 text-white px-1.5 py-0.5 rounded-full">
                        {rest.badge}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-500">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}