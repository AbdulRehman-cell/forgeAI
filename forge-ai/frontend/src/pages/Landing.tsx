import { useState } from 'react'
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

// ─── Before: generic AI slop site ──────────────────────────────────────────
function BeforeSite() {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#0f0020', color: '#fff', minHeight: 340, fontSize: 13 }}>
      {/* nav */}
      <div style={{ background: 'rgba(255,255,255,0.04)', padding: '11px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontWeight: 'bold', color: '#a78bfa', fontSize: 13 }}>FitApp</span>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {['Home', 'Features', 'Pricing'].map(l => (
            <span key={l} style={{ fontSize: 11, color: '#6b7280' }}>{l}</span>
          ))}
          <button style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: 6, fontSize: 10, cursor: 'pointer' }}>Get Started</button>
        </div>
      </div>
      {/* hero */}
      <div style={{ background: 'linear-gradient(160deg,#1a0040 0%,#0f1035 60%,#0a0a1a 100%)', padding: '34px 18px 28px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.28)', borderRadius: 20, padding: '3px 11px', fontSize: 9, color: '#a78bfa', marginBottom: 12, letterSpacing: 1 }}>✨ AI-POWERED FITNESS</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 10px', background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Welcome to FitApp</h1>
        <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 18px', lineHeight: 1.6 }}>Your AI-powered fitness companion for a healthier lifestyle</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Get Started Free</button>
          <button style={{ background: 'transparent', border: '1px solid rgba(124,58,237,0.4)', color: '#a78bfa', padding: '8px 16px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}>Learn More</button>
        </div>
      </div>
      {/* cards */}
      <div style={{ padding: '18px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {['Track Workouts', 'AI Coach', 'Progress Charts'].map(t => (
          <div key={t} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14 }}>
            <div style={{ width: 28, height: 28, background: 'rgba(124,58,237,0.2)', borderRadius: 8, marginBottom: 8 }} />
            <p style={{ fontSize: 11, fontWeight: 600, color: '#e5e7eb', margin: '0 0 5px' }}>{t}</p>
            <p style={{ fontSize: 10, color: '#4b5563', margin: 0, lineHeight: 1.5 }}>Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod.</p>
          </div>
        ))}
      </div>
      {/* stats row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 28, padding: '12px 18px 18px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {['10k+ Users', '99% Uptime', '4.9 Rating'].map(s => (
          <div key={s} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#7c3aed', margin: 0 }}>{s.split(' ')[0]}</p>
            <p style={{ fontSize: 9, color: '#4b5563', margin: 0 }}>{s.split(' ').slice(1).join(' ')}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── After: ForgeAI design system site ─────────────────────────────────────
function AfterSite() {
  return (
    <div style={{ fontFamily: "'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif", background: '#ffffff', color: '#18130f', minHeight: 340, fontSize: 13 }}>
      {/* nav */}
      <div style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.09)', padding: '11px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '-0.5px' }}>FitCore</span>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {['Program', 'Results', 'Coaches'].map(l => (
            <span key={l} style={{ fontSize: 11, color: '#6b6460', fontWeight: 500 }}>{l}</span>
          ))}
          <button style={{ background: '#e85d04', border: 'none', color: '#fff', padding: '5px 13px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.2px' }}>Start free →</button>
        </div>
      </div>
      {/* hero */}
      <div style={{ background: 'linear-gradient(160deg,#fff8f0 0%,#fef3e8 60%,#ffffff 100%)', padding: '30px 18px 22px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff', border: '1px solid #ffd8b2', borderRadius: 20, padding: '3px 10px', fontSize: 9, color: '#e85d04', marginBottom: 12, fontWeight: 700, letterSpacing: '0.3px' }}>
          <span style={{ width: 6, height: 6, background: '#e85d04', borderRadius: '50%', display: 'inline-block' }} />
          30-DAY RESULTS OR IT'S FREE
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.12, margin: '0 0 10px', letterSpacing: '-0.8px' }}>
          Train hard.<br />
          <span style={{ color: '#e85d04' }}>See results.</span><br />
          No excuses.
        </h1>
        <p style={{ fontSize: 11, color: '#6b6460', margin: '0 0 16px', lineHeight: 1.65, maxWidth: 280 }}>
          Science-backed programs by elite coaches. Your body, your goals, your timeline.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ background: '#e85d04', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.1px' }}>Build my program →</button>
          <button style={{ background: 'transparent', border: '1px solid rgba(0,0,0,0.13)', color: '#18130f', padding: '8px 14px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>See results</button>
        </div>
      </div>
      {/* cards */}
      <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {[
          { label: 'Daily Programs', sub: 'New workout drops every morning at 6am' },
          { label: 'Expert Coaches', sub: 'Certified trainers, 10+ years each' },
          { label: 'Track Progress', sub: 'Weekly scan + visual results history' },
        ].map(({ label, sub }) => (
          <div key={label} style={{ background: '#f7f5f2', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 10, padding: 14, transition: 'box-shadow .2s' }}>
            <div style={{ width: 26, height: 26, background: '#ffecd9', borderRadius: 7, marginBottom: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 10, height: 10, background: '#e85d04', borderRadius: 2 }} />
            </div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#18130f', margin: '0 0 4px', letterSpacing: '-0.2px' }}>{label}</p>
            <p style={{ fontSize: 10, color: '#6b6460', margin: 0, lineHeight: 1.55 }}>{sub}</p>
          </div>
        ))}
      </div>
      {/* stats row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 28, padding: '12px 18px 18px', borderTop: '1px solid rgba(0,0,0,0.07)' }}>
        {[['12k+', 'Members'], ['98%', 'Complete programs'], ['4.9★', 'App rating']].map(([v, l]) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#e85d04', margin: 0, letterSpacing: '-0.5px' }}>{v}</p>
            <p style={{ fontSize: 9, color: '#6b6460', margin: 0, fontWeight: 500 }}>{l}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [showAfter, setShowAfter] = useState(false)

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

        {/* ── Before / After ── */}
        <style>{BEFORE_AFTER_STYLES}</style>
        <div className="max-w-3xl w-full mb-28 animate-fade-up" style={{ animationDelay: '0.22s' }}>
          {/* heading */}
          <p className="text-xs font-semibold tracking-widest text-zinc-500 uppercase mb-3">AI Website Builder</p>
          <h2 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
            <span className="text-gradient">Stop building</span>{' '}
            <span className="text-zinc-100">AI slop.</span>
          </h2>
          <p className="text-zinc-400 text-base max-w-xl mx-auto mb-10">
            ForgeAI generates sites with a real design identity — specific brand colors, intentional typography, and layouts that don't look like every other vibecoded site.
          </p>

          {/* Toggle pill */}
          <div className="inline-flex items-center gap-0 bg-zinc-900 border border-white/10 rounded-full p-1 mb-8">
            <button
              onClick={() => setShowAfter(false)}
              className={`ba-pill ${!showAfter ? 'ba-pill-active' : 'ba-pill-inactive'}`}
            >
              Before <span className={`ba-sub ${!showAfter ? 'ba-sub-active' : ''}`}>(AI slop default)</span>
            </button>
            <button
              onClick={() => setShowAfter(true)}
              className={`ba-pill ${showAfter ? 'ba-pill-active' : 'ba-pill-inactive'}`}
            >
              After <span className={`ba-sub ${showAfter ? 'ba-sub-active' : ''}`}>(With ForgeAI)</span>
            </button>
          </div>

          {/* Browser mock */}
          <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl ba-browser">
            {/* chrome bar */}
            <div className="flex items-center gap-1.5 px-4 py-2.5 bg-zinc-900 border-b border-white/5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
              <span className="ml-3 text-[10px] text-zinc-500 font-mono">
                {showAfter ? 'fitcore.onrender.com' : 'fitapp.onrender.com'}
              </span>
            </div>
            {/* site content — cross-fade */}
            <div className="relative overflow-hidden" style={{ minHeight: 340 }}>
              <div className={`ba-panel ${!showAfter ? 'ba-panel-visible' : 'ba-panel-hidden'}`}>
                <BeforeSite />
              </div>
              <div className={`ba-panel ${showAfter ? 'ba-panel-visible' : 'ba-panel-hidden'}`}>
                <AfterSite />
              </div>
            </div>
          </div>

          {/* label strip below browser */}
          <div className="flex items-center justify-center gap-2 mt-5">
            {!showAfter ? (
              <p className="text-xs text-zinc-500">
                Generic purple gradient · lorem ipsum copy · no brand identity
              </p>
            ) : (
              <p className="text-xs text-emerald-400 font-medium">
                ✓ Real headline copy · intentional palette · designed for its category
              </p>
            )}
          </div>
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

const BEFORE_AFTER_STYLES = `
.ba-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 16px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all .2s ease;
}
.ba-pill-active {
  background: #ffffff;
  color: #0a0a0a;
}
.ba-pill-inactive {
  background: transparent;
  color: #71717a;
}
.ba-pill-inactive:hover {
  color: #a1a1aa;
}
.ba-sub {
  font-weight: 400;
  font-size: 11px;
  color: #71717a;
}
.ba-sub-active {
  color: #52525b;
}
.ba-browser {
  box-shadow: 0 32px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06);
}
.ba-panel {
  position: absolute;
  inset: 0;
  transition: opacity .3s ease;
}
.ba-panel-visible {
  opacity: 1;
  pointer-events: auto;
}
.ba-panel-hidden {
  opacity: 0;
  pointer-events: none;
}
`

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
