import { useState, useEffect, useRef } from 'react'
import { Search, AlertTriangle, CheckCircle, ArrowRight, RefreshCw, Zap, Shield, Smartphone, Image, FileText, Globe, Code } from 'lucide-react'

interface AuditCategory {
  name: string
  score: number
  weight: number
  notes: string[]
}

interface AuditResult {
  url: string
  score: number
  verdict: 'perfect' | 'enhance' | 'rebuild'
  headline: string
  reasoning: string
  categories: AuditCategory[]
  strengths: string[]
  issues: string[]
  stats: Record<string, number | string>
  cached?: boolean
}

const CATEGORY_ICONS: Record<string, any> = {
  'Mobile': Smartphone,
  'Design': Zap,
  'Content': FileText,
  'Images': Image,
  'SEO': Globe,
  'Access': Shield,
  'Technical': Code,
}

const VERDICT_CONFIG = {
  perfect: { label: 'Already great', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', bar: 'bg-emerald-500' },
  enhance: { label: 'Needs fixing', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', bar: 'bg-amber-500' },
  rebuild: { label: 'Needs a rebuild', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', bar: 'bg-red-500' },
}

function ScoreRing({ score }: { score: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const fill = (score / 10) * circ
  const color = score >= 7 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444'
  return (
    <svg width="140" height="140" className="rotate-[-90deg]">
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
      <circle
        cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${fill} ${circ - fill}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)' }}
      />
      <text x="70" y="78" textAnchor="middle" fill={color} fontSize="28" fontWeight="700"
        style={{ transform: 'rotate(90deg)', transformOrigin: '70px 70px' }}>
        {score.toFixed(1)}
      </text>
      <text x="70" y="94" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11"
        style={{ transform: 'rotate(90deg)', transformOrigin: '70px 70px' }}>
        out of 10
      </text>
    </svg>
  )
}

const LOADING_STEPS = [
  'Crawling your website…',
  'Checking mobile responsiveness…',
  'Analysing design & CSS…',
  'Scanning SEO signals…',
  'Measuring content depth…',
  'Running technical checks…',
  'Calculating your score…',
]

export default function AuditPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Restore from URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const u = params.get('url')
    if (u) { setUrl(u); runAudit(u) }
    inputRef.current?.focus()
  }, [])

  // Cycle loading steps
  useEffect(() => {
    if (!loading) return
    setLoadingStep(0)
    const iv = setInterval(() => setLoadingStep(s => Math.min(s + 1, LOADING_STEPS.length - 1)), 3000)
    return () => clearInterval(iv)
  }, [loading])

  async function runAudit(rawUrl = url) {
    const u = rawUrl.trim()
    if (!u) return
    setError('')
    setResult(null)
    setLoading(true)

    // Push URL into query string so it's shareable
    const normalized = /^https?:\/\//i.test(u) ? u : `https://${u}`
    window.history.replaceState({}, '', `/audit?url=${encodeURIComponent(normalized)}`)

    try {
      const resp = await fetch(`/api/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error ?? 'Audit failed')
      setResult(data)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const verdict = result ? VERDICT_CONFIG[result.verdict] : null

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-200">
      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <a href="/" className="text-sm font-bold text-zinc-200 tracking-tight">
          <span className="text-brand-400">Forge</span>AI
        </a>
        <a href="/login" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          Sign in →
        </a>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Hero */}
        {!result && !loading && (
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 px-3 py-1.5 rounded-full mb-6">
              <Zap size={11} /> Free Website Audit
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-zinc-100 mb-4 leading-tight">
              Is your website<br />
              <span className="text-brand-400">losing you customers?</span>
            </h1>
            <p className="text-zinc-500 text-lg max-w-xl mx-auto">
              Paste any URL below. We'll score it across 7 categories and tell you exactly what's broken — in seconds.
            </p>
          </div>
        )}

        {/* Input */}
        <div className={`flex gap-3 ${result ? 'mb-10' : 'mb-4'}`}>
          <div className="flex-1 relative">
            <Globe size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              ref={inputRef}
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runAudit()}
              placeholder="yourwebsite.com"
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500/50 transition-colors"
              disabled={loading}
            />
          </div>
          <button
            onClick={() => runAudit()}
            disabled={loading || !url.trim()}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium px-6 py-3.5 rounded-xl transition-colors whitespace-nowrap"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Scanning…' : result ? 'Re-audit' : 'Audit my site'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400 mb-6">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-8 text-center">
            <div className="w-16 h-16 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin mx-auto mb-6" />
            <p className="text-sm text-zinc-400 mb-2">{LOADING_STEPS[loadingStep]}</p>
            <div className="flex justify-center gap-1.5 mt-4">
              {LOADING_STEPS.map((_, i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i <= loadingStep ? 'bg-brand-500' : 'bg-zinc-700'}`} />
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {result && verdict && (
          <div className="space-y-6">
            {/* Score header */}
            <div className={`rounded-2xl border ${verdict.bg} p-6 flex items-center gap-6`}>
              <ScoreRing score={result.score} />
              <div className="flex-1">
                <div className={`text-xs font-bold uppercase tracking-wider ${verdict.color} mb-1`}>
                  {verdict.label}
                </div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">{result.headline}</h2>
                <p className="text-sm text-zinc-400 leading-relaxed">{result.reasoning}</p>
                {result.cached && <p className="text-[10px] text-zinc-600 mt-2">Cached result</p>}
              </div>
            </div>

            {/* Categories */}
            <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-6">
              <h3 className="text-sm font-semibold text-zinc-300 mb-4">Score breakdown</h3>
              <div className="space-y-4">
                {result.categories.map(cat => {
                  const Icon = Object.entries(CATEGORY_ICONS).find(([k]) => cat.name.startsWith(k))?.[1] ?? Globe
                  const pct = (cat.score / 10) * 100
                  const barColor = cat.score >= 7 ? 'bg-emerald-500' : cat.score >= 5 ? 'bg-amber-500' : 'bg-red-500'
                  return (
                    <div key={cat.name}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <Icon size={12} className="text-zinc-500" />
                          {cat.name}
                        </div>
                        <span className={`text-xs font-semibold ${cat.score >= 7 ? 'text-emerald-400' : cat.score >= 5 ? 'text-amber-400' : 'text-red-400'}`}>
                          {cat.score.toFixed(1)}/10
                        </span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor} rounded-full transition-all duration-1000`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Issues + Strengths */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {result.issues.length > 0 && (
                <div className="rounded-2xl border border-red-500/10 bg-red-500/5 p-5">
                  <h3 className="text-xs font-semibold text-red-400 mb-3 flex items-center gap-2">
                    <AlertTriangle size={12} /> Problems found
                  </h3>
                  <ul className="space-y-2">
                    {result.issues.map(issue => (
                      <li key={issue} className="text-xs text-zinc-400 flex items-start gap-2">
                        <span className="text-red-500 mt-0.5 shrink-0">✗</span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.strengths.length > 0 && (
                <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/5 p-5">
                  <h3 className="text-xs font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                    <CheckCircle size={12} /> What's working
                  </h3>
                  <ul className="space-y-2">
                    {result.strengths.map(s => (
                      <li key={s} className="text-xs text-zinc-400 flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {Object.entries(result.stats).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/5 bg-zinc-900/60 p-3 text-center">
                  <div className="text-lg font-bold text-zinc-200">{v}</div>
                  <div className="text-[10px] text-zinc-500 capitalize">{k}</div>
                </div>
              ))}
            </div>

            {/* CTA */}
            {result.verdict !== 'perfect' && (
              <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-8 text-center">
                <h3 className="text-xl font-bold text-zinc-100 mb-2">
                  {result.verdict === 'rebuild' ? 'Your site needs a rebuild — we can do it in 24h' : 'We can fix these issues — usually within 48h'}
                </h3>
                <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
                  ForgeAI uses AI to rebuild or enhance websites for businesses. We handle design, mobile, SEO, and speed — no designers needed.
                </p>

                {!emailSent ? (
                  <div className="flex gap-3 max-w-sm mx-auto">
                    <input
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      type="email"
                      className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-brand-500/50"
                    />
                    <button
                      onClick={() => { if (email) setEmailSent(true) }}
                      disabled={!email}
                      className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
                    >
                      Get report <ArrowRight size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="text-emerald-400 text-sm font-medium">
                    ✓ Check your inbox — full report on its way
                  </div>
                )}

                <p className="text-[11px] text-zinc-600 mt-4">
                  Or <a href="/login" className="text-brand-400 hover:underline">sign up free</a> to rebuild this site right now
                </p>
              </div>
            )}

            {/* Share */}
            <div className="flex justify-center">
              <button
                onClick={() => { navigator.clipboard.writeText(window.location.href); }}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5"
              >
                Copy shareable link
              </button>
            </div>
          </div>
        )}

        {/* Social proof */}
        {!result && !loading && (
          <p className="text-center text-xs text-zinc-600 mt-8">
            Free · No account needed · Results in ~15 seconds
          </p>
        )}
      </div>
    </div>
  )
}
