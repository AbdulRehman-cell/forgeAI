// frontend/src/components/UsageWidget.tsx
// Drop into Dashboard: import UsageWidget from '@/components/UsageWidget'
// then render <UsageWidget /> near the stats cards.
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Zap, ArrowUpRight } from 'lucide-react'
import clsx from 'clsx'

export default function UsageWidget() {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['billing-me'],
    queryFn: () => api.get('/billing/me').then((r) => r.data),
    refetchInterval: 60_000,
  })

  if (!data) return null

  const rows = [
    { label: 'Workspace fixes', ...data.usage.fixes },
    { label: 'AI chats', ...data.usage.chats },
    { label: 'Code reviews', ...data.usage.reviews },
    { label: 'Blitz Deploys', ...(data.usage.deploys ?? { used: 0, limit: null }) },
  ]

  const anyNearLimit = rows.some((r) => r.limit && r.used / r.limit >= 0.8)

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-300">Usage</span>
          <span className={clsx('badge text-[10px]',
            data.plan === 'free' ? 'bg-zinc-700 text-zinc-400' : 'bg-brand-600/20 text-brand-400'
          )}>
            {data.planName}
          </span>
        </div>
        {data.plan === 'free' && (
          <button
            onClick={() => navigate('/pricing')}
            className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300 transition-colors"
          >
            <Zap size={11} /> Upgrade <ArrowUpRight size={10} />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const pct = row.limit ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0
          const nearLimit = row.limit && pct >= 80
          return (
            <div key={row.label}>
              <div className="flex justify-between mb-1">
                <span className="text-[11px] text-zinc-500">{row.label}</span>
                <span className={clsx('text-[11px] font-mono', nearLimit ? 'text-yellow-400' : 'text-zinc-400')}>
                  {row.used} / {row.limit ?? '∞'}
                </span>
              </div>
              <div className="h-1.5 bg-[#27272a] rounded-full overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all',
                    nearLimit ? 'bg-yellow-500' : 'bg-brand-500'
                  )}
                  style={{ width: row.limit ? `${pct}%` : '4%' }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {anyNearLimit && data.plan === 'free' && (
        <button
          onClick={() => navigate('/pricing')}
          className="w-full mt-4 bg-brand-600 hover:bg-brand-700 text-white text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
        >
          <Zap size={12} /> Upgrade to Pro — $19/mo
        </button>
      )}

      <p className="text-[10px] text-zinc-600 mt-3">
        Resets {new Date(data.resetAt).toLocaleDateString()}
      </p>
    </div>
  )
}
