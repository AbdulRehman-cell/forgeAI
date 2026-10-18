import { useState } from 'react'
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
  Menu,
  X,
  Lock,
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
  { to: '/dashboards', icon: BarChart3, label: 'Data Dashboards', locked: true },
  { to: '/repositories', icon: GitBranch, label: 'Repositories' },
  { to: '/leads', icon: Inbox, label: 'Leads', locked: true },
  { to: '/outreach', icon: Send, label: 'Cold Outreach', locked: true },
  { to: '/search', icon: Search, label: 'Code Search' },
  { to: '/tasks', icon: Clock, label: 'Task History' },
  { to: '/team', icon: Users, label: 'Team', locked: true },
  { to: '/pricing', icon: CreditCard, label: 'Pricing' },
  { to: '/settings', icon: Settings, label: 'Settings' },
] as { to: string; icon: any; label: string; badge?: string; dynamicBadge?: boolean; locked?: boolean }[]

export default function AppLayout() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-950">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-50 w-64 flex flex-col glass border-r border-white/5 overflow-hidden transition-transform duration-300',
        'lg:relative lg:z-auto lg:translate-x-0 lg:shrink-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        {/* Ambient glow */}
        <div className="pointer-events-none absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-brand-600/10 to-transparent" />

        {/* Logo */}
        <div className="relative flex items-center gap-2.5 px-5 py-5 border-b border-white/5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-glow-sm">
            <Zap size={17} className="text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-gradient">ForgeAI</span>
          <button
            onClick={closeSidebar}
            className="ml-auto lg:hidden p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-1 relative min-h-0">
          {nav.map(({ to, icon: Icon, label, badge, dynamicBadge, locked }) => {
            if (locked) {
              return (
                <div
                  key={to}
                  title="Coming soon"
                  className="nav-link opacity-40 cursor-not-allowed select-none pointer-events-none"
                >
                  <Icon size={17} />
                  {label}
                  <Lock size={12} className="ml-auto text-zinc-500" />
                </div>
              )
            }
            return (
              <NavLink
                key={to}
                to={to}
                onClick={closeSidebar}
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
            )
          })}
        </nav>

        {/* Team membership badge */}
        {user?.teamOwnerId && (
          <div className="px-3 pb-2 shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-500/10 border border-brand-500/15">
              <Users size={12} className="text-brand-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-brand-300 truncate">Team workspace</p>
                <p className="text-[9px] text-brand-400/60 truncate capitalize">{user.teamRole ?? 'member'}</p>
              </div>
            </div>
          </div>
        )}

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
                  {user?.plan && (
                    <span className={clsx(
                      'mr-1 font-semibold',
                      user.plan === 'team' ? 'text-violet-400' : user.plan === 'pro' ? 'text-brand-400' : 'text-zinc-600',
                    )}>
                      {user.plan}
                    </span>
                  )}
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
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-surface-950/80 backdrop-blur-sm shrink-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center">
              <Zap size={12} className="text-white" />
            </div>
            <span className="font-bold text-sm text-gradient">ForgeAI</span>
          </div>
        </div>

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
