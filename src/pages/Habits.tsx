import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import {
  Plus,
  Target,
  CheckCircle,
  Flame,
  Trash2,
  Loader2,
  TrendingUp,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { generateHeatmapData, getStreakFireEmoji, calculateStreak } from '../lib/streakUtils'
import { todayInTimezone } from '../lib/timezone'
import { clsx } from 'clsx'

const HABIT_ICONS = ['💪', '📚', '🏃', '🧘', '💧', '🥗', '😴', '✍️', '🎨', '🎵', '🧠', '⚡']
const HABIT_COLORS = [
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Cyan', value: '#06B6D4' },
]

export function Habits() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [showAddModal, setShowAddModal] = useState(false)

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

  // Fetch habits
  const { data: habits, isLoading } = useQuery({
    queryKey: ['habits', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('habits')
        .select(`
          *,
          habit_logs (completed_date, completed)
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  // Log habit mutation
  const logMutation = useMutation({
    mutationFn: async ({ habitId, date }: { habitId: string; date: string }) => {
      const { error } = await supabase.from('habit_logs').upsert(
        {
          habit_id: habitId,
          user_id: user?.id,
          completed_date: date,
          completed: true,
        },
        {
          onConflict: 'habit_id,completed_date',
        }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] })
    },
  })

  // Delete habit
  const deleteMutation = useMutation({
    mutationFn: async (habitId: string) => {
      const { error } = await supabase.from('habits').delete().eq('id', habitId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] })
    },
  })

  // Use real habits only
  const displayHabits = habits || []

  // Use timezone-aware date for consistency with check-ins
  const tz = profile?.timezone || 'UTC'
  const today = todayInTimezone(tz)
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - i)
    return todayInTimezone(tz, d)
  })

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">My Habits</h1>
          <p className="text-muted">Track personal habits outside of rooms</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Habit
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted uppercase">Total</span>
          </div>
          <span className="text-2xl font-bold text-text">{displayHabits.length}</span>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-success" />
            <span className="text-xs text-muted uppercase">Today</span>
          </div>
          <span className="text-2xl font-bold text-text">
            {
              displayHabits.filter((h: any) =>
                h.habit_logs?.some((l: any) => l.completed_date === today)
              ).length
            }
          </span>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-4 h-4 text-accent" />
            <span className="text-xs text-muted uppercase">Best Streak</span>
          </div>
          <span className="text-2xl font-bold text-text">
            {Math.max(
              ...displayHabits.map((h: any) => {
                const dates = (h.habit_logs || [])
                  .filter((l: any) => l.completed)
                  .map((l: any) => l.completed_date)
                return calculateStreak(dates)
              }),
              0
            )}
          </span>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted uppercase">Rate</span>
          </div>
          <span className="text-2xl font-bold text-text">
            {(() => {
              if (displayHabits.length === 0) return '0%'
              // Calculate possible slots based on days since habit creation (max 30)
              const possibleSlots = displayHabits.reduce((sum: number, h: any) => {
                const createdAt = new Date(h.created_at)
                const today = new Date()
                const daysSinceCreation = Math.floor((today.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
                const daysToCount = Math.min(Math.max(daysSinceCreation + 1, 0), 30)
                return sum + daysToCount
              }, 0)
              if (possibleSlots === 0) return '0%'
              const completedSlots = displayHabits.reduce((sum: number, h: any) => {
                const dates = new Set(
                  (h.habit_logs || [])
                    .filter((l: any) => l.completed)
                    .map((l: any) => l.completed_date)
                )
                return sum + last30.filter((d) => dates.has(d)).length
              }, 0)
              return `${Math.round((completedSlots / possibleSlots) * 100)}%`
            })()}
          </span>
        </div>
      </div>

      {/* Habits List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : displayHabits.length === 0 ? (
        <div className="bg-surface rounded-xl p-12 border border-border text-center">
          <Target className="w-12 h-12 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text mb-2">No habits yet</h3>
          <p className="text-muted mb-4">
            Create your first personal habit to start tracking
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Habit
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {displayHabits.map((habit: any) => {
            const dates = (habit.habit_logs || [])
              .filter((l: any) => l.completed)
              .map((l: any) => l.completed_date)
            const completedToday = dates.includes(today)
            const streak = calculateStreak(dates)
            const heatmap = generateHeatmapData(dates, 90)

            return (
              <div
                key={habit.id}
                className="bg-surface rounded-xl border border-border overflow-hidden"
              >
                {/* Header */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl"
                      style={{ backgroundColor: `${habit.color}20` }}
                    >
                      {habit.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-text">{habit.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <span>{getStreakFireEmoji(streak)}</span>
                        <span>{streak} day streak</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => logMutation.mutate({ habitId: habit.id, date: today })}
                      disabled={completedToday}
                      className={clsx(
                        'px-6 py-2 rounded-lg font-semibold transition-all',
                        completedToday
                          ? 'bg-success text-white'
                          : 'bg-gradient-accent text-white hover:scale-105'
                      )}
                    >
                      {completedToday ? (
                        <>
                          <CheckCircle className="w-4 h-4 inline mr-1" /> Done
                        </>
                      ) : (
                        'Check In'
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this habit?')) {
                          deleteMutation.mutate(habit.id)
                        }
                      }}
                      className="p-2 text-muted hover:text-danger transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Mini Chart */}
                <div className="px-4 pb-4">
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart
                      data={heatmap.slice(-30).map((d, i) => ({
                        day: i,
                        completed: d.count,
                      }))}
                    >
                      <Line
                        type="monotone"
                        dataKey="completed"
                        stroke={habit.color}
                        strokeWidth={2}
                        dot={false}
                      />
                      <YAxis hide domain={[0, 1]} />
                      <XAxis hide />
                      <Tooltip
                        contentStyle={{
                          background: '#16161A',
                          border: '1px solid #2A2A32',
                          borderRadius: 8,
                        }}
                        labelStyle={{ color: '#71717A' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Habit Modal */}
      {showAddModal && <AddHabitModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}

function AddHabitModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('💪')
  const [color, setColor] = useState('#6366F1')

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('habits').insert({
        user_id: user?.id,
        name,
        icon,
        color,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="w-full max-w-md bg-surface rounded-2xl border border-border p-6">
        <h2 className="text-xl font-bold text-text mb-4">New Habit</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">Habit Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Read 20 minutes"
              className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text placeholder:text-muted focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-3">Icon</label>
            <div className="flex flex-wrap gap-2">
              {HABIT_ICONS.map((habitIcon) => (
                <button
                  key={habitIcon}
                  type="button"
                  onClick={() => setIcon(habitIcon)}
                  className={clsx(
                    'w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all',
                    icon === habitIcon
                      ? 'bg-primary/20 ring-2 ring-primary'
                      : 'bg-background hover:bg-border'
                  )}
                >
                  {habitIcon}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-3">Color</label>
            <div className="flex flex-wrap gap-2">
              {HABIT_COLORS.map((habitColor) => (
                <button
                  key={habitColor.value}
                  type="button"
                  onClick={() => setColor(habitColor.value)}
                  className={clsx(
                    'w-8 h-8 rounded-full transition-all',
                    color === habitColor.value
                      ? 'ring-2 ring-offset-2 ring-offset-surface scale-110'
                      : 'hover:scale-110'
                  )}
                  style={{ backgroundColor: habitColor.value }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-background border border-border rounded-lg text-text font-medium hover:bg-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            className="flex-1 py-2 bg-gradient-accent text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  )
}