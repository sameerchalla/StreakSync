import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import {
  Trophy,
  Crown,
  Medal,
  TrendingUp,
  Loader2,
  Users,
} from 'lucide-react'
import { getStreakFireEmoji, calculateLevel, calculateStreak, calculateLongestStreak } from '../lib/streakUtils'
import { clsx } from 'clsx'

interface LeaderboardEntry {
  rank: number
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  current_streak: number
  longest_streak: number
  total_checkins: number
  xp: number
}

export function Leaderboard() {
  const user = useAuthStore((state) => state.user)

  // Fetch global leaderboard ordered by total_checkins (desc) as a proxy
  const { data: profiles, isLoading } = useQuery({
    queryKey: ['global-leaderboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('total_checkins', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  // Fetch all check-ins to calculate streaks per user
  const { data: allCheckins = [] } = useQuery({
    queryKey: ['leaderboard-checkins'],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('check_ins')
        .select('user_id, check_in_date')
        .in('user_id', (profiles || []).map((p: any) => p.id))
      if (error) return []
      return data || []
    },
    enabled: !!user && !!profiles,
  })

  // Group check-ins by user
  const checkinsByUser = useMemo(() => {
    const result: Record<string, string[]> = {}
    ;(allCheckins || []).forEach((c: any) => {
      if (!result[c.user_id]) result[c.user_id] = []
      result[c.user_id].push(c.check_in_date)
    })
    return result
  }, [allCheckins])

  // Add rank to each entry with calculated streaks
  const displayLeaderboard: LeaderboardEntry[] = useMemo(() => {
    const entries = (profiles || []).map((p, index) => {
      const userCheckins = checkinsByUser[p.id] || []
      const currentStreak = calculateStreak(userCheckins)
      const longestStreak = calculateLongestStreak(userCheckins)

      return {
        rank: index + 1,
        id: p.id,
        username: p.username || '',
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        total_checkins: p.total_checkins || 0,
        xp: p.xp || 0,
      }
    })

    // Sort by current streak descending, then total_checkins descending
    entries.sort((a, b) => b.current_streak - a.current_streak || b.total_checkins - a.total_checkins)

    // Re-rank after sorting
    return entries.map((entry, index) => ({ ...entry, rank: index + 1 }))
  }, [profiles, checkinsByUser])

  // Find current user's entry
  const currentUserEntry = displayLeaderboard.find((entry) => entry.id === user?.id)
  const totalUsers = displayLeaderboard.length

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text flex items-center gap-3">
          <Trophy className="w-7 h-7 text-accent" />
          Global Leaderboard
        </h1>
        <p className="text-muted mt-1">
          Compete with the best streakers worldwide
        </p>
      </div>

      {/* Top 3 Podium */}
      {!isLoading && displayLeaderboard.length >= 3 && (
        <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
          {/* 2nd Place */}
          <div className="text-center pt-8">
            <div className="relative mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-3xl mb-2 shadow-lg">
              <Medal className="absolute -top-6 left-1/2 -translate-x-1/2 w-8 h-8 text-gray-400" />
              <span>🥈</span>
            </div>
            <h3 className="font-semibold text-text text-sm truncate">
              {displayLeaderboard[1].display_name || displayLeaderboard[1].username}
            </h3>
            <div className="text-accent font-bold">{displayLeaderboard[1].current_streak} days</div>
          </div>

          {/* 1st Place */}
          <div className="text-center">
            <div className="relative mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-4xl mb-2 shadow-xl shadow-yellow-500/20">
              <Crown className="absolute -top-8 left-1/2 -translate-x-1/2 w-10 h-10 text-yellow-500" />
              <span>👑</span>
            </div>
            <h3 className="font-bold text-text truncate">
              {displayLeaderboard[0].display_name || displayLeaderboard[0].username}
            </h3>
            <div className="text-accent font-bold text-lg">{displayLeaderboard[0].current_streak} days</div>
            <div className="text-xs text-muted">🔥 TOP STREAK</div>
          </div>

          {/* 3rd Place */}
          <div className="text-center pt-8">
            <div className="relative mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center text-3xl mb-2 shadow-lg">
              <Medal className="absolute -top-6 left-1/2 -translate-x-1/2 w-8 h-8 text-amber-600" />
              <span>🥉</span>
            </div>
            <h3 className="font-semibold text-text text-sm truncate">
              {displayLeaderboard[2].display_name || displayLeaderboard[2].username}
            </h3>
            <div className="text-accent font-bold">{displayLeaderboard[2].current_streak} days</div>
          </div>
        </div>
      )}

      {/* Full Leaderboard */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-text">All Rankings</h2>
          <div className="flex items-center gap-4 text-sm text-muted">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              Sorted by streak
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : displayLeaderboard.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-muted mx-auto mb-3" />
            <h3 className="font-semibold text-text mb-1">No users yet</h3>
            <p className="text-sm text-muted">Be the first to start a streak!</p>
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
            {displayLeaderboard.map((entry) => {
              const isCurrentUser = entry.id === user?.id
              const levelInfo = calculateLevel(entry.xp)

              return (
                <div
                  key={entry.id}
                  className={clsx(
                    'flex items-center gap-4 p-4 transition-colors',
                    isCurrentUser && 'bg-primary/10',
                    !isCurrentUser && 'hover:bg-background'
                  )}
                >
                  {/* Rank */}
                  <div className="flex items-center justify-center w-10 h-10 shrink-0">
                    {entry.rank === 1 ? (
                      <Crown className="w-6 h-6 text-yellow-500" />
                    ) : entry.rank === 2 ? (
                      <Medal className="w-6 h-6 text-gray-400" />
                    ) : entry.rank === 3 ? (
                      <Medal className="w-6 h-6 text-amber-600" />
                    ) : (
                      <span className="text-lg font-mono font-bold text-muted">{entry.rank}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold shrink-0">
                    {entry.avatar_url ? (
                      <img src={entry.avatar_url} alt="" className="w-full h-full rounded-full" />
                    ) : (
                      (entry.display_name?.charAt(0) || entry.username?.charAt(0) || '?').toUpperCase()
                    )}
                  </div>

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text truncate">
                        {entry.display_name || entry.username}
                      </span>
                      {isCurrentUser && (
                        <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full shrink-0">
                          You
                        </span>
                      )}
                      <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full shrink-0">
                        Lv.{levelInfo.level}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span>{entry.total_checkins} check-ins</span>
                      <span>Best: {entry.longest_streak} days</span>
                    </div>
                  </div>

                  {/* Streak */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xl">{getStreakFireEmoji(entry.current_streak)}</span>
                    <div className="text-right">
                      <span className="text-lg font-mono font-bold text-text">
                        {entry.current_streak}
                      </span>
                      <span className="text-xs text-muted ml-1">days</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Your Rank Card */}
      {currentUserEntry && (
        <div className="bg-gradient-to-r from-primary/20 to-accent/20 rounded-xl p-6 border border-primary/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm text-muted mb-1">Your Ranking</h3>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-text">#{currentUserEntry.rank}</span>
                <span className="text-muted">out of {totalUsers}+ streakers</span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end">
                <span className="text-2xl">{getStreakFireEmoji(currentUserEntry.current_streak)}</span>
                <span className="text-2xl font-bold text-accent">{currentUserEntry.current_streak}</span>
              </div>
              <span className="text-sm text-muted">current streak</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
