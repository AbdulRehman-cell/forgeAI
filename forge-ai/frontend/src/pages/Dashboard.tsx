import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import {
  GitBranch, Clock, Zap, CheckCircle2, AlertCircle, Loader2,
  ArrowUpRight, Sparkles, Target, TrendingUp, XCircle, Activity,
  ArrowRight, ChevronDown, MessageSquare, Hammer,
} from 'lucide-react'
import clsx from 'clsx'

import UsageWidget from '@/components/UsageWidget'

const BUILD_PLACEHOLDERS = [
  'a portfolio site with a photo gallery and contact form',
  'a landing page for my coffee subscription startup',
  'a restaurant site with menu and online reservations',
  'a dark-themed personal blog with article cards',
  'an e-commerce store for handmade jewelry',
]

const CHAT_PLACEHOLDERS = [
  'Why is my React component re-rendering too many times?',
  'Explain how the authentication flow works in my codebase',
  'Help me refactor this function to be more readable',
  'Why is my Express route returning a 500 error?',
  'Generate unit tests for my user service',
]

type Mode = 'build' | 'chat'

export default function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('build')
  const [prompt, setPrompt] = useState('')
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * BUILD_PLACEHOLDERS.length))
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: repos } = useQuery({
    queryKey: ['repos'],
    queryFn: () => api.get('/repositories').then((r) => r.data.repositories),
  })
  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'recent'],
    queryFn: () => api.get('/tasks?limit=5').then((r) => r.data.tasks),
  })

  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const completed = tasks?.filter((t: any) => t.status === 'completed').length ?? 0
  const successRate = tasks?.length ? Math.round((completed / tasks.length) * 100) : 0

  const stats = [
    { label: 'Repositories', value: repos?.length ?? 0, icon: GitBranch },
    { label: 'Tasks Run', value: tasks?.length ?? 0, icon: TrendingUp },
    { label: 'Files Fixed', value: tasks?.reduce((a: number, t: any) => a + (t.changes?.length ?? 0), 0) ?? 0, icon: Zap },
    { label: 'Success Rate', value: `${successRate}%`, icon: Target },
  ]

  const handleSubmit = () => {
    const value = prompt.trim()
    if (mode === 'build') {
      if (value) sessionStorage.setItem('forge_pending_prompt', value)
      navigate('/builder')
    } else {
      if (value) sessionStorage.setItem('forge_pending_chat', value)
      navigate('/builder?mode=chat')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const placeholders = mode === 'build' ? BUILD_PLACEHOLDERS : CHAT_PLACEHOLDERS
  const currentPlaceholder = placeholders[placeholderIdx % placeholders.length]

  return (
    <div className="h-full overflow-y-auto">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="hero-mesh min-h-[calc(100vh-52px)] lg:min-h-screen flex flex-col items-center justify-center px-4 py-16 relative">

        {/* Heading */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-center text-white leading-tight mb-3">
          Ready to build,{' '}
          <span className="text-gradient">{firstName}?</span>
        </h1>
        <p className="text-zinc-400 text-center text-base md:text-lg mb-8 max-w-lg">
          {mode === 'build'
            ? 'Describe your website and ForgeAI will build, deploy, and host it — instantly.'
            : 'Ask ForgeAI anything about your code — debugging, refactoring, tests, and more.'}
        </p>

        {/* ── Mode toggle (sliding pill) ── */}
        <div className="flex items-center mb-6 rounded-full p-1 relative" style={{ background: 'rgba(24,24,27,0.9)', border: '1px solid rgba(63,63,70,0.5)' }}>
          {/* Sliding background */}
          <div
            className="absolute top-1 bottom-1 rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{
              background: 'rgba(99,102,241,0.18)',
              border: '1px solid rgba(99,102,241,0.3)',
              width: 'calc(50% - 4px)',
              left: mode === 'build' ? '4px' : 'calc(50%)',
            }}
          />
          <button
            onClick={() => { setMode('build'); setPrompt('') }}
            className={clsx(
              'relative flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 z-10',
              mode === 'build' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <Hammer size={14} />
            Build
          </button>
          <button
            onClick={() => { setMode('chat'); setPrompt('') }}
            className={clsx(
              'relative flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 z-10',
              mode === 'chat' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <MessageSquare size={14} />
            Chat
          </button>
        </div>

        {/* Prompt box */}
        <div className="hero-prompt w-full max-w-2xl">
          <div className="flex flex-col gap-0">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder={mode === 'build' ? `e.g. ${currentPlaceholder}` : currentPlaceholder}
              className="w-full resize-none bg-transparent px-5 pt-4 pb-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none"
            />
            <div className="flex items-center justify-between px-4 pb-3 pt-1">
              <span className="text-[11px] text-zinc-600">Press Enter to submit · Shift+Enter for new line</span>
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: prompt.trim() ? '#4f46e5' : 'rgba(79,70,229,0.4)' }}
              >
                {mode === 'build' ? 'Build' : 'Ask'}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick suggestions */}
        <div className="flex flex-wrap gap-2 justify-center mt-5 max-w-2xl">
          {mode === 'build'
            ? ['Portfolio site', 'Landing page', 'Restaurant site', 'E-commerce store', 'Personal blog'].map((s) => (
                <button key={s} onClick={() => { setPrompt(s); textareaRef.current?.focus() }}
                  className="text-xs px-3 py-1.5 rounded-full transition-all duration-150 text-zinc-400 hover:text-zinc-200"
                  style={{ background: 'rgba(39,39,42,0.6)', border: '1px solid rgba(63,63,70,0.4)' }}>
                  {s}
                </button>
              ))
            : ['Fix a bug', 'Explain code', 'Write tests', 'Refactor function', 'Add a feature'].map((s) => (
                <button key={s} onClick={() => { setPrompt(s); textareaRef.current?.focus() }}
                  className="text-xs px-3 py-1.5 rounded-full transition-all duration-150 text-zinc-400 hover:text-zinc-200"
                  style={{ background: 'rgba(39,39,42,0.6)', border: '1px solid rgba(63,63,70,0.4)' }}>
                  {s}
                </button>
              ))
          }
        </div>

        {/* Scroll hint */}
        <button
          onClick={() => document.getElementById('projects-section')?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <span className="text-[11px]">Your projects</span>
          <ChevronDown size={16} className="animate-bounce" />
        </button>
      </section>

      {/* ── Projects section ─────────────────────────────────── */}
      <section id="projects-section" className="px-4 md:px-8 py-12 max-w-6xl mx-auto">

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 stagger">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Icon size={15} className="text-indigo-400" />
                <span className="text-xs text-zinc-500">{label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>

        {/* Usage + CTA */}
        <div className="grid lg:grid-cols-3 gap-5 mb-10">
          <div className="lg:col-span-2 card p-6 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-zinc-100">Import an existing repository</h3>
              <p className="text-sm text-zinc-500 mt-1">Let ForgeAI fix bugs, review code, and generate tests automatically.</p>
            </div>
            <button onClick={() => navigate('/repositories')} className="btn-primary shrink-0 flex items-center gap-2">
              Import Repo <ArrowUpRight size={14} />
            </button>
          </div>
          <UsageWidget />
        </div>

        {/* Repos + Activity grid */}
        <div className="grid lg:grid-cols-2 gap-6 pb-8">
          {/* Recent Repos */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-300">Recent Repositories</h2>
              <button onClick={() => navigate('/repositories')} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                View all <ArrowUpRight size={12} />
              </button>
            </div>
            <div className="space-y-2 stagger">
              {repos?.slice(0, 4).map((repo: any) => (
                <button
                  key={repo._id}
                  onClick={() => navigate(`/repositories/${repo._id}`)}
                  className="w-full card card-interactive p-4 flex items-center gap-4 text-left"
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(99,102,241,0.1)' }}>
                    <GitBranch size={15} className="text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{repo.fullName}</p>
                    <p className="text-xs text-zinc-500 truncate">{repo.description ?? 'No description'}</p>
                  </div>
                  <StatusBadge status={repo.status} />
                </button>
              ))}
              {!repos?.length && (
                <div className="card p-10 text-center">
                  <GitBranch size={24} className="text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-500 text-sm mb-4">No repositories yet.</p>
                  <button onClick={() => navigate('/repositories')} className="btn-primary">
                    Import Repository
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-300">Recent Activity</h2>
              <button onClick={() => navigate('/tasks')} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                View all <ArrowUpRight size={12} />
              </button>
            </div>
            <div className="space-y-2 stagger">
              {tasks?.slice(0, 4).map((task: any) => (
                <button
                  key={task._id}
                  onClick={() => navigate('/tasks')}
                  className="w-full card card-interactive p-4 flex items-center gap-4 text-left"
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(39,39,42,0.8)' }}>
                    <TaskStatusIcon status={task.status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100 capitalize truncate">
                      {String(task.type ?? 'task').replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {task.repositoryId?.fullName ?? 'Repository'}
                      {(task.changes?.length ?? 0) > 0 && ` · ${task.changes.length} file(s)`}
                    </p>
                  </div>
                  <span className="text-[10px] text-zinc-600 shrink-0">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
              {!tasks?.length && (
                <div className="card p-10 text-center">
                  <Activity size={24} className="text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-500 text-sm">No activity yet.</p>
                  <p className="text-zinc-600 text-xs mt-1">Run a fix task in any repository to get started.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function TaskStatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={15} className="text-emerald-400" />
  if (status === 'failed') return <XCircle size={15} className="text-red-400" />
  if (status === 'running') return <Loader2 size={15} className="text-indigo-400 animate-spin" />
  return <Clock size={15} className="text-zinc-500" />
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: any; cls: string; label: string }> = {
    ready:    { icon: CheckCircle2, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Ready' },
    error:    { icon: AlertCircle,  cls: 'bg-red-500/10 text-red-400 border-red-500/20',            label: 'Error' },
    indexing: { icon: Loader2,      cls: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 [&_svg]:animate-spin', label: 'Indexing' },
    cloning:  { icon: Loader2,      cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 [&_svg]:animate-spin', label: 'Cloning' },
    idle:     { icon: Clock,        cls: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/30',          label: 'Idle' },
  }
  const { icon: Icon, cls, label } = map[status] ?? map.idle
  return (
    <span className={clsx('badge border', cls)}>
      <Icon size={11} /> {label}
    </span>
  )
}
