import { useNavigate } from 'react-router-dom'
import {
  Zap, GitBranch, FileCode2, ArrowRight, Rocket,
  ShieldCheck, Sparkles, Terminal
} from 'lucide-react'

const features = [
  { icon: GitBranch, title: 'Connect GitHub', desc: 'Import any repository in seconds with one click.', color: 'from-blue-500 to-indigo-500' },
  { icon: FileCode2, title: 'Deep AI Analysis', desc: 'ForgeAI reads and understands your entire codebase.', color: 'from-indigo-500 to-violet-500' },
  { icon: Zap, title: 'Fix Workspace', desc: 'Auto-fix lint errors, build failures & test regressions.', color: 'from-violet-500 to-fuchsia-500' },
  { icon: Rocket, title: 'Blitz Deploy', desc: 'Make any repo deployment-ready in seconds.', color: 'from-fuchsia-500 to-pink-500' },
]

const BUILDER_STEPS = [
  { icon: Sparkles, text: 'Describe the website you want — one prompt is enough' },
  { icon: FileCode2, text: 'AI designs and codes every page, style, and interaction' },
  { icon: GitBranch, text: 'A new GitHub repository is created and pushed for you' },
  { icon: Rocket, text: 'One click deploys it live with Blitz Deploy' },
]

const stats = [
  { value: '50+', label: 'Languages supported' },
  { value: '<30s', label: 'Average fix time' },
  { value: '4', label: 'AI models integrated' },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute -top-32 left-1/4 w-[500px] h-[500px] bg-brand-600/20 rounded-full blur-[130px] animate-float" />
      <div className="pointer-events-none absolute top-1/3 -right-32 w-[400px] h-[400px] bg-violet-600/15 rounded-full blur-[120px] animate-float" style={{ animationDelay: '2s' }} />
      <div className="pointer-events-none absolute inset-0 bg-dotgrid opacity-40" />

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 px-6 py-4 flex items-center justify-between backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-glow-sm">
            <Zap size={17} className="text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-gradient">ForgeAI</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/pricing')} className="btn-ghost">Pricing</button>
          <button onClick={() => navigate('/login')} className="btn-primary">
            <span className="flex items-center gap-2">Get Started <ArrowRight size={15} /></span>
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-4 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 glass text-brand-300 text-xs font-medium px-4 py-2 rounded-full mb-8 animate-fade-up">
          <Sparkles size={13} className="text-violet-400" />
          The Autonomous AI Software Engineer
        </div>

        <h1 className="text-6xl md:text-7xl font-bold max-w-4xl leading-[1.05] mb-6 animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <span className="text-gradient">Fix your entire</span><br />
          <span className="text-aurora">codebase automatically</span>
        </h1>

        <p className="text-zinc-400 text-xl max-w-2xl mb-10 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          ForgeAI connects to GitHub, analyzes every file, autonomously fixes errors,
          and ships a pull request — or <span className="text-zinc-200 font-medium">builds you a brand-new
          website from a single prompt</span>, repo and deploy included.
        </p>

        <div className="flex flex-wrap gap-4 justify-center mb-16 animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <button onClick={() => navigate('/login')} className="btn-primary text-base px-7 py-3.5">
            <span className="flex items-center gap-2">Start for free <ArrowRight size={17} /></span>
          </button>
          <button onClick={() => navigate('/pricing')} className="btn-secondary text-base px-7 py-3.5">
            <span className="flex items-center gap-2"><Terminal size={16} /> View Pricing</span>
          </button>
        </div>

        {/* Stats strip */}
        <div className="flex flex-wrap gap-10 justify-center mb-24 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-bold text-gradient">{s.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── AI Website Builder showcase ── */}
        <style>{BUILDER_STYLES}</style>
        <div className="max-w-5xl w-full mb-24 animate-fade-up" style={{ animationDelay: '0.25s' }}>
          <div className="relative overflow-hidden rounded-3xl border border-brand-500/30 bg-gradient-to-br from-brand-600/10 via-surface-900 to-violet-600/10 p-8 md:p-12 text-left">
            {/* animated sheen */}
            <div className="builder-sheen pointer-events-none absolute inset-0" />

            <div className="grid md:grid-cols-2 gap-10 items-center relative">
              {/* Copy */}
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-brand-500 to-violet-500 text-white text-[11px] font-bold mb-5 shadow-glow-sm">
                  <Sparkles size={12} /> NEW · AI WEBSITE BUILDER
                </div>
                <h2 className="text-3xl md:text-4xl font-bold leading-tight mb-4">
                  <span className="text-gradient">From idea to live website</span><br />
                  <span className="text-aurora">in one prompt</span>
                </h2>
                <ul className="space-y-3 mb-7">
                  {BUILDER_STEPS.map(({ icon: Icon, text }, i) => (
                    <li key={text} className="flex items-start gap-3 text-sm text-zinc-400">
                      <span className="w-6 h-6 rounded-lg bg-brand-600/20 border border-brand-500/30 flex items-center justify-center shrink-0 mt-[-2px]">
                        <Icon size={12} className="text-brand-400" />
                      </span>
                      <span><span className="text-zinc-600 font-mono text-xs mr-1.5">{i + 1}.</span>{text}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={() => navigate('/login')} className="btn-primary">
                  <span className="flex items-center gap-2">Build your first site <ArrowRight size={15} /></span>
                </button>
              </div>

              {/* Animated browser mock */}
              <div className="relative">
                <div className="rounded-2xl border border-white/10 bg-surface-950 shadow-2xl overflow-hidden">
                  {/* chrome */}
                  <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/5 bg-surface-900">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                    <span className="ml-3 text-[10px] text-zinc-600 font-mono truncate">your-site.onrender.com</span>
                  </div>
                  {/* fake prompt typing */}
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="font-mono text-[11px] text-brand-300 builder-typing overflow-hidden whitespace-nowrap">
                      &gt; a portfolio site with a gallery and contact page…
                    </p>
                  </div>
                  {/* generated "site" skeleton */}
                  <div className="p-4 space-y-3">
                    <div className="h-16 rounded-lg bg-gradient-to-r from-brand-600/40 to-violet-600/40 builder-pulse" />
                    <div className="grid grid-cols-3 gap-2">
                      <div className="h-12 rounded-lg bg-surface-800 builder-pulse" style={{ animationDelay: '.2s' }} />
                      <div className="h-12 rounded-lg bg-surface-800 builder-pulse" style={{ animationDelay: '.35s' }} />
                      <div className="h-12 rounded-lg bg-surface-800 builder-pulse" style={{ animationDelay: '.5s' }} />
                    </div>
                    <div className="h-2.5 w-3/4 rounded bg-surface-800 builder-pulse" style={{ animationDelay: '.65s' }} />
                    <div className="h-2.5 w-1/2 rounded bg-surface-800 builder-pulse" style={{ animationDelay: '.8s' }} />
                    <div className="flex items-center gap-2 pt-1">
                      <span className="h-7 w-24 rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 builder-pulse" style={{ animationDelay: '.95s' }} />
                      <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                        <Rocket size={10} /> deployed ✓
                      </span>
                    </div>
                  </div>
                </div>
                {/* floating badge */}
                <div className="absolute -bottom-4 -left-4 glass rounded-xl px-3 py-2 text-[10px] font-mono text-zinc-300 border border-white/10 animate-float">
                  <span className="text-emerald-400">✓</span> repo created · pushed · live
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 max-w-5xl w-full stagger">
          {features.map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="card card-interactive p-6 text-left group">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                <Icon size={20} className="text-white" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100 mb-1.5">{title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* CTA band */}
        <div className="card-glow mt-24 max-w-3xl w-full p-10 text-center">
          <ShieldCheck size={32} className="text-violet-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gradient mb-3">Ship with confidence</h2>
          <p className="text-zinc-400 mb-6 max-w-md mx-auto">
            Security scans, AI code review, and automated tests on every plan.
            Start free, upgrade when you scale.
          </p>
          <button onClick={() => navigate('/login')} className="btn-primary">
            <span className="flex items-center gap-2">Get Started Free <ArrowRight size={15} /></span>
          </button>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/5 px-6 py-6 text-center text-xs text-zinc-600">
        ForgeAI — Autonomous AI Software Engineer
      </footer>
    </div>
  )
}

// Animations for the AI Builder showcase
const BUILDER_STYLES = `
@keyframes builder-sheen {
  0% { transform: translateX(-100%) skewX(-15deg); }
  60%, 100% { transform: translateX(220%) skewX(-15deg); }
}
.builder-sheen::after {
  content: '';
  position: absolute; top: 0; bottom: 0; width: 40%;
  background: linear-gradient(90deg, transparent, rgba(139,92,246,.06), transparent);
  animation: builder-sheen 5s ease-in-out infinite;
}
@keyframes builder-typing {
  0% { width: 0; }
  55%, 90% { width: 100%; }
  100% { width: 100%; }
}
.builder-typing {
  width: 0;
  border-right: 1px solid rgba(139,92,246,.7);
  animation: builder-typing 4.5s steps(46) infinite;
}
@keyframes builder-pulse {
  0%, 100% { opacity: .45; }
  50% { opacity: 1; }
}
.builder-pulse { animation: builder-pulse 2.4s ease-in-out infinite; }
`
