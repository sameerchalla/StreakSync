import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import {
  Search,
  Plus,
  Users,
  Filter,
  Loader2,
  Lock,
} from 'lucide-react'
import { getStreakFireEmoji, calculateStreak } from '../lib/streakUtils'
import { clsx } from 'clsx'

// Helper to format date as yyyy-MM-dd (local timezone)
const formatYmd = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function Rooms() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [showMyRooms, setShowMyRooms] = useState(false)

  // Fetch all public rooms (using view that includes member_count)
  const { data: rooms, isLoading, error: roomsError } = useQuery({
    queryKey: ['rooms', showMyRooms],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms_with_stats')
        .select('*')
        .eq('is_public', true)
        .order('current_room_streak', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  // Fetch user's joined room IDs
  const { data: joinedRoomIds = [] } = useQuery({
    queryKey: ['joined-rooms', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (error) {
        console.error('Joined rooms query error:', error)
        return []
      }
      return data?.map((r) => r.room_id) || []
    },
    enabled: !!user,
    staleTime: 1000 * 60, // Cache for 1 minute to reduce redundant requests
  })

  // Fetch user's personal check-in counts per room (for "Your streak" badge)
  const { data: userStreaks = {} } = useQuery({
    queryKey: ['user-room-streaks', user?.id],
    queryFn: async () => {
      if (!user) return {}
      const { data, error } = await supabase
        .from('check_ins')
        .select('room_id, check_in_date')
        .eq('user_id', user.id)
        .eq('completed', true)

      if (error) {
        console.error('User streaks query error:', error)
        return {}
      }

      // For each room, compute current streak
      const result: Record<string, number> = {}
      const byRoom: Record<string, Set<string>> = {}
      ;(data || []).forEach((c: any) => {
        if (!byRoom[c.room_id]) byRoom[c.room_id] = new Set()
        byRoom[c.room_id].add(c.check_in_date)
      })

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      Object.entries(byRoom).forEach(([roomId, dates]) => {
        let streak = 0
        let cursor = new Date(today)
        if (!dates.has(formatYmd(cursor))) {
          cursor.setDate(cursor.getDate() - 1)
        }
        while (dates.has(formatYmd(cursor))) {
          streak++
          cursor.setDate(cursor.getDate() - 1)
        }
        result[roomId] = streak
      })

      return result
    },
    enabled: !!user,
  })

  // Fetch room check-ins for room streak calculation
  const { data: roomCheckIns = {} } = useQuery({
    queryKey: ['room-checkins-for-streak'],
    queryFn: async () => {
      if (!user) return {}
      const { data, error } = await supabase
        .from('check_ins')
        .select('room_id, check_in_date')

      if (error) {
        console.error('Room checkins query error:', error)
        return {}
      }

      const result: Record<string, string[]> = {}
      ;(data || []).forEach((c: any) => {
        if (!result[c.room_id]) result[c.room_id] = []
        result[c.room_id].push(c.check_in_date)
      })
      return result
    },
    enabled: !!user,
  })

  // Helper: calculate room current streak from check-in dates
  const calculateRoomStreak = (roomId: string): number => {
    const dates = roomCheckIns[roomId] || []
    if (!dates.length) return 0
    return calculateStreak(dates)
  }

  // Join room mutation
  const joinMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const { error } = await supabase.from('room_members').insert({
        user_id: user?.id,
        room_id: roomId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['user-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['joined-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['user-room-streaks'] })
    },
  })

  // Filter rooms
  const filteredRooms = (rooms || [])
    .filter((room: any) => {
      if (showMyRooms && !joinedRoomIds.includes(room.id)) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          room.name.toLowerCase().includes(query) ||
          (room.goal && room.goal.toLowerCase().includes(query)) ||
          (room.description && room.description.toLowerCase().includes(query))
        )
      }
      return true
    })

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Habit Rooms</h1>
          <p className="text-muted">Find your community and build streaks together</p>
        </div>
        <Link
          to="/rooms/create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Room
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type="text"
            placeholder="Search rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-lg text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <button
          onClick={() => setShowMyRooms(!showMyRooms)}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors',
            showMyRooms
              ? 'bg-primary text-white'
              : 'bg-surface border border-border text-muted hover:text-text'
          )}
        >
          <Filter className="w-4 h-4" />
          My Rooms
        </button>
      </div>

      {/* Error message */}
      {roomsError && !isLoading && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4">
          <p className="text-sm text-danger">
            Failed to load rooms. {roomsError.message}
          </p>
        </div>
      )}

      {/* Rooms Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="bg-surface rounded-xl p-12 border border-border text-center">
          <Users className="w-12 h-12 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text mb-2">
            {showMyRooms ? "You haven't joined any rooms yet" : 'No rooms found'}
          </h3>
          <p className="text-muted mb-4">
            {showMyRooms
              ? 'Browse public rooms to find your community'
              : 'Try a different search term'}
          </p>
          {showMyRooms && (
            <button
              onClick={() => setShowMyRooms(false)}
              className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Browse All Rooms
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRooms.map((room: any) => (
            <RoomCard
              key={room.id}
              room={room}
              onJoin={() => joinMutation.mutate(room.id)}
              isJoining={joinMutation.isPending}
              hasJoined={joinedRoomIds.includes(room.id)}
              userStreak={userStreaks[room.id] || 0}
              roomStreak={calculateRoomStreak(room.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RoomCard({
  room,
  onJoin,
  isJoining,
  hasJoined,
  userStreak,
  roomStreak,
}: {
  room: any
  onJoin: () => void
  isJoining: boolean
  hasJoined: boolean
  userStreak: number
  roomStreak: number
}) {
  const progress = Math.min((roomStreak / room.streak_goal) * 100, 100)

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden hover:border-primary/50 transition-all group">
      {/* Room Header */}
      <div
        className="h-2"
        style={{
          background: `linear-gradient(90deg, ${room.color || '#6366F1'} 0%, ${
            room.color || '#6366F1'
          }88 100%)`,
        }}
      />

      <div className="p-5">
        {/* Room Icon and Title */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl text-2xl"
            style={{ backgroundColor: `${room.color || '#6366F1'}20` }}
          >
            {room.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-text truncate">{room.name}</h3>
              {!room.is_public && <Lock className="w-4 h-4 text-muted shrink-0" />}
            </div>
            <p className="text-sm text-muted line-clamp-2 mt-1">
              {room.description || room.goal}
            </p>
          </div>
        </div>

        {/* Streak Info */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{getStreakFireEmoji(roomStreak)}</span>
              <span className="font-mono font-bold text-text">
                {roomStreak}
              </span>
              <span className="text-muted">day streak</span>
            </div>
            <span className="text-xs text-muted">
              {room.member_count || 0} members
            </span>
          </div>

          {/* Progress Bar */}
          <div className="relative h-2 bg-border rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: room.color || '#F97316',
              }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-muted">
            <span>Goal: {room.streak_goal} days</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* User's Streak (if joined) */}
        {hasJoined && userStreak > 0 && (
          <div className="flex items-center gap-2 mb-4 p-2 bg-background rounded-lg">
            <span>Your streak:</span>
            <span className="font-mono font-bold text-accent">
              {getStreakFireEmoji(userStreak)} {userStreak} days
            </span>
          </div>
        )}

        {/* Action Button */}
        <Link
          to={`/rooms/${room.id}`}
          className="block w-full py-2 text-center text-sm font-medium bg-background text-text rounded-lg hover:bg-border transition-colors"
        >
          {hasJoined ? 'View Room' : 'View Details'}
        </Link>

        {!hasJoined && (
          <button
            onClick={onJoin}
            disabled={isJoining}
            className="w-full mt-2 py-2 text-sm font-medium bg-gradient-accent text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isJoining ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              `Join Room`
            )}
          </button>
        )}
      </div>
    </div>
  )
}