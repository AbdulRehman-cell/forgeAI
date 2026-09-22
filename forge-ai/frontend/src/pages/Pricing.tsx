import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Check, Loader2, Sparkles, ArrowRight, ArrowDownRight, MessageCircle, TrendingUp, Globe, CalendarClock, Star, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// Lines starting with ✨ render highlighted (new AI Builder feature)
const FEATURES: Record<string, string[]> = {
  free: ['✨ AI Website Builder — prompt → GitHub repo → live site', '5 workspace fixes / month (site builds included)', '50 AI chats / month', '3 code reviews / month', '3 Blitz Deploys / month (your API key)', '2 repositories', 'Community support'],
  pro: ['✨ AI Website Builder — 100 builds & fixes / month', '100 workspace fixes / month', '2,000 AI chats / month', '100 code reviews / month', '100 Blitz Deploys / month (your API key)', '20 repositories', 'Security scans', 'Test generation', 'Priority support'],
  team: ['✨ AI Website Builder — unlimited builds', 'Unlimited everything', 'Fully managed Blitz Deploys — no API keys needed', 'Unlimited repositories', 'All Pro features', 'Team workspaces (soon)', 'Dedicated support'],
}

export default function Pricing() {
  const navigate = useNavigate()
  const { token } = useAuthStore()
  const qc = useQueryClient()

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/billing/plans').then((r) => r.data.plans),
  })

  const { data: me } = useQuery({
    queryKey: ['billing-me'],
    queryFn: () => api.get('/billing/me').then((r) => r.data),
    enabled: !!token,
  })

  const changePlan = useMutation({
    mutationFn: (plan: string) => api.post('/billing/change-plan', { plan }),
    onSuccess: ({ data }) => {
      if (data.checkoutUrl) { window.location.href = data.checkoutUrl; return }
      toast.success(data.message)
      // BUG FIX: invalidate cache instead of full reload so plan state updates
      qc.invalidateQueries({ queryKey: ['billing-me'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Plan change failed'),
  })

  const handleSelect = (planId: string) => {
    if (!token) { navigate('/login'); return }
    if (planId === me?.plan) return
    changePlan.mutate(planId)
  }

  // Button label logic: upgrade / switch / downgrade all work now
  const buttonLabel = (planId: string) => {
    if (!me) return planId === 'free' ? 'Get started' : `Get ${planId === 'pro' ? 'Pro' : 'Team'}`
    if (planId === me.plan) return 'Current plan'
    const order = { free: 0, pro: 1, team: 2 } as Record<string, number>
    return order[planId] > order[me.plan] ? `Upgrade to ${planId === 'pro' ? 'Pro' : 'Team'}` : `Downgrade to ${planId[0].toUpperCase() + planId.slice(1)}`
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0e] py-16 px-6 relative">
      {/* Ambient gradient orbs */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-brand-600/20 rounded-full blur-[120px]" />
      <div className="pointer-events-none absolute top-96 -left-32 w-[400px] h-[300px] bg-violet-600/10 rounded-full blur-[100px]" />

      <div className="max-w-5xl mx-auto relative">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-brand-600/10 border border-brand-600/30 text-brand-400 text-xs font-medium px-3 py-1.5 rounded-full mb-6 backdrop-blur">
            <Sparkles size={12} /> Simple, transparent pricing
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent mb-4">
            Fix code on autopilot
          </h1>
          <p className="text-zinc-500 text-lg mb-5">Start free. Switch plans anytime — up or down.</p>
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-brand-600/20 to-violet-600/20 border border-brand-500/40 text-brand-300 text-xs font-semibold px-4 py-2 rounded-full backdrop-blur">
            <Sparkles size={13} className="text-violet-400" />
            NEW: The AI Website Builder is included in every plan — prompt to live site
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans?.map((plan: any) => {
            const isCurrent = me?.plan === plan.id
            const isPopular = plan.id === 'pro'
            return (
              <div
                key={plan.id}
                className={clsx(
                  'relative rounded-2xl border p-7 flex flex-col transition-all duration-300 hover:-translate-y-1',
                  isPopular
                    ? 'border-brand-500/60 bg-gradient-to-b from-brand-600/15 via-[#15151c] to-[#121218] shadow-2xl shadow-brand-600/20'
                    : 'border-[#26262e] bg-[#131318]/80 backdrop-blur hover:border-[#3a3a44]',
                  isCurrent && 'ring-2 ring-emerald-500/40',
                )}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-brand-600 to-violet-600 text-white text-[10px] font-semibold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg shadow-brand-600/40">
                    Most Popular
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-3 right-4 bg-emerald-600 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
                    ✓ Active
                  </span>
                )}

                <h3 className="text-lg font-semibold text-zinc-100">{plan.name}</h3>
                <div className="mt-3 mb-6">
                  <span className="text-4xl font-bold text-zinc-100">${plan.price}</span>
                  <span className="text-zinc-500 text-sm">/month</span>
                </div>

                <ul className="space-y-2.5 flex-1 mb-7">
                  {FEATURES[plan.id]?.map((f) =>
                    f.startsWith('✨') ? (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-sm font-medium text-brand-200 rounded-lg -mx-2 px-2 py-1.5 border border-brand-500/25 bg-brand-600/10"
                      >
                        <Sparkles size={14} className="text-violet-400 mt-0.5 shrink-0" />
                        {f.replace('✨ ', '')}
                      </li>
                    ) : (
                      <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                        <Check size={14} className="text-brand-400 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ),
                  )}
                </ul>

                <button
                  onClick={() => handleSelect(plan.id)}
                  disabled={isCurrent || changePlan.isPending}
                  className={clsx(
                    'w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2',
                    isCurrent
                      ? 'bg-[#1e1e26] text-zinc-500 cursor-default'
                      : isPopular
                        ? 'bg-gradient-to-r from-brand-600 to-violet-600 hover:from-brand-500 hover:to-violet-500 text-white shadow-lg shadow-brand-600/25'
                        : 'bg-[#26262e] hover:bg-[#32323c] text-zinc-200',
                  )}
                >
                  {changePlan.isPending
                    ? <Loader2 size={13} className="animate-spin" />
                    : !isCurrent && (buttonLabel(plan.id).startsWith('Downgrade') ? <ArrowDownRight size={13} /> : <ArrowRight size={13} />)
                  }
                  {buttonLabel(plan.id)}
                </button>
              </div>
            )
          })}
        </div>

        <p className="text-center text-zinc-600 text-xs mt-10">
          All plans include the VS Code extension, GitHub integration, Blitz Deploy, and multi-model AI.
        </p>

        {/* ── Add-ons section ── */}
        <div className="mt-20">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-violet-600/10 border border-violet-600/30 text-violet-400 text-xs font-medium px-3 py-1.5 rounded-full mb-4 backdrop-blur">
              <Sparkles size={12} /> Pro &amp; Team Add-ons
            </div>
            <h2 className="text-3xl font-bold text-zinc-100 mb-3">More power for your clients</h2>
            <p className="text-zinc-500 text-sm max-w-lg mx-auto">
              When you build a site for a client on the Pro or Team plan, pick the add-ons they need.
              Our team sets everything up for you.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {([
              {
                icon: MessageCircle,
                color: 'text-emerald-400',
                bg: 'bg-emerald-500/10 border-emerald-500/20',
                title: 'WhatsApp Chat Widget',
                desc: 'Live chat bubble on the site. New leads auto-ping the client via WhatsApp so they never miss an enquiry.',
                badge: 'Most popular',
              },
              {
                icon: TrendingUp,
                color: 'text-blue-400',
                bg: 'bg-blue-500/10 border-blue-500/20',
                title: 'Lead Generation & CRM',
                desc: 'Smart lead capture form with real-time WhatsApp & email notifications. Includes a weekly leads report.',
                badge: null,
              },
              {
                icon: Globe,
                color: 'text-yellow-400',
                bg: 'bg-yellow-500/10 border-yellow-500/20',
                title: 'SEO Package',
                desc: 'Full on-page SEO — sitemap, Schema markup, Google Business setup, and meta tag optimisation.',
                badge: null,
              },
              {
                icon: CalendarClock,
                color: 'text-violet-400',
                bg: 'bg-violet-500/10 border-violet-500/20',
                title: 'Appointment Booking',
                desc: 'Embedded booking calendar with automatic WhatsApp confirmation messages for every appointment.',
                badge: null,
              },
              {
                icon: Star,
                color: 'text-orange-400',
                bg: 'bg-orange-500/10 border-orange-500/20',
                title: 'Google Reviews Bot',
                desc: 'After a sale or visit, WhatsApp the customer a short review request. More stars, more trust.',
                badge: null,
              },
              {
                icon: Zap,
                color: 'text-brand-400',
                bg: 'bg-brand-500/10 border-brand-500/20',
                title: 'WhatsApp AI Chatbot',
                desc: 'Automated 24/7 FAQ bot. Qualifies leads, answers questions, and books appointments — all via WhatsApp.',
                badge: 'New',
              },
            ] as const).map(({ icon: Icon, color, bg, title, desc, badge }) => (
              <div key={title} className="relative rounded-2xl border border-[#26262e] bg-[#131318]/80 p-6 flex flex-col gap-3 hover:border-[#3a3a44] transition-colors">
                {badge && (
                  <span className="absolute top-4 right-4 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-600/20 text-brand-300 border border-brand-500/30">
                    {badge}
                  </span>
                )}
                <div className={clsx('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', bg)}>
                  <Icon size={16} className={color} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 mb-1">{title}</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
                </div>
                <div className="mt-auto pt-2">
                  <span className="text-[11px] text-zinc-600 flex items-center gap-1">
                    <Check size={11} className="text-brand-400" /> Included in Pro &amp; Team builds
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-brand-500/20 bg-brand-600/5 px-6 py-5 text-center">
            <p className="text-sm text-zinc-300 mb-1">
              <span className="font-semibold text-brand-300">How it works:</span> Select add-ons when building a site in the Builder. Our team reaches out within 24 hours to set everything up for your client.
            </p>
            <p className="text-xs text-zinc-600">
              Add-ons are available on Pro and Team plans. WhatsApp features require a WhatsApp Business number (we help you set one up).
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
