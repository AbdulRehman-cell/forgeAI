import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  LayoutDashboard,
  GitBranch,
  Clock,
  Settings,
  LogOut,
  Zap,
  CreditCard,
  Sparkles,
  BarChart3,
  Search,
  Inbox,
  Users,
  Send,
} from 'lucide-react'
import clsx from 'clsx'

function LeadsUnreadBadge() {
  const { data } = useQuery({
    queryKey: ['leads-stats'],
    queryFn: () => api.get('/leads/stats').then(r => r.data),
    staleTime: 30_000,
    retry: false,
  })
  const count: number = data?.unreadCount ?? 0
  if (count === 0) return null
  return (
    <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-500 text-white min-w-[18px] text-center">
      {count > 99 ? '99+' : count}
    </span>
  )
}

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/builder', icon: Sparkles, label: 'AI Builder', badge: 'NEW' },
  { to: '/dashboards', icon: BarChart3, label: 'Data Dashboards' },
  { to: '/repositories', icon: GitBranch, label: 'Repositories' },
  { to: '/leads', icon: Inbox, label: 'Leads', dynamicBadge: true },
  { to: '/outreach', icon: Send, label: 'Cold Outreach', badge: 'NEW' },
  { to: '/search', icon: Search, label: 'Code Search' },
  { to: '/tasks', icon: Clock, label: 'Task History' },
  { to: '/team', icon: Users, label: 'Team' },
  { to: '/pricing', icon: CreditCard, label: 'Pricing' },
  { to: '/settings', icon: Settings, label: 'Settings' },
] as { to: string; icon: any; label: string; badge?: string; dynamicBadge?: boolean }[]

export default function AppLayout() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-950">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col glass border-r border-white/5 shrink-0 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-brand-600/10 to-transparent" />

        {/* Logo */}
        <div className="relative flex items-center gap-2.5 px-5 py-5 border-b border-white/5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-glow-sm">
            <Zap size={17} className="text-white" />
          </div>

          <span className="font-bold text-lg tracking-tight text-gradient">
            ForgeAI
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-1 relative min-h-0">
          {nav.map(({ to, icon: Icon, label, badge, dynamicBadge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx('nav-link', isActive && 'active')
              }
            >
              <Icon size={17} />
              {label}
              {dynamicBadge && <LeadsUnreadBadge />}
              {badge && !dynamicBadge && (
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-brand-500 to-violet-500 text-white">
                  {badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-white/5 shrink-0 relative">
          <div className="gradient-border p-[1.5px] rounded-2xl">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-surface-900">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-8 h-8 rounded-full ring-2 ring-brand-500/30"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shadow-glow-sm">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-100 truncate">
                  {user?.name}
                </p>
                <p className="text-[11px] text-zinc-500 truncate">
                  {user?.email}
                </p>
              </div>

              <button
                onClick={handleLogout}
                title="Log out"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative">
        {/* Background glow */}
        <div className="pointer-events-none absolute top-0 right-0 w-[400px] h-[300px] bg-violet-600/5 rounded-full blur-[100px]" />

        {/* Route Content */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  )
}