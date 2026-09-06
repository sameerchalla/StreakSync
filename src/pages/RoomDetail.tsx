import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { format, startOfDay, subDays } from 'date-fns'
import {
  ArrowLeft,
  Flame,
  Users,
  Trophy,
  CheckCircle,
  Loader2,
  Crown,
  Medal,
  AlertCircle,
  Plus,
} from 'lucide-react'
import { getStreakFireEmoji, getStreakMilestone, calculateStreak, calculateLongestStreak } from '../lib/streakUtils'
import { getBrowserTimezone, todayInTimezone } from '../lib/timezone'
import { clsx } from 'clsx'

export function RoomDetail() {
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [showConfetti, setShowConfetti] = useState(false)

  // Fetch user's profile for timezone
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', user.id)
        .single()
      if (error) return null
      return data
    },
    enabled: !!user,
  })

  // Fetch room details
  const { data: room, isLoading, error: roomError } = useQuery({
    queryKey: ['room', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id && !!user,
  })

  // Fetch member count from rooms_with_stats
  const { data: roomWithStats } = useQuery({
    queryKey: ['room-with-stats', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms_with_stats')
        .select('member_count')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
  const memberCount = roomWithStats?.member_count || 0

  // Fetch today's check-in for current user (using profile timezone)
  const { data: todayCheckin } = useQuery({
    queryKey: ['today-checkin', id, user?.id, profile?.timezone],
    queryFn: async () => {
      const tz = profile?.timezone || getBrowserTimezone()
      const today = todayInTimezone(tz)
      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .eq('room_id', id)
        .eq('user_id', user?.id)
        .eq('check_in_date', today)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!id && !!user,
  })

  // Fetch room check-ins for calculating room streak
  const { data: roomCheckIns = [] } = useQuery({
    queryKey: ['room-checkins', id],
    queryFn: async () => {
      if (!id) return []
      const { data, error } = await supabase
        .from('check_ins')
        .select('check_in_date')
        .eq('room_id', id)
      if (error) throw error
      return data?.map((c: any) => c.check_in_date) || []
    },
    enabled: !!id,
  })

  // Calculate room current streak and longest streak
  const { streak: roomCurrentStreak, longestStreak: roomLongestStreak } = useMemo(() => {
    if (!roomCheckIns.length) return { streak: 0, longestStreak: 0 }

    const today = startOfDay(new Date())
    const yesterday = subDays(today, 1)
    const dateSet = new Set(roomCheckIns)

    // Current streak: consecutive days ending today or yesterday using calculateStreak
    let currentStreak = 0
    const hasToday = dateSet.has(format(today, 'yyyy-MM-dd'))
    const hasYesterday = dateSet.has(format(yesterday, 'yyyy-MM-dd'))

    if (!hasToday && !hasYesterday) {
      // No recent check-in, streak is 0
    } else {
      // Filter to recent dates (last 60 days) for current streak calculation
      const recentDates = roomCheckIns.filter((d) => {
        const date = new Date(d)
        const daysAgo = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
        return daysAgo <= 60
      })
      currentStreak = calculateStreak(recentDates)
    }

    // Longest streak: longest consecutive sequence across all check-in dates
    const longestStreak = calculateLongestStreak(roomCheckIns)

    return { streak: currentStreak, longestStreak }
  }, [roomCheckIns])

  // Fetch leaderboard: for each active member, compute personal streak in this room
  const { data: leaderboard = [] } = useQuery({
    queryKey: ['room-leaderboard', id],
    queryFn: async () => {
      // Get all active members
      const { data: members, error: memErr } = await supabase
        .from('room_members')
        .select(`
          user_id,
          profiles:user_id (id, username, display_name, avatar_url)
        `)
        .eq('room_id', id)
        .eq('is_active', true)
      if (memErr) throw memErr
      if (!members || members.length === 0) return []

      // Get all check-ins for these members in this room
      const userIds = members.map((m: any) => m.user_id)
      const { data: checkins, error: ciErr } = await supabase
        .from('check_ins')
        .select('user_id, check_in_date')
        .eq('room_id', id)
        .in('user_id', userIds)
        .eq('completed', true)
      if (ciErr) throw ciErr

      // For each member, compute current personal streak in this room
      const today = startOfDay(new Date())
      const rows = members.map((m: any) => {
        const dates = new Set(
          (checkins || [])
            .filter((c: any) => c.user_id === m.user_id)
            .map((c: any) => c.check_in_date)
        )
        const totalCheckins = dates.size

        // Personal streak: count consecutive days going back from today (or yesterday)
        let streak = 0
        let cursor = today
        // If user didn't check in today but did yesterday, start from yesterday
        if (!dates.has(format(cursor, 'yyyy-MM-dd'))) {
          cursor = subDays(cursor, 1)
        }
        while (dates.has(format(cursor, 'yyyy-MM-dd'))) {
          streak += 1
          cursor = subDays(cursor, 1)
        }

        return {
          id: m.user_id,
          username: m.profiles?.username || '',
          display_name: m.profiles?.display_name || m.profiles?.username || 'Member',
          avatar_url: m.profiles?.avatar_url || null,
          streak,
          total_checkins: totalCheckins,
        }
      })

      // Sort by streak desc, then total_checkins desc
      rows.sort((a, b) => b.streak - a.streak || b.total_checkins - a.total_checkins)
      return rows.map((r, i) => ({ ...r, rank: i + 1 }))
    },
    enabled: !!id,
  })

  // Check if user is a member of this room
  const { data: isMember } = useQuery({
    queryKey: ['is-member', id, user?.id],
    queryFn: async () => {
      if (!user) return false
      const { data, error } = await supabase
        .from('room_members')
        .select('id')
        .eq('room_id', id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
      if (error) return false
      return !!data
    },
    enabled: !!id && !!user,
  })

  // Join room mutation
  const joinMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('room_members').upsert(
        {
          user_id: user?.id,
          room_id: id,
          is_active: true,
        },
        { onConflict: 'user_id,room_id' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['is-member', id] })
      queryClient.invalidateQueries({ queryKey: ['joined-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['user-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['room-member-count', id] })
    },
  })

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: async () => {
      // Auto-join the user as a member when they check in
      if (!isMember) {
        const { error: joinErr } = await supabase.from('room_members').upsert(
          {
            user_id: user?.id,
            room_id: id,
            is_active: true,
          },
          { onConflict: 'user_id,room_id' }
        )
        if (joinErr) throw joinErr
      }
      // Use profile timezone for the check-in date
      const tz = profile?.timezone || getBrowserTimezone()
      const today = todayInTimezone(tz)
      const { error } = await supabase.from('check_ins').upsert(
        {
          user_id: user?.id,
          room_id: id,
          check_in_date: today,
          completed: true,
        },
        {
          onConflict: 'user_id,room_id,check_in_date',
        }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today-checkin', id] })
      queryClient.invalidateQueries({ queryKey: ['room', id] })
      queryClient.invalidateQueries({ queryKey: ['room-checkins', id] })
      queryClient.invalidateQueries({ queryKey: ['room-checkins-for-streak'] })
      queryClient.invalidateQueries({ queryKey: ['room-leaderboard', id] })
      queryClient.invalidateQueries({ queryKey: ['room-member-count', id] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      queryClient.invalidateQueries({ queryKey: ['user-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['user-room-streaks'] })
      queryClient.invalidateQueries({ queryKey: ['today-checkins'] })
      queryClient.invalidateQueries({ queryKey: ['joined-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['is-member', id] })
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 3000)
    },
  })

  const displayRoom = room
  const hasCheckedInToday = !!todayCheckin

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (roomError || !displayRoom) {
    return (
      <div className="space-y-4">
        <Link
          to="/rooms"
          className="inline-flex items-center gap-2 text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Rooms
        </Link>
        <div className="bg-surface rounded-xl p-12 border border-border text-center">
          <AlertCircle className="w-12 h-12 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text mb-2">Room not found</h3>
          <p className="text-muted">This room may have been deleted or you don't have access.</p>
        </div>
      </div>
    )
  }

  const progress = Math.min(
    ((roomCurrentStreak) / (displayRoom.streak_goal || 100)) * 100,
    100
  )
  const milestone = getStreakMilestone(roomCurrentStreak)

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Confetti Effect */}
      {showConfetti && <ConfettiEffect />}

      {/* Back Button */}
      <Link
        to="/rooms"
        className="inline-flex items-center gap-2 text-muted hover:text-text transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Rooms
      </Link>

      {/* Room Header */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        {/* Room Banner */}
        <div
          className="h-24 relative"
          style={{
            background: `linear-gradient(135deg, ${displayRoom.color || '#6366F1'} 0%, ${
              displayRoom.color || '#6366F1'
            }80 100%)`,
          }}
        >
          <div className="absolute -bottom-12 left-6">
            <div
              className="flex items-center justify-center w-24 h-24 rounded-2xl text-4xl border-4 border-surface"
              style={{ backgroundColor: displayRoom.color || '#6366F1' }}
            >
              {displayRoom.icon}
            </div>
          </div>
        </div>

        <div className="pt-16 px-6 pb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text">{displayRoom.name}</h1>
              <p className="text-muted mt-1">{displayRoom.description || displayRoom.goal}</p>
            </div>
            {isMember === false && (
              <button
                onClick={() => joinMutation.mutate()}
                disabled={joinMutation.isPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-accent text-white font-semibold rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
              >
                {joinMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Join Room
                  </>
                )}
              </button>
            )}
          </div>

          {/* Room Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="text-center p-4 bg-background rounded-xl">
              <div className="text-2xl mb-1">{getStreakFireEmoji(roomCurrentStreak)}</div>
              <div className="text-xl font-bold text-text">{roomCurrentStreak}</div>
              <div className="text-xs text-muted">Room Streak</div>
            </div>
            <div className="text-center p-4 bg-background rounded-xl">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Trophy className="w-5 h-5 text-accent" />
              </div>
              <div className="text-xl font-bold text-text">{roomLongestStreak}</div>
              <div className="text-xs text-muted">Best Streak</div>
            </div>
            <div className="text-center p-4 bg-background rounded-xl">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="text-xl font-bold text-text">{memberCount}</div>
              <div className="text-xs text-muted">Members</div>
            </div>
          </div>
        </div>
      </div>

      {/* Room Progress */}
      <div className="bg-surface rounded-xl p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-text">Room Progress</h2>
            {milestone && (
              <p className="text-sm text-accent mt-1">{milestone}</p>
            )}
          </div>
          <span className="text-2xl font-bold text-text">
            {roomCurrentStreak}
            <span className="text-muted text-lg"> / {displayRoom.streak_goal || 100}</span>
          </span>
        </div>

        <div className="relative h-4 bg-border rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${displayRoom.color || '#F97316'} 0%, #F59E0B 100%)`,
            }}
          />
        </div>
        <div className="flex justify-between mt-2 text-sm text-muted">
          <span>{Math.round(progress)}% complete</span>
          <span>Goal: {displayRoom.streak_goal || 100} days</span>
        </div>
      </div>

      {/* Check-in Section */}
      <div className="bg-surface rounded-xl p-6 border border-border text-center">
        <h2 className="font-semibold text-text mb-4">Today's Check-in</h2>
        <p className="text-muted mb-6">{displayRoom.goal}</p>

        <button
          onClick={() => checkInMutation.mutate()}
          disabled={hasCheckedInToday || checkInMutation.isPending}
          className={clsx(
            'relative px-12 py-6 text-xl font-bold rounded-full transition-all duration-300',
            hasCheckedInToday
              ? 'bg-success text-white'
              : 'bg-gradient-accent text-white hover:scale-105 shadow-xl shadow-accent/25'
          )}
        >
          {checkInMutation.isPending ? (
            <Loader2 className="w-8 h-8 animate-spin mx-auto" />
          ) : hasCheckedInToday ? (
            <>
              <CheckCircle className="w-8 h-8 mx-auto mb-2" />
              <span>Checked In!</span>
            </>
          ) : (
            <>
              <Flame className="w-8 h-8 mx-auto mb-2 animate-fire-pulse" />
              <span>Check In Today</span>
            </>
          )}
        </button>

        {hasCheckedInToday && (
          <p className="text-success mt-4 text-sm">
            Great job! You've maintained your streak.
          </p>
        )}
      </div>

      {/* Leaderboard */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-text">Leaderboard</h2>
        </div>

        {leaderboard.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-10 h-10 text-muted mx-auto mb-2" />
            <p className="text-sm text-muted">No members have checked in yet. Be the first!</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {leaderboard.map((entry: any) => {
              const isCurrentUser = entry.id === user?.id

              return (
                <div
                  key={entry.id}
                  className={clsx(
                    'flex items-center gap-4 p-4',
                    isCurrentUser && 'bg-primary/10'
                  )}
                >
                  {/* Rank */}
                  <div className="flex items-center justify-center w-8 h-8">
                    {entry.rank === 1 ? (
                      <Crown className="w-6 h-6 text-yellow-500" />
                    ) : entry.rank === 2 ? (
                      <Medal className="w-6 h-6 text-gray-400" />
                    ) : entry.rank === 3 ? (
                      <Medal className="w-6 h-6 text-amber-600" />
                    ) : (
                      <span className="text-sm font-mono text-muted">{entry.rank}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold shrink-0 text-sm">
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
                        {entry.display_name}
                      </span>
                      {isCurrentUser && (
                        <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {entry.total_checkins} total check-ins
                    </div>
                  </div>

                  {/* Streak */}
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {getStreakFireEmoji(entry.streak)}
                    </span>
                    <span className="font-mono font-bold text-text">
                      {entry.streak}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ConfettiEffect() {
  const colors = ['#F97316', '#6366F1', '#22C55E', '#F59E0B', '#EF4444']
  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: Math.random() * 8 + 4,
  }))

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute rounded-full animate-confetti"
          style={{
            left: `${piece.left}%`,
            top: '-10px',
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
