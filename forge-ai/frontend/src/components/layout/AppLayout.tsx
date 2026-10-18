import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useTheme } from '@/hooks/useTheme'
import {
  LayoutDashboard, GitBranch, Clock, Settings, LogOut, Zap, CreditCard,
  Sparkles, BarChart3, Search, Inbox, Users, Send, Menu, X, Lock, Sun, Moon,
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
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/builder',      icon: Sparkles,        label: 'AI Builder',       badge: 'NEW' },
  { to: '/dashboards',   icon: BarChart3,        label: 'Data Dashboards',  locked: true },
  { to: '/repositories', icon: GitBranch,        label: 'Repositories' },
  { to: '/leads',        icon: Inbox,            label: 'Leads',            locked: true },
  { to: '/outreach',     icon: Send,             label: 'Cold Outreach',    locked: true },
  { to: '/search',       icon: Search,           label: 'Code Search' },
  { to: '/tasks',        icon: Clock,            label: 'Task History' },
  { to: '/team',         icon: Users,            label: 'Team',             locked: true },
  { to: '/pricing',      icon: CreditCard,       label: 'Pricing' },
  { to: '/settings',     icon: Settings,         label: 'Settings' },
] as { to: string; icon: any; label: string; badge?: string; dynamicBadge?: boolean; locked?: boolean }[]

export default function AppLayout() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isDark, toggle } = useTheme()

  const handleLogout = () => { clearAuth(); navigate('/login') }
  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={closeSidebar} />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col overflow-hidden transition-transform duration-300 border-r',
          'lg:relative lg:z-auto lg:translate-x-0 lg:shrink-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ background: 'var(--sidebar)', borderColor: 'var(--sidebar-bdr)' }}
      >
        {/* Logo */}
        <div
          className="relative flex items-center gap-2.5 px-5 py-5 shrink-0"
          style={{ borderBottom: '1px solid var(--sidebar-bdr)' }}
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-glow-sm">
            <Zap size={17} className="text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-gradient">ForgeAI</span>
          <button
            onClick={closeSidebar}
            className="ml-auto lg:hidden p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-3)' }}
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
                  <Lock size={12} className="ml-auto" style={{ color: 'var(--text-3)' }} />
                </div>
              )
            }
            return (
              <NavLink
                key={to}
                to={to}
                onClick={closeSidebar}
                className={({ isActive }) => clsx('nav-link', isActive && 'active')}
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

        {/* User card */}
        <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--sidebar-bdr)' }}>
          <div className="rounded-xl" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full ring-2 ring-brand-500/30" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shadow-glow-sm">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {user?.name}
                </p>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                  {user?.plan && (
                    <span className={clsx(
                      'mr-1 font-semibold',
                      user.plan === 'team' ? 'text-violet-500 dark:text-violet-400'
                        : user.plan === 'pro' ? 'text-brand-500 dark:text-brand-400'
                        : 'text-zinc-500',
                    )}>
                      {user.plan}
                    </span>
                  )}
                  {user?.email}
                </p>
              </div>

              {/* Theme toggle */}
              <button
                onClick={toggle}
                title={isDark ? 'Light mode' : 'Dark mode'}
                className="p-1.5 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/8"
                style={{ color: 'var(--text-3)' }}
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </button>

              <button
                onClick={handleLogout}
                title="Log out"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
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
        <div
          className="lg:hidden flex items-center gap-3 px-4 py-3 shrink-0 z-10"
          style={{
            borderBottom: '1px solid var(--sidebar-bdr)',
            background: 'var(--sidebar)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-2)' }}
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center">
              <Zap size={12} className="text-white" />
            </div>
            <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>ForgeAI</span>
          </div>
          <button
            onClick={toggle}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-3)' }}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        {/* Route Content */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
