import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import {
  Search,
  Plus,
  Users,

  Loader2,
  Lock,
  KeyRound,
  Check,
  XCircle,
  AlertCircle,
} from 'lucide-react'
import { getStreakFireEmoji, calculateStreak } from '../lib/streakUtils'
import { findRoomByCode, joinPublicRoom, requestJoinPrivateRoom, getMyJoinRequest } from '../lib/roomOperations'
import { toast } from 'sonner'

// Helper to format date as yyyy-MM-dd (local timezone)
const formatYmd = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type JoinCodeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; room: any; isPrivate: boolean }
  | { status: 'pending'; room: any }
  | { status: 'already_member'; room: any }
  | { status: 'already_pending'; room: any }
  | { status: 'rejected'; room?: any }
  | { status: 'error'; message: string }

export function Rooms() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeView, setActiveView] = useState<'public' | 'my'>('public')
  const [joinCode, setJoinCode] = useState('')
  const [joinCodeState, setJoinCodeState] = useState<JoinCodeState>({ status: 'idle' })

  // Fetch all public rooms
  const { data: rooms, isLoading, error: roomsError } = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms_with_stats')
        .select('*')
        .eq('visibility', 'public')
        .order('current_room_streak', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })

  // Fetch user's joined rooms with stats
  const { data: myRooms = [] } = useQuery({
    queryKey: ['my-rooms', user?.id],
    queryFn: async () => {
      if (!user) return []
      // Get membership room IDs first
      const { data: memberships, error: memErr } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
      if (memErr) {
        console.error('My rooms membership error:', memErr)
        return []
      }
      const ids = memberships?.map((m) => m.room_id) || []
      if (ids.length === 0) return []
      const { data, error } = await supabase
        .from('rooms_with_stats')
        .select('*')
        .in('id', ids)
        .order('current_room_streak', { ascending: false })
      if (error) {
        console.error('My rooms stats error:', error)
        return []
      }
      return data || []
    },
    enabled: !!user,
    staleTime: 1000 * 60,
  })

  // Derive joined room IDs for card flags
  const joinedRoomIds = myRooms.map((r: any) => r.id)

  // Filter public rooms by search
  const filteredPublic = (rooms || []).filter((room: any) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        room.name.toLowerCase().includes(q) ||
        (room.goal && room.goal.toLowerCase().includes(q)) ||
        (room.description && room.description.toLowerCase().includes(q))
      )
    }
    return true
  })

  // Fetch user's personal check-in counts per room
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

  // Join room from card mutation
  const cardJoinMutation = useMutation({
    mutationFn: async (targetRoom: any) => {
      if (!user) throw new Error('Not authenticated')
      if (targetRoom.visibility === 'private' || targetRoom.is_public === false) {
        await requestJoinPrivateRoom(targetRoom.id, user.id)
        return { isPrivate: true, roomName: targetRoom.name }
      } else {
        await joinPublicRoom(targetRoom.id, user.id)
        return { isPrivate: false, roomName: targetRoom.name }
      }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['user-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['joined-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['user-room-streaks'] })
      if (res.isPrivate) {
        toast.success(`Join request sent for ${res.roomName}. Waiting for owner approval.`)
      } else {
        toast.success(`Joined ${res.roomName}!`)
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to join room')
    },
  })

  // Join room by code mutation
  const joinByCodeMutation = useMutation({
    mutationFn: async () => {
      if (!joinCode.trim() || !user) return null

      const code = joinCode.trim().toUpperCase()
      const room = await findRoomByCode(code)

      if (!room) {
        throw new Error('Room not found')
      }

      // Check if already a member
      const { data: existingMember } = await supabase
        .from('room_members')
        .select('id')
        .eq('room_id', room.id)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()

      if (existingMember) {
        return { status: 'already_member' as const, room }
      }

      // Check existing join request
      const existingRequest = await getMyJoinRequest(room.id, user.id)
      if (existingRequest) {
        if (existingRequest.status === 'pending') {
          return { status: 'already_pending' as const, room }
        }
        if (existingRequest.status === 'rejected') {
          return { status: 'rejected' as const, room }
        }
        if (existingRequest.status === 'accepted') {
          return { status: 'already_member' as const, room }
        }
      }

      if (room.visibility === 'public') {
        await joinPublicRoom(room.id, user.id)
        return { status: 'success' as const, room, isPrivate: false }
      } else {
        await requestJoinPrivateRoom(room.id, user.id)
        return { status: 'pending' as const, room }
      }
    },
    onSuccess: (result) => {
      if (!result) return
      setJoinCodeState(result)
      if (result.status === 'success') {
        toast.success(`Joined ${result.room.name}!`)
        queryClient.invalidateQueries({ queryKey: ['rooms'] })
        queryClient.invalidateQueries({ queryKey: ['user-rooms'] })
        queryClient.invalidateQueries({ queryKey: ['joined-rooms'] })
        queryClient.invalidateQueries({ queryKey: ['user-room-streaks'] })
      } else if (result.status === 'pending') {
        toast.success('Join request sent. Waiting for owner approval.')
      } else if (result.status === 'already_member') {
        toast.info(`You're already a member of ${result.room.name}`)
      } else if (result.status === 'already_pending') {
        toast.info('Your join request is already pending')
      } else if (result.status === 'rejected') {
        toast.error('Your previous request was rejected. You may submit another request.')
      }
      setJoinCode('')
    },
    onError: (error: any) => {
      setJoinCodeState({ status: 'error', message: error.message || 'Failed to join room' })
    },
  })

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault()
    if (!joinCode.trim()) return
    setJoinCodeState({ status: 'loading' })
    joinByCodeMutation.mutate()
  }

  // Reset state when input changes
  const handleJoinCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setJoinCode(e.target.value)
    if (joinCodeState.status !== 'idle' && joinCodeState.status !== 'loading') {
      setJoinCodeState({ status: 'idle' })
    }
  }

  // Filter public rooms by search (remove old filter logic, use filteredPublic)
  // (filteredPublic defined above)

  // Render join code status message
  const renderJoinCodeStatus = () => {
    switch (joinCodeState.status) {
      case 'success':
        return (
          <div className="bg-success/10 border border-success/30 rounded-xl p-4 mt-4">
            <div className="flex items-center gap-3 text-success">
              <Check className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-medium">Successfully joined!</p>
                <p className="text-sm text-muted">
                  {joinCodeState.isPrivate ? 'Welcome to the room!' : 'You are now a member.'}
                </p>
                <Link
                  to={`/rooms/${joinCodeState.room.id}`}
                  className="text-sm text-primary hover:underline mt-2 inline-block"
                >
                  Go to room
                </Link>
              </div>
            </div>
          </div>
        )
      case 'pending':
        return (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mt-4">
            <div className="flex items-center gap-3 text-primary">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-medium">Join request sent</p>
                <p className="text-sm text-muted">
                  The room owner needs to approve your request before you can access the room.
                </p>
                <Link
                  to={`/rooms/${joinCodeState.room.id}`}
                  className="text-sm text-primary hover:underline mt-2 inline-block"
                >
                  View request status
                </Link>
              </div>
            </div>
          </div>
        )
      case 'already_member':
        return (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mt-4">
            <div className="flex items-center gap-3 text-primary">
              <Check className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-medium">You're already a member</p>
                <p className="text-sm text-muted">
                  You already have access to this room.
                </p>
                <Link
                  to={`/rooms/${joinCodeState.room.id}`}
                  className="text-sm text-primary hover:underline mt-2 inline-block"
                >
                  Go to room
                </Link>
              </div>
            </div>
          </div>
        )
      case 'already_pending':
        return (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mt-4">
            <div className="flex items-center gap-3 text-warning">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-medium">Request already pending</p>
                <p className="text-sm text-muted">
                  Your join request is still being reviewed by the room owner.
                </p>
                <Link
                  to={`/rooms/${joinCodeState.room.id}`}
                  className="text-sm text-primary hover:underline mt-2 inline-block"
                >
                  View request status
                </Link>
              </div>
            </div>
          </div>
        )
      case 'rejected':
        return (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 mt-4">
            <div className="flex items-center gap-3 text-danger">
              <XCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-medium">Previous request rejected</p>
                <p className="text-sm text-muted">
                  Your previous join request was rejected. You may submit another request.
                </p>
              </div>
            </div>
          </div>
        )
      case 'error':
        return (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 mt-4">
            <div className="flex items-center gap-3 text-danger">
              <XCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">{joinCodeState.message || "We couldn't find a room with that code."}</p>
            </div>
          </div>
        )
      default:
        return null
    }
  }

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

      {/* Join by Code Section */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-text">Join by Room Code</h2>
        </div>
        <p className="text-sm text-muted mb-4">
          Have a room code? Enter it below to join or request access.
        </p>
        <form onSubmit={handleJoinByCode} className="flex gap-3 max-w-md">
          <div className="relative flex-1">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              placeholder="Enter room code (e.g., A7K9Q2)"
              value={joinCode}
              onChange={handleJoinCodeChange}
              className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-lg text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors uppercase font-mono"
              maxLength={6}
              disabled={joinCodeState.status === 'loading'}
            />
          </div>
          <button
            type="submit"
            disabled={joinByCodeMutation.isPending || !joinCode.trim()}
            className="px-6 py-3 bg-gradient-accent text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {joinByCodeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Join Room'
            )}
          </button>
        </form>
        {renderJoinCodeStatus()}
      </div>

      {/* Search */}
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
      </div>

      {/* Error message */}
      {roomsError && !isLoading && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4">
          <p className="text-sm text-danger">
            Failed to load rooms. {roomsError.message}
          </p>
        </div>
      )}

      {/* View Toggle Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setActiveView('public')}
          className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
            activeView === 'public' ? 'bg-primary text-white' : 'bg-surface border border-border text-muted hover:text-text'
          }`}
        >
          Public Rooms
        </button>
        <button
          onClick={() => setActiveView('my')}
          className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
            activeView === 'my' ? 'bg-primary text-white' : 'bg-surface border border-border text-muted hover:text-text'
          }`}
        >
          My Rooms
        </button>
      </div>

      {/* Active View Content */}
      {activeView === 'public' ? (
        <section>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
          ) : filteredPublic.length === 0 ? (
            <div className="bg-surface rounded-xl p-12 border border-border text-center"><Users className="w-12 h-12 text-muted mx-auto mb-4" /><h3 className="text-lg font-semibold text-text mb-2">No public rooms found</h3><p className="text-muted">Try a different search term.</p></div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPublic.map((room: any) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onJoin={() => cardJoinMutation.mutate(room)}
                  isJoining={cardJoinMutation.isPending}
                  hasJoined={joinedRoomIds.includes(room.id)}
                  userStreak={userStreaks[room.id] || 0}
                  roomStreak={calculateRoomStreak(room.id)}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section>
          {myRooms.length === 0 ? (
            <div className="bg-surface rounded-xl p-12 border border-border text-center"><Users className="w-12 h-12 text-muted mx-auto mb-4" /><h3 className="text-lg font-semibold text-text mb-2">You haven't joined any rooms yet</h3><p className="text-muted">Browse public rooms to find your community.</p></div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myRooms.map((room: any) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onJoin={() => cardJoinMutation.mutate(room)}
                  isJoining={cardJoinMutation.isPending}
                  hasJoined={true}
                  userStreak={userStreaks[room.id] || 0}
                  roomStreak={calculateRoomStreak(room.id)}
                />
              ))}
            </div>
          )}
        </section>
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
  const isPrivate = room.visibility === 'private' || room.is_public === false

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
              {isPrivate && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-warning/20 text-warning text-xs rounded-full">
                  <Lock className="w-3 h-3" />
                  Private
                </span>
              )}
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
            ) : isPrivate ? (
              'Request to Join'
            ) : (
              'Join Room'
            )}
          </button>
        )}
      </div>
    </div>
  )
}
