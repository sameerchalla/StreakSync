export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  timezone: string
  current_streak: number
  longest_streak: number
  total_checkins: number
  level: number
  xp: number
  created_at: string
}

export interface Room {
  id: string
  name: string
  description: string | null
  icon: string
  color: string
  goal: string
  frequency: 'daily' | 'weekly' | 'custom'
  check_in_time: string | null
  streak_goal: number
  is_public: boolean
  created_by: string
  current_room_streak: number
  max_room_streak: number
  streak_min_members: number  // quorum for room streak (default 1)
  created_at: string
  member_count?: number
  user_streak?: number
  has_checked_in?: boolean
}

export interface RoomMember {
  id: string
  user_id: string
  room_id: string
  joined_at: string
  is_active: boolean
  profile?: Profile
}

export interface CheckIn {
  id: string
  user_id: string
  room_id: string
  check_in_date: string
  completed: boolean
  note: string | null
  created_at: string
}

export interface Habit {
  id: string
  user_id: string
  name: string
  icon: string
  color: string
  frequency: 'daily' | 'weekly' | 'custom'
  created_at: string
  current_streak?: number
  completed_today?: boolean
}

export interface HabitLog {
  id: string
  habit_id: string
  user_id: string
  completed_date: string
  completed: boolean
}

export interface LeaderboardEntry {
  rank: number
  profile: Profile
  streak: number
  room_name?: string
}

export interface DailyStats {
  date: string
  checkins_count: number
  rooms_active: number
}

export interface RoomLeaderboardEntry {
  rank: number
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  streak: number
  total_checkins: number
}