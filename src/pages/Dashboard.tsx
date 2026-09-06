import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { format, startOfDay } from 'date-fns'
import {
  Trophy,
  CheckCircle,
  TrendingUp,
  ArrowRight,
  Plus,
  Loader2,
  Users,
  Sparkles,
  Activity,
} from 'lucide-react'
import { calculateLevel, getStreakFireEmoji, calculateStreak, calculateLongestStreak } from '../lib/streakUtils'
import { getBrowserTimezone, todayInTimezone } from '../lib/timezone'

export function Dashboard() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  // Timezone drift mitigation: sync profile timezone with browser timezone once per session
  useEffect(() => {
    if (!profile || !user) return

    const sessionKey = `tz-sync-${user.id}`
    if (sessionStorage.getItem(sessionKey)) return
    sessionStorage.setItem(sessionKey, '1')

    const browserTimezone = getBrowserTimezone()
    const storedTimezone = profile.timezone || 'UTC'

    // Skip if already in sync or if stored is still the default UTC
    if (storedTimezone === browserTimezone || storedTimezone === 'UTC') return

    // Silently sync the timezone
    supabase
      .from('profiles')
      .update({ timezone: browserTimezone })
      .eq('id', user.id)
      .then(({ error }) => {
        if (!error) {
          queryClient.invalidateQueries({ queryKey: ['profile', user.id] })
        }
        // Silent failure is acceptable - next session will retry
      })
  }, [profile, user, queryClient])

  const { data: userRoomStreaks = {} } = useQuery({
    queryKey: ['user-room-streaks', user?.id, profile?.timezone],
    queryFn: async () => {
      if (!user) return {}
      const { data, error } = await supabase
        .from('check_ins')
        .select('room_id, check_in_date')
        .eq('user_id', user.id)
        .eq('completed', true)

      if (error) return {}

      // Anchor "today" in the user's profile timezone so this
      // client-side walk matches what the DB will compute for
      // the same user via calculate_user_current_streak.
      const tz = profile?.timezone || getBrowserTimezone()
      const todayStr = todayInTimezone(tz)

      const result: Record<string, number> = {}
      const byRoom: Record<string, string[]> = {}
      ;(data || []).forEach((c: any) => {
        if (!byRoom[c.room_id]) byRoom[c.room_id] = []
        byRoom[c.room_id].push(c.check_in_date)
      })

      Object.entries(byRoom).forEach(([roomId, dates]) => {
        // Use the shared streak calculator so the rules
        // (same-day de-dup, yesterday grace, gap detection)
        // are identical to the personal-streak path.
        result[roomId] = calculateStreak(dates, todayStr)
      })

      return result
    },
    enabled: !!user,
  })

  const { data: userRooms, isLoading: roomsLoading } = useQuery({
    queryKey: ['user-rooms', user?.id],
    queryFn: async () => {
      // Fetch rooms_with_stats for user's rooms to get member_count in one query
      const { data, error } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', user?.id)
        .eq('is_active', true)
      if (error) throw error
      if (!data || data.length === 0) return []
      const roomIds = data.map((m) => m.room_id)
      const { data: roomsData, error: roomsErr } = await supabase
        .from('rooms_with_stats')
        .select('*')
        .in('id', roomIds)
      if (roomsErr) throw roomsErr
      return roomsData || []
    },
    enabled: !!user,
  })

  const { data: todayCheckins } = useQuery({
    queryKey: ['today-checkins', user?.id],
    queryFn: async () => {
      const today = format(startOfDay(new Date()), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('check_ins')
        .select('room_id')
        .eq('user_id', user?.id)
        .eq('check_in_date', today)
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  // Fetch check-in dates for the last 7 days
  const { data: last7DaysCheckins } = useQuery({
    queryKey: ['last7days-checkins', user?.id],
    queryFn: async () => {
      if (!user) return []
      const today = new Date()
      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(today.getDate() - 6)
      const { data, error } = await supabase
        .from('check_ins')
        .select('check_in_date')
        .eq('user_id', user.id)
        .gte('check_in_date', format(startOfDay(sevenDaysAgo), 'yyyy-MM-dd'))
        .lte('check_in_date', format(startOfDay(today), 'yyyy-MM-dd'))
      if (error) throw error
      return data?.map((c: any) => c.check_in_date) || []
    },
    enabled: !!user,
  })

  // Fetch all check-in dates for accurate streak calculation
  const { data: allCheckInDates = [] } = useQuery({
    queryKey: ['all-checkin-dates', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('check_ins')
        .select('check_in_date')
        .eq('user_id', user.id)
      if (error) throw error
      return data?.map((c: any) => c.check_in_date) || []
    },
    enabled: !!user,
  })

  // Calculate real streaks from check-in data
  const realCurrentStreak = useMemo(() => calculateStreak(allCheckInDates), [allCheckInDates])
  const realLongestStreak = useMemo(() => calculateLongestStreak(allCheckInDates), [allCheckInDates])

  // Fetch member counts for user's rooms (now included in rooms_with_stats)
  const memberCounts: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {}
    ;(userRooms || []).forEach((r: any) => {
      if (r.member_count !== undefined) counts[r.id] = r.member_count
    })
    return counts
  }, [userRooms])

  const checkInMutation = useMutation({
    mutationFn: async (roomId: string) => {
      // Use the profile's stored timezone (falling back to
      // browser timezone, then UTC) so the date we write is
      // consistent with the date the DB's calculate_user_*
      // _streak functions will compute for the trigger.
      const tz = profile?.timezone || getBrowserTimezone()
      const today = todayInTimezone(tz)
      const { error } = await supabase.from('check_ins').upsert(
        {
          user_id: user?.id,
          room_id: roomId,
          check_in_date: today,
          completed: true,
        },
        { onConflict: 'user_id,room_id,check_in_date' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today-checkins'] })
      queryClient.invalidateQueries({ queryKey: ['user-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['user-room-streaks'] })
      queryClient.invalidateQueries({ queryKey: ['last7days-checkins'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })

  const displayProfile = profile
  const displayRooms = userRooms || []
  const checkedInRoomIds = new Set(todayCheckins?.map((c) => c.room_id) || [])
  const levelInfo = calculateLevel(displayProfile?.xp || 0)

  // Compute unique check-in dates in the last 7 days
  const last7DaysCount = last7DaysCheckins
    ? new Set(last7DaysCheckins).size
    : 0

  const totalCheckedInToday = displayRooms.filter((r: any) =>
    checkedInRoomIds.has(r.id)
  ).length
  const totalRooms = displayRooms.length

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted mb-1">{format(new Date(), 'EEEE, MMMM d')}</p>
          <h1 className="text-3xl font-bold">
            Hey, <span className="text-accent">{displayProfile?.display_name || displayProfile?.username || 'there'}</span>
          </h1>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-sm text-muted">{totalCheckedInToday}/{totalRooms} done</span>
        </div>
      </div>

      {/* Hero Streak Card */}
      <div className="relative overflow-hidden rounded-2xl border border-border" style={{
        background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)',
      }}>
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full" style={{
          background: 'radial-gradient(circle, rgba(249, 115, 22, 0.2) 0%, transparent 70%)',
        }} />

        <div className="relative p-6 md:p-8">
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div>
              <div className="text-sm text-muted uppercase tracking-wide mb-2">Current Streak</div>
              <div className="flex items-baseline gap-3">
                <span className="text-7xl font-bold font-mono text-accent" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {realCurrentStreak}
                </span>
                <span className="text-2xl">🔥</span>
                <span className="text-lg text-muted">days</span>
              </div>
              <div className="mt-3 text-sm text-muted">
                <span className="text-text font-semibold">Best:</span> {realLongestStreak} days ·
                <span className="text-text font-semibold ml-1">Total check-ins:</span> {displayProfile?.total_checkins || 0}
              </div>
            </div>

            <div className="flex flex-col items-end">
              <div className="text-sm text-muted mb-2">Level {levelInfo.level}</div>
              <div className="w-48">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs text-muted">XP Progress</span>
                  <span className="text-xs font-mono text-text">{levelInfo.currentLevelXp}/{levelInfo.nextLevelXp}</span>
                </div>
                <div className="h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-700"
                    style={{
                      width: `${levelInfo.progress}%`,
                      background: 'linear-gradient(90deg, #6366F1, #F97316)',
                    }}
                  />
                </div>
                <div className="text-xs text-muted mt-1.5">{(displayProfile?.xp || 0).toLocaleString()} XP total</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Trophy}
          label="Longest"
          value={realLongestStreak}
          suffix="d"
        />
        <StatCard
          icon={CheckCircle}
          label="Check-ins"
          value={displayProfile?.total_checkins || 0}
        />
        <StatCard
          icon={Activity}
          label="This Week"
          value={last7DaysCount >= 7 ? '7/7' : `${last7DaysCount}/7`}
        />
        <StatCard
          icon={Users}
          label="Rooms"
          value={totalRooms}
        />
      </div>

      {/* Today's Check-ins */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-text">Today's Check-ins</h2>
            <p className="text-sm text-muted">{totalCheckedInToday} of {totalRooms} complete</p>
          </div>
          <Link
            to="/rooms"
            className="flex items-center gap-1 text-sm text-muted hover:text-text transition-colors"
          >
            All rooms <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {roomsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : displayRooms.length === 0 ? (
          <div className="card text-center py-12">
            <Sparkles className="w-10 h-10 text-muted mx-auto mb-3" />
            <h3 className="font-semibold text-text mb-1">No rooms yet</h3>
            <p className="text-sm text-muted mb-4">Join a room to start building streaks with others</p>
            <Link
              to="/rooms"
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4" />
              Browse Rooms
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {displayRooms.map((room: any) => {
              const hasCheckedIn = checkedInRoomIds.has(room.id)
              const isCheckingIn = checkInMutation.isPending
              const progress = Math.min((room.current_room_streak / room.streak_goal) * 100, 100)

              return (
                <div
                  key={room.id}
                  className="group relative bg-surface border border-border rounded-2xl p-5 hover:border-primary/50 transition-all"
                >
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0"
                      style={{ backgroundColor: `${room.color}20` }}
                    >
                      {room.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-text truncate">{room.name}</h3>
                        <span className="text-xs text-muted">· {memberCounts[room.id] || 1} member{(memberCounts[room.id] || 1) === 1 ? '' : 's'}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted">
                        <span className="flex items-center gap-1">
                          <span>{getStreakFireEmoji(userRoomStreaks[room.id] || 0)}</span>
                          <span className="text-text font-mono font-semibold">{userRoomStreaks[room.id] || 0}</span>
                          day streak
                        </span>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="shrink-0">
                      {hasCheckedIn ? (
                        <div className="flex items-center gap-1.5 text-success font-semibold text-sm">
                          <CheckCircle className="w-5 h-5" />
                          <span className="hidden sm:inline">Done</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => checkInMutation.mutate(room.id)}
                          disabled={isCheckingIn}
                          className="px-5 py-2.5 bg-gradient-to-br from-accent to-warning text-white font-semibold rounded-full text-sm hover:scale-105 transition-transform shadow-lg shadow-accent/20 disabled:opacity-50 disabled:scale-100"
                        >
                          {isCheckingIn ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Check in'
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Room progress */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted">Room streak</span>
                      <span className="font-mono text-text">
                        {room.current_room_streak} <span className="text-muted">/ {room.streak_goal}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-700"
                        style={{
                          width: `${progress}%`,
                          background: `linear-gradient(90deg, ${room.color} 0%, ${room.color}88 100%)`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Link
          to="/rooms/create"
          className="card card-interactive group flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
            <Plus className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-text">Create a Room</h3>
            <p className="text-sm text-muted">Build a new habit community</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted group-hover:text-text group-hover:translate-x-1 transition-all" />
        </Link>

        <Link
          to="/habits"
          className="card card-interactive group flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-white transition-colors">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-text">Track Habits</h3>
            <p className="text-sm text-muted">Manage personal habits</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted group-hover:text-text group-hover:translate-x-1 transition-all" />
        </Link>
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix = '',
}: {
  icon: any
  label: string
  value: number | string
  suffix?: string
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-2 text-muted">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs uppercase tracking-wide font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-text font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {value}
        </span>
        {suffix && <span className="text-sm text-muted">{suffix}</span>}
      </div>
    </div>
  )
}