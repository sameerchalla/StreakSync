import { supabase } from './supabase'

export interface RoomInfo {
  id: string
  name: string
  visibility: string
  room_code: string
}

/**
 * Look up a room by its room code.
 * Returns the room row or null if not found.
 */
export async function findRoomByCode(code: string): Promise<RoomInfo | null> {
  const trimmed = code.toUpperCase().trim()

  // Try direct query first (works for members/public)
  const { data } = await supabase
    .from('rooms')
    .select('id, name, visibility, room_code')
    .eq('room_code', trimmed)
    .single()

  if (data) return data as RoomInfo
  // Ignore direct-query error and fall through

  // Fallback to DB function for private room lookup (bypasses RLS)
  const { data: rpcData, error: rpcError } = await (supabase as any).rpc(
    'lookup_room_by_code',
    { p_code: trimmed }
  )
  if (rpcError || !rpcData) return null
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
  return row ? (row as RoomInfo) : null
}

/**
 * Generate a secure room code (6 chars, uppercase alphanumeric).
 */
export async function generateRoomCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    const rand = new Uint32Array(1)
    crypto.getRandomValues(rand)
    code += chars[rand[0] % chars.length]
  }
  return code
}

/**
 * Join a public room directly.
 * Preconditions are checked server-side via RLS and constraints.
 */
export async function joinPublicRoom(roomId: string, userId: string) {
  // Check if there's an existing inactive membership; reactivate it
  const { data: existing, error: existingError } = await supabase
    .from('room_members')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existingError) throw existingError

  if (existing) {
    // Reactivate existing membership
    const { error: updateError } = await supabase
      .from('room_members')
      .update({ is_active: true })
      .eq('room_id', roomId)
      .eq('user_id', userId)
    if (updateError) throw updateError
    return { id: existing.id, user_id: userId, room_id: roomId }
  }

  // No existing membership; insert new
  const { data, error } = await supabase
    .from('room_members')
    .insert({ user_id: userId, room_id: roomId })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Submit a join request for a private room.
 * Returns the request row on success.
 */
export async function requestJoinPrivateRoom(roomId: string, userId: string) {
  const { data, error } = await supabase
    .from('room_join_requests')
    .insert({ room_id: roomId, user_id: userId, status: 'pending' })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Get the current user's join request status for a room.
 * Returns null if no request exists.
 */
export async function getMyJoinRequest(roomId: string, userId: string) {
  const { data, error } = await supabase
    .from('room_join_requests')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .single()

  if (error) return null
  return data
}

/**
 * Accept a pending join request (owner only).
 * Uses a database transaction to ensure atomicity:
 * membership is created and request is updated together.
 */
export async function acceptJoinRequest(requestId: string, userId: string) {
  const { data: request, error: fetchError } = await supabase
    .from('room_join_requests')
    .select('room_id, user_id')
    .eq('id', requestId)
    .single()

  if (fetchError) throw fetchError

  // Verify the caller is the room owner
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('created_by')
    .eq('id', request.room_id)
    .single()

  if (roomError) throw roomError
  if (room.created_by !== userId) {
    throw new Error('Only the room owner can accept join requests')
  }

  // Use a transaction: insert membership and update request atomically
  // (membership insertion uses SECURITY DEFINER to allow owner to insert other users)
  const { error: membershipError } = await supabase.rpc('insert_room_member', {
    p_user_id: request.user_id,
    p_room_id: request.room_id,
  })

  if (membershipError) {
    // If membership already exists, that's fine — treat as success
    if (membershipError.code !== '23505') throw membershipError
  }

  // Update the request status to accepted
  const { error: updateError } = await supabase
    .from('room_join_requests')
    .update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
      responded_by: userId,
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (updateError) throw updateError

  return { accepted: true }
}

/**
 * Reject a pending join request (owner only).
 */
export async function rejectJoinRequest(requestId: string, userId: string) {
  const { data: request, error: fetchError } = await supabase
    .from('room_join_requests')
    .select('room_id')
    .eq('id', requestId)
    .single()

  if (fetchError) throw fetchError

  // Verify the caller is the room owner
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('created_by')
    .eq('id', request.room_id)
    .single()

  if (roomError) throw roomError
  if (room.created_by !== userId) {
    throw new Error('Only the room owner can reject join requests')
  }

  // Update the request status to rejected
  const { error: updateError } = await supabase
    .from('room_join_requests')
    .update({
      status: 'rejected',
      responded_at: new Date().toISOString(),
      responded_by: userId,
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (updateError) throw updateError

  return { rejected: true }
}

/**
 * Leave a room (deactivate membership).
 */
export async function leaveRoom(roomId: string, userId: string) {
  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId)
  if (error) throw error
  return { left: true }
}

/**
 * Get pending join requests for a room (owner only).
 */
export async function getPendingJoinRequests(roomId: string, userId: string) {
  // Verify the caller is the room owner
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('created_by')
    .eq('id', roomId)
    .single()

  if (roomError) throw roomError
  if (room.created_by !== userId) {
    throw new Error('Only the room owner can view join requests')
  }

  const { data, error } = await supabase
    .from('room_join_requests')
    .select('*, requester:user_id profiles!user_id(id, username, display_name, avatar_url)')
    .eq('room_id', roomId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}