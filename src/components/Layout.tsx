import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Home, Users, Trophy, Target, User as UserIcon, LogOut, Flame, Sun, Moon, Menu, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useThemeStore } from '../store/themeStore'
import { supabase } from '../lib/supabase'
import { clsx } from 'clsx'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: Home },
  { path: '/rooms', label: 'Rooms', icon: Users },
  { path: '/habits', label: 'My Habits', icon: Target },
  { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { path: '/profile', label: 'Profile', icon: UserIcon },
]


export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { theme, toggleTheme } = useThemeStore()
  const [expanded, setExpanded] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = async () => {
    queryClient.clear()
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header with open button */}
      <header className="sticky top-0 z-50 md:hidden border-b border-border bg-surface/95 backdrop-blur-lg h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-xl font-bold">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-accent"><Flame className="w-5 h-5 text-white" /></div>
          <span className="text-text">StreakSync</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu" className="p-2 rounded-lg hover:bg-surface-hover transition-colors"><Menu className="w-6 h-6 text-text" /></button>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)] md:min-h-screen">
        {/* Desktop sidebar */}
        <aside className={clsx(
          'hidden md:flex flex-col sticky top-0 h-screen z-40 bg-gradient-to-b from-surface/70 to-surface border-r-2 border-border shadow-xl shadow-border/10 transition-all duration-300 ease-out',
          expanded ? 'w-60' : 'w-16'
        )}>
          {/* Header with logo + toggle */}
          <div className="flex items-center justify-between px-3 py-3 border-b border-border shrink-0">
            <Link to="/dashboard" className="flex items-center gap-3 min-w-0 overflow-hidden">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-accent shrink-0"><Flame className="w-5 h-5 text-white" /></div>
              <span className={clsx('font-bold text-text whitespace-nowrap transition-opacity duration-200', expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden')}>StreakSync</span>
            </Link>
            <button
              onClick={() => setExpanded(!expanded)}
              className="shrink-0 ml-2 w-6 h-6 bg-gradient-accent rounded-full shadow-lg flex items-center justify-center hover:brightness-110 transition-all border-2 border-background"
              aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
              title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {expanded ? <ChevronLeft className="w-3 h-3 text-white" /> : <ChevronRight className="w-3 h-3 text-white" />}
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1 scrollbar-none">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative group',
                    isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-muted hover:text-text hover:bg-surface-hover'
                  )}
                  title={expanded ? undefined : item.label}
                >
                  <Icon className={clsx('w-5 h-5 shrink-0', isActive ? 'text-white' : 'text-muted')} />
                  <span className={clsx('whitespace-nowrap transition-opacity duration-200', expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden')}>
                    {item.label}
                  </span>
                  {!expanded && (
                    <span className="absolute left-14 z-50 px-2 py-1 bg-surface border border-border rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">{item.label}</span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Bottom actions */}
          <div className="px-2 py-3 border-t border-border space-y-1">
            <button onClick={() => toggleTheme()} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:text-text hover:bg-surface-hover transition-all w-full text-left" title={expanded ? undefined : 'Theme'}>
              {theme === 'dark' ? <Sun className="w-5 h-5 shrink-0" /> : <Moon className="w-5 h-5 shrink-0" />}
              <span className={clsx('whitespace-nowrap transition-opacity duration-200', expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden')}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button onClick={handleSignOut} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-danger/80 hover:text-danger hover:bg-danger/10 transition-all w-full text-left" title={expanded ? undefined : 'Sign Out'}>
              <LogOut className="w-5 h-5 shrink-0" />
              <span className={clsx('whitespace-nowrap transition-opacity duration-200', expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden')}>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Mobile drawer overlay */}
        {mobileOpen && (
          <>
            <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
            <aside className="fixed left-0 top-0 h-full w-72 bg-gradient-to-b from-surface/95 to-surface border-r-2 border-border shadow-2xl z-50 md:hidden flex flex-col animate-slide-in">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <Link to="/dashboard" className="flex items-center gap-2 text-xl font-bold" onClick={() => setMobileOpen(false)}>
                  <div className="w-8 h-8 rounded-lg bg-gradient-accent flex items-center justify-center"><Flame className="w-5 h-5 text-white" /></div>
                  <span>StreakSync</span>
                </Link>
                <button onClick={() => setMobileOpen(false)} aria-label="Close" className="p-2 rounded-lg hover:bg-surface-hover"><X className="w-5 h-5 text-text" /></button>
              </div>
              <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.path
                  return (
                    <Link key={item.path} to={item.path} onClick={() => setMobileOpen(false)} className={clsx('flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all', isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-muted hover:text-text hover:bg-surface-hover')}>
                      <Icon className={clsx('w-5 h-5', isActive ? 'text-white' : 'text-muted')} />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </nav>
              <div className="p-3 border-t border-border space-y-1">
                <button onClick={() => { toggleTheme(); setMobileOpen(false) }} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-muted hover:text-text transition-all w-full text-left"><Sun className="w-5 h-5" /><span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span></button>
                <button onClick={() => { handleSignOut(); setMobileOpen(false) }} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-danger/80 hover:text-danger transition-all w-full text-left"><LogOut className="w-5 h-5" /><span>Sign Out</span></button>
              </div>
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 max-w-5xl mx-auto px-6 py-10">
          {children}
        </main>
      </div>
    </div>
  )
}
