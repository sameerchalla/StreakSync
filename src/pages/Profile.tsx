import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { format, subDays } from 'date-fns'
import {
  Flame,
  Trophy,
  Target,
  Calendar,
  Edit3,
} from 'lucide-react'
import { calculateLevel, getStreakFireEmoji, generateHeatmapData, calculateStreak, calculateLongestStreak } from '../lib/streakUtils'
import { clsx } from 'clsx'
import { useState, useEffect, useMemo } from 'react'

export function Profile() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  // Fetch profile
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

  // Fetch check-ins for heatmap
  const { data: checkins } = useQuery({
    queryKey: ['all-checkins', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('check_ins')
        .select('check_in_date')
        .eq('user_id', user?.id)
      if (error) throw error
      return data?.map((c) => c.check_in_date) || []
    },
    enabled: !!user,
  })

  // Calculate real streaks from check-in data
  const realCurrentStreak = useMemo(() => calculateStreak(checkins || []), [checkins])
  const realLongestStreak = useMemo(() => calculateLongestStreak(checkins || []), [checkins])

  // Fetch global leaderboard for Top 10 achievement
  const { data: leaderboard } = useQuery({
    queryKey: ['global-leaderboard-profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .order('current_streak', { ascending: false })
        .limit(10)
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  // Check if user is in top 10
  const isTop10 = leaderboard?.some((entry) => entry.id === user?.id) || false

  const displayProfile = profile
  const displayCheckins = checkins || []
  const levelInfo = calculateLevel(displayProfile?.xp || 0)
  const [editingDisplayName, setEditingDisplayName] = useState(false)
  const [newDisplayName, setNewDisplayName] = useState(displayProfile?.display_name || '')

  const handleSaveDisplayName = async () => {
    if (!newDisplayName.trim()) {
      alert('Display name cannot be empty')
      return
    }
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: newDisplayName })
        .eq('id', user?.id)
      if (error) throw error
      // Invalidate so the UI reflects the new display name immediately
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['global-leaderboard'] })
      queryClient.invalidateQueries({ queryKey: ['global-leaderboard-profile'] })
      queryClient.invalidateQueries({ queryKey: ['user-rooms'] })
      setEditingDisplayName(false)
    } catch (err: any) {
      alert('Failed to update display name: ' + err.message)
    }
  }

  // Keep the input field in sync with the latest fetched profile data
  useEffect(() => {
    if (displayProfile?.display_name !== undefined) {
      setNewDisplayName(displayProfile.display_name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayProfile?.display_name])
  const heatmapData = generateHeatmapData(displayCheckins, 365)

  // Calculate weekly stats
  const last7Days = Array.from({ length: 7 }, (_, i) =>
    format(subDays(new Date(), 6 - i), 'yyyy-MM-dd')
  )
  const weeklyCheckins = last7Days.filter((d) => displayCheckins.includes(d)).length

  // Calculate monthly stats
  const last30Days = Array.from({ length: 30 }, (_, i) =>
    format(subDays(new Date(), 29 - i), 'yyyy-MM-dd')
  )
  const monthlyCheckins = last30Days.filter((d) => displayCheckins.includes(d)).length
  const monthlyRate = displayCheckins.length > 0 ? Math.round((monthlyCheckins / 30) * 100) : 0

  // Derive achievements from real data
  const achievements = [
    { emoji: '🔥', label: 'First Check-in', earned: (displayProfile?.total_checkins || 0) >= 1 },
    { emoji: '📅', label: '7-Day Streak', earned: realLongestStreak >= 7 },
    { emoji: '💯', label: '100 Check-ins', earned: (displayProfile?.total_checkins || 0) >= 100 },
    { emoji: '30d', label: '30-Day Streak', earned: realLongestStreak >= 30 },
    { emoji: '💎', label: '1000 XP', earned: (displayProfile?.xp || 0) >= 1000 },
    { emoji: '🏆', label: 'Top 10', earned: isTop10 },
    { emoji: '👑', label: 'Level 5', earned: levelInfo.level >= 5 },
    { emoji: '🚀', label: '365-Day Streak', earned: realLongestStreak >= 365 },
  ]

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Profile Header */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-primary via-primary to-accent relative">
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        </div>

        <div className="px-6 pb-6">
          {/* Avatar */}
          <div className="relative -mt-12 mb-4">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-4xl font-bold shadow-xl border-4 border-surface">
              {displayProfile?.avatar_url ? (
                <img
                  src={displayProfile.avatar_url}
                  alt={displayProfile.display_name || displayProfile.username}
                  className="w-full h-full rounded-2xl object-cover"
                />
              ) : (
                (displayProfile?.display_name || displayProfile?.username || '?').charAt(0).toUpperCase()
              )}
            </div>
          </div>

          {/* User Info */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text">
                {displayProfile?.display_name || displayProfile?.username || 'You'}
              </h1>
              <p className="text-muted">@{displayProfile?.username || 'user'}</p>
              {displayProfile?.created_at && (
                <p className="text-sm text-muted mt-2">
                  Member since {format(new Date(displayProfile.created_at), 'MMMM yyyy')}
                </p>
              )}
            </div>

            <button
              onClick={() => {
                setNewDisplayName(displayProfile?.display_name || '')
                setEditingDisplayName(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-background border border-border rounded-lg text-text hover:bg-border transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* Level Progress */}
      <div className="bg-surface rounded-xl p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-white text-xl font-bold">
              {levelInfo.level}
            </div>
            <div>
              <h3 className="font-semibold text-text">Level {levelInfo.level}</h3>
              <p className="text-sm text-muted">
                {levelInfo.currentLevelXp} / {levelInfo.nextLevelXp} XP to next level
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-primary">{displayProfile?.xp || 0}</span>
            <span className="text-sm text-muted ml-1">XP</span>
          </div>
        </div>
        <div className="h-3 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${levelInfo.progress}%` }}
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Flame}
          label="Current Streak"
          value={realCurrentStreak}
          suffix=" days"
          highlight
          emoji={getStreakFireEmoji(realCurrentStreak)}
        />
        <StatCard
          icon={Trophy}
          label="Longest Streak"
          value={realLongestStreak}
          suffix=" days"
          emoji="🏆"
        />
        <StatCard
          icon={Target}
          label="Total Check-ins"
          value={displayProfile?.total_checkins || 0}
          emoji="✅"
        />
        <StatCard
          icon={Calendar}
          label="This Week"
          value={weeklyCheckins}
          suffix="/ 7 days"
        />
      </div>

      {/* Contribution Heatmap */}
      <div className="bg-surface rounded-xl p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-text">Activity Heatmap</h2>
          <span className="text-sm text-muted">
            {displayCheckins.length > 0 ? `${monthlyRate}% this month` : 'No activity yet'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {heatmapData.slice(-90).map((day) => (
              <div
                key={day.date}
                className={clsx(
                  'w-3 h-3 rounded-sm transition-colors',
                  day.count > 0
                    ? 'bg-success'
                    : 'bg-border hover:bg-border/80'
                )}
                title={`${day.date}: ${day.count > 0 ? 'Checked in' : 'No check-in'}`}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted">
          <span>Less</span>
          <div className="w-3 h-3 rounded-sm bg-border" />
          <div className="w-3 h-3 rounded-sm bg-success/50" />
          <div className="w-3 h-3 rounded-sm bg-success" />
          <span>More</span>
        </div>
      </div>

      {/* Monthly Stats */}
      <div className="bg-surface rounded-xl p-6 border border-border">
        <h2 className="font-semibold text-text mb-4">Monthly Overview</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold text-text mb-1">{monthlyCheckins}</div>
            <div className="text-sm text-muted">Check-ins</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-success mb-1">{monthlyRate}%</div>
            <div className="text-sm text-muted">Success Rate</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-accent mb-1">🔥{realLongestStreak}</div>
            <div className="text-sm text-muted">Best Streak</div>
          </div>
        </div>

        {/* Weekly Chart */}
        <div className="mt-6">
          <div className="flex items-end justify-between gap-2 h-24">
            {last7Days.map((date) => {
              const hasCheckin = displayCheckins.includes(date)
              const dayName = format(new Date(date), 'EEE')
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className={clsx(
                      'w-full rounded-t-lg transition-all',
                      hasCheckin ? 'bg-success' : 'bg-border'
                    )}
                    style={{ height: hasCheckin ? '100%' : '20%' }}
                  />
                  <span className="text-xs text-muted">{dayName}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Achievements — derived from real data */}
      <div className="bg-surface rounded-xl p-6 border border-border">
        <h2 className="font-semibold text-text mb-4">Achievements</h2>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
          {achievements.map((badge) => (
            <div
              key={badge.label}
              className={clsx(
                'flex flex-col items-center gap-2 p-3 rounded-xl transition-colors',
                badge.earned ? 'bg-accent/10' : 'bg-background opacity-50'
              )}
              title={badge.label}
            >
              <span className="text-2xl">{badge.emoji}</span>
              <span className="text-xs text-muted text-center">{badge.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Display Name Modal */}
      {editingDisplayName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md bg-surface rounded-2xl border border-border p-6">
            <h2 className="text-xl font-bold text-text mb-4">Edit Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text mb-2">Display Name</label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
                  placeholder="Your display name"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setEditingDisplayName(false)}
                className="flex-1 py-2 bg-background border border-border rounded-lg text-text font-medium hover:bg-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDisplayName}
                className="flex-1 py-2 bg-gradient-accent text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix = '',
  highlight,
  emoji,
}: {
  icon: any
  label: string
  value: number
  suffix?: string
  highlight?: boolean
  emoji?: string
}) {
  return (
    <div
      className={clsx(
        'bg-surface rounded-xl p-4 border',
        highlight ? 'border-accent/50 bg-accent/5' : 'border-border'
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className={clsx('w-4 h-4', highlight ? 'text-accent' : 'text-muted')} />
        <span className="text-xs text-muted uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        {emoji && <span className="text-xl">{emoji}</span>}
        <span
          className={clsx(
            'text-2xl font-bold font-mono',
            highlight ? 'text-accent' : 'text-text'
          )}
        >
          {value}
        </span>
        <span className="text-sm text-muted">{suffix}</span>
      </div>
    </div>
  )
}