import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { ArrowLeft, Loader2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

const ROOM_ICONS = ['💻', '🏋️', '📚', '🧘', '📵', '🌍', '🎨', '✍️', '💪', '🎯', '🔥', '⚡', '🎮', '🍎', '💤']

const ROOM_COLORS = [
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Yellow', value: '#F59E0B' },
]

export function CreateRoom() {
  const user = useAuthStore((state) => state.user)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState('')
  const [icon, setIcon] = useState('💻')
  const [color, setColor] = useState('#6366F1')
  const [streakGoal, setStreakGoal] = useState(30)
  const [streakMinMembers, setStreakMinMembers] = useState(1)
  const [frequency, setFrequency] = useState<number>(1)
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [createdRoom, setCreatedRoom] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          name,
          description,
          goal,
          icon,
          color,
          streak_goal: streakGoal,
          streak_min_members: streakMinMembers,
          frequency: frequency === 1 ? 'daily' : 'weekly',
          created_by: user?.id,
          is_public: visibility === 'public',
          visibility,
        })
        .select()
        .single()

      if (error) {
        console.error('Room creation error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        })
        throw error
      }

      // Auto-join the creator as a member
      const { error: joinError } = await supabase.from('room_members').insert({
        user_id: user?.id,
        room_id: data.id,
      })

      if (joinError) console.error('Auto-join error:', joinError)

      return data
    },
    onSuccess: (data) => {
      setCreatedRoom(data)
      toast.success('Room created successfully!')
    },
    onError: () => {
      toast.error('Failed to create room. Please try again.')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !goal.trim()) return
    createMutation.mutate()
  }

  const handleCopyCode = () => {
    if (createdRoom?.room_code) {
      navigator.clipboard.writeText(createdRoom.room_code)
      setCopied(true)
      toast.success('Room code copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // If room was created, show the room code
  if (createdRoom) {
    return (
      <div className="max-w-2xl mx-auto pb-20 md:pb-0">
        <Link
          to="/rooms"
          className="inline-flex items-center gap-2 text-muted hover:text-text transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Rooms
        </Link>

        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="p-8 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-4xl mx-auto mb-6">
              {createdRoom.icon}
            </div>

            <h1 className="text-3xl font-bold text-text mb-2">{createdRoom.name}</h1>
            <p className="text-muted mb-8">
              {createdRoom.description || createdRoom.goal}
            </p>

            <div className="bg-background rounded-xl p-6 border border-border mb-6">
              <p className="text-sm text-muted uppercase tracking-wide mb-3">Room Code</p>
              <div className="flex items-center justify-center gap-4">
                <span className="text-5xl font-bold font-mono text-primary tracking-wider">
                  {createdRoom.room_code}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  title="Copy room code"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-success" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <p className="text-sm text-muted mb-6">
              Share this code with people you want to invite.
              {visibility === 'private' && (
                <span className="block mt-2 text-accent">
                  This is a private room. People who join will need your approval.
                </span>
              )}
            </p>

            <Link
              to={`/rooms/${createdRoom.id}`}
              className="inline-flex items-center justify-center w-full py-3 bg-gradient-accent text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Go to Room
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 md:pb-0">
      <Link
        to="/rooms"
        className="inline-flex items-center gap-2 text-muted hover:text-text transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Rooms
      </Link>

      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-bold text-text">Create a Room</h1>
          <p className="text-muted mt-1">
            Start a new habit room and invite others to join your streak
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Icon Picker */}
          <div>
            <label className="block text-sm font-medium text-text mb-3">Room Icon</label>
            <div className="flex flex-wrap gap-2">
              {ROOM_ICONS.map((roomIcon) => (
                <button
                  key={roomIcon}
                  type="button"
                  onClick={() => setIcon(roomIcon)}
                  className={`
                    w-12 h-12 rounded-xl text-xl flex items-center justify-center transition-all
                    ${
                      icon === roomIcon
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface scale-110'
                        : 'bg-background hover:bg-border'
                    }
                  `}
                >
                  {roomIcon}
                </button>
              ))}
            </div>
          </div>

          {/* Color Picker */}
          <div>
            <label className="block text-sm font-medium text-text mb-3">Room Color</label>
            <div className="flex flex-wrap gap-2">
              {ROOM_COLORS.map((roomColor) => (
                <button
                  key={roomColor.value}
                  type="button"
                  onClick={() => setColor(roomColor.value)}
                  className={`
                    w-10 h-10 rounded-full transition-all
                    ${
                      color === roomColor.value
                        ? 'ring-2 ring-offset-2 ring-offset-surface scale-110'
                        : 'hover:scale-110'
                    }
                  `}
                  style={{ backgroundColor: roomColor.value }}
                  title={roomColor.name}
                />
              ))}
            </div>
          </div>

          {/* Room Name */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">Room Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="100 Days of Code"
              required
              maxLength={50}
              className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Description <span className="text-muted">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Learn to code by committing to code every single day..."
              rows={3}
              maxLength={200}
              className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors resize-none"
            />
          </div>

          {/* Goal */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">Daily Goal</label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Code for at least 1 hour"
              required
              maxLength={100}
              className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text placeholder:text-muted focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Streak Goal */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Streak Goal (days)
            </label>
            <input
              type="number"
              value={streakGoal}
              onChange={(e) => setStreakGoal(parseInt(e.target.value) || 30)}
              min={7}
              max={365}
              className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-primary transition-colors"
            />
            <p className="text-xs text-muted mt-2">
              How many days should the room streak last? Popular: 21, 30, 66, 100
            </p>
          </div>

          {/* Streak Min Members (Quorum) — percentage */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Members needed for room streak (%)
            </label>
            <input
              type="number"
              value={streakMinMembers}
              onChange={(e) => setStreakMinMembers(parseInt(e.target.value) || 50)}
              min={10}
              max={100}
              step={10}
              className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-primary transition-colors"
            />
            <p className="text-xs text-muted mt-2">
              Percentage of members that must check in to maintain streak (e.g., 50%).
            </p>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">Check-in Frequency (days)</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(parseInt(e.target.value))}
              className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text focus:outline-none focus:border-primary transition-colors"
            >
              {Array.from({ length: 14 }, (_, i) => i + 1).map((days) => (
                <option key={days} value={days}>
                  {days} {days === 1 ? 'day' : 'days'}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-2">
              How often members should check in (1–14 days).
            </p>
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-text mb-3">Room Visibility</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-background transition-colors data-[state=checked]:border-primary">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                  className="w-4 h-4 accent-primary"
                />
                <div className="flex-1">
                  <span className="text-text font-medium">Public Room</span>
                  <p className="text-xs text-muted">Anyone with the room code can join immediately</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-background transition-colors data-[state=checked]:border-primary">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                  className="w-4 h-4 accent-primary"
                />
                <div className="flex-1">
                  <span className="text-text font-medium">Private Room</span>
                  <p className="text-xs text-muted">People need your approval to join</p>
                </div>
              </label>
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 bg-background rounded-xl border border-border">
            <p className="text-xs text-muted uppercase tracking-wide mb-3">Preview</p>
            <div className="flex items-center gap-4">
              <div
                className="flex items-center justify-center w-16 h-16 rounded-xl text-3xl"
                style={{ backgroundColor: `${color}20` }}
              >
                {icon}
              </div>
              <div>
                <h3 className="font-semibold text-text">{name || 'Room Name'}</h3>
                <p className="text-sm text-muted line-clamp-1">{goal || 'Your daily goal'}</p>
                <span className="text-xs text-muted mt-1 block">
                  {visibility === 'private' ? '🔒 Private' : '🌐 Public'}
                </span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <Link
              to="/rooms"
              className="flex-1 py-3 text-center font-medium text-muted bg-background border border-border rounded-lg hover:text-text transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={createMutation.isPending || !name.trim() || !goal.trim()}
              className="flex-1 py-3 bg-gradient-accent text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-5 h-5 animate-spin" />}
              Create Room
            </button>
          </div>

          {createMutation.error && (
            <p className="text-danger text-sm text-center">
              Failed to create room. Please try again.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}