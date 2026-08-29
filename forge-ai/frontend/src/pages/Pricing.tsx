import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Check, Loader2, Sparkles, ArrowRight, ArrowDownRight } from 'lucide-react'
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
      </div>
    </div>
  )
}
