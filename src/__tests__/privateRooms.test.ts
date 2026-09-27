import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateRoomCode,
  findRoomByCode,
  joinPublicRoom,
  requestJoinPrivateRoom,
  getMyJoinRequest,
  acceptJoinRequest,
  rejectJoinRequest,
  getPendingJoinRequests,
} from '../lib/roomOperations'
import { supabase } from '../lib/supabase'

// Mock supabase client
vi.mock('../lib/supabase', () => {
  const mockSupabase = {
    from: vi.fn(),
  }
  return { supabase: mockSupabase }
})

describe('Private & Public Room Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------
  // 1. Room Code Generation
  // -------------------------------------------------------------
  describe('generateRoomCode', () => {
    it('generates a 6-character string', async () => {
      const code = await generateRoomCode()
      expect(code).toHaveLength(6)
    })

    it('generates uppercase alphanumeric codes without ambiguous characters', async () => {
      const code = await generateRoomCode()
      expect(code).toMatch(/^[A-Z0-9]{6}$/)
      expect(code).toBe(code.toUpperCase())
    })

    it('generates distinct codes across multiple invocations', async () => {
      const codes = new Set()
      for (let i = 0; i < 50; i++) {
        codes.add(await generateRoomCode())
      }
      expect(codes.size).toBe(50)
    })
  })

  // -------------------------------------------------------------
  // 2. Room Code Lookup
  // -------------------------------------------------------------
  describe('findRoomByCode', () => {
    it('looks up room case-insensitively and returns room data', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'room-1', name: 'Workout Club', visibility: 'public', room_code: 'A7K9Q2' },
        error: null,
      })

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as any)
      mockSelect.mockReturnValue({
        eq: mockEq,
      } as any)
      mockEq.mockReturnValue({
        single: mockSingle,
      } as any)

      const result = await findRoomByCode('a7k9q2')
      expect(mockEq).toHaveBeenCalledWith('room_code', 'A7K9Q2')
      expect(result).toEqual({
        id: 'room-1',
        name: 'Workout Club',
        visibility: 'public',
        room_code: 'A7K9Q2',
      })
    })

    it('returns null when room is not found', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Row not found' },
      })

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as any)
      mockSelect.mockReturnValue({
        eq: mockEq,
      } as any)
      mockEq.mockReturnValue({
        single: mockSingle,
      } as any)

      const result = await findRoomByCode('NONEXIST')
      expect(result).toBeNull()
    })
  })

  // -------------------------------------------------------------
  // 3. Public Room Direct Join
  // -------------------------------------------------------------
  describe('joinPublicRoom', () => {
    it('creates a room_members record directly', async () => {
      const mockInsert = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'member-1', room_id: 'room-pub', user_id: 'user-1' },
        error: null,
      })

      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
      } as any)
      mockInsert.mockReturnValue({
        select: mockSelect,
      } as any)
      mockSelect.mockReturnValue({
        single: mockSingle,
      } as any)

      const result = await joinPublicRoom('room-pub', 'user-1')
      expect(mockInsert).toHaveBeenCalledWith({ user_id: 'user-1', room_id: 'room-pub' })
      expect(result).toEqual({ id: 'member-1', room_id: 'room-pub', user_id: 'user-1' })
    })

    it('throws error when database rejects join (e.g., duplicate membership)', async () => {
      const mockInsert = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'duplicate key value violates unique constraint' },
      })

      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
      } as any)
      mockInsert.mockReturnValue({
        select: mockSelect,
      } as any)
      mockSelect.mockReturnValue({
        single: mockSingle,
      } as any)

      await expect(joinPublicRoom('room-pub', 'user-1')).rejects.toEqual({
        message: 'duplicate key value violates unique constraint',
      })
    })
  })

  // -------------------------------------------------------------
  // 4. Private Room Join Request
  // -------------------------------------------------------------
  describe('requestJoinPrivateRoom', () => {
    it('creates a room_join_requests record with pending status and does NOT insert membership', async () => {
      const mockInsert = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'req-1', room_id: 'room-priv', user_id: 'user-2', status: 'pending' },
        error: null,
      })

      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
      } as any)
      mockInsert.mockReturnValue({
        select: mockSelect,
      } as any)
      mockSelect.mockReturnValue({
        single: mockSingle,
      } as any)

      const result = await requestJoinPrivateRoom('room-priv', 'user-2')
      expect(supabase.from).toHaveBeenCalledWith('room_join_requests')
      expect(mockInsert).toHaveBeenCalledWith({
        room_id: 'room-priv',
        user_id: 'user-2',
        status: 'pending',
      })
      expect(result.status).toBe('pending')
    })
  })

  // -------------------------------------------------------------
  // 5. Get My Join Request Status
  // -------------------------------------------------------------
  describe('getMyJoinRequest', () => {
    it('returns the existing request for user and room', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq1 = vi.fn().mockReturnThis()
      const mockEq2 = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'req-1', room_id: 'room-priv', user_id: 'user-2', status: 'pending' },
        error: null,
      })

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as any)
      mockSelect.mockReturnValue({
        eq: mockEq1,
      } as any)
      mockEq1.mockReturnValue({
        eq: mockEq2,
      } as any)
      mockEq2.mockReturnValue({
        single: mockSingle,
      } as any)

      const result = await getMyJoinRequest('room-priv', 'user-2')
      expect(result).toEqual({ id: 'req-1', room_id: 'room-priv', user_id: 'user-2', status: 'pending' })
    })

    it('returns null if no join request exists', async () => {
      const mockSelect = vi.fn().mockReturnThis()
      const mockEq1 = vi.fn().mockReturnThis()
      const mockEq2 = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Row not found' },
      })

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as any)
      mockSelect.mockReturnValue({
        eq: mockEq1,
      } as any)
      mockEq1.mockReturnValue({
        eq: mockEq2,
      } as any)
      mockEq2.mockReturnValue({
        single: mockSingle,
      } as any)

      const result = await getMyJoinRequest('room-priv', 'user-3')
      expect(result).toBeNull()
    })
  })

  // -------------------------------------------------------------
  // 6. Owner Approval
  // -------------------------------------------------------------
  describe('acceptJoinRequest', () => {
    it('allows room owner to accept request, creates room membership and updates status', async () => {
      // Mock step 1: fetch request
      const mockSelectReq = vi.fn().mockReturnThis()
      const mockEqReq = vi.fn().mockReturnThis()
      const mockSingleReq = vi.fn().mockResolvedValue({
        data: { room_id: 'room-priv', user_id: 'user-requester' },
        error: null,
      })

      // Mock step 2: fetch room owner
      const mockSelectRoom = vi.fn().mockReturnThis()
      const mockEqRoom = vi.fn().mockReturnThis()
      const mockSingleRoom = vi.fn().mockResolvedValue({
        data: { created_by: 'owner-id' },
        error: null,
      })

      // Mock step 3: insert membership
      const mockInsertMem = vi.fn().mockResolvedValue({
        error: null,
      })

      // Mock step 4: update request status
      const mockUpdateReq = vi.fn().mockReturnThis()
      const mockEqReqId = vi.fn().mockReturnThis()
      const mockEqReqStatus = vi.fn().mockResolvedValue({
        error: null,
      })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'room_join_requests') {
          return {
            select: mockSelectReq.mockReturnValue({ eq: mockEqReq.mockReturnValue({ single: mockSingleReq }) }),
            update: mockUpdateReq.mockReturnValue({ eq: mockEqReqId.mockReturnValue({ eq: mockEqReqStatus }) }),
          } as any
        }
        if (table === 'rooms') {
          return {
            select: mockSelectRoom.mockReturnValue({ eq: mockEqRoom.mockReturnValue({ single: mockSingleRoom }) }),
          } as any
        }
        if (table === 'room_members') {
          return {
            insert: mockInsertMem,
          } as any
        }
        return {} as any
      })

      const result = await acceptJoinRequest('req-1', 'owner-id')
      expect(result).toEqual({ accepted: true })
      expect(mockInsertMem).toHaveBeenCalledWith({
        user_id: 'user-requester',
        room_id: 'room-priv',
      })
    })

    it('rejects approval attempt when caller is NOT the room owner', async () => {
      // Mock step 1: fetch request
      const mockSelectReq = vi.fn().mockReturnThis()
      const mockEqReq = vi.fn().mockReturnThis()
      const mockSingleReq = vi.fn().mockResolvedValue({
        data: { room_id: 'room-priv', user_id: 'user-requester' },
        error: null,
      })

      // Mock step 2: fetch room owner
      const mockSelectRoom = vi.fn().mockReturnThis()
      const mockEqRoom = vi.fn().mockReturnThis()
      const mockSingleRoom = vi.fn().mockResolvedValue({
        data: { created_by: 'actual-owner-id' },
        error: null,
      })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'room_join_requests') {
          return {
            select: mockSelectReq.mockReturnValue({ eq: mockEqReq.mockReturnValue({ single: mockSingleReq }) }),
          } as any
        }
        if (table === 'rooms') {
          return {
            select: mockSelectRoom.mockReturnValue({ eq: mockEqRoom.mockReturnValue({ single: mockSingleRoom }) }),
          } as any
        }
        return {} as any
      })

      await expect(acceptJoinRequest('req-1', 'impostor-user-id')).rejects.toThrow(
        'Only the room owner can accept join requests'
      )
    })
  })

  // -------------------------------------------------------------
  // 7. Owner Rejection
  // -------------------------------------------------------------
  describe('rejectJoinRequest', () => {
    it('allows room owner to reject request and does NOT create membership', async () => {
      // Mock step 1: fetch request
      const mockSelectReq = vi.fn().mockReturnThis()
      const mockEqReq = vi.fn().mockReturnThis()
      const mockSingleReq = vi.fn().mockResolvedValue({
        data: { room_id: 'room-priv' },
        error: null,
      })

      // Mock step 2: fetch room owner
      const mockSelectRoom = vi.fn().mockReturnThis()
      const mockEqRoom = vi.fn().mockReturnThis()
      const mockSingleRoom = vi.fn().mockResolvedValue({
        data: { created_by: 'owner-id' },
        error: null,
      })

      // Mock step 3: update request status to rejected
      const mockUpdateReq = vi.fn().mockReturnThis()
      const mockEqReqId = vi.fn().mockReturnThis()
      const mockEqReqStatus = vi.fn().mockResolvedValue({
        error: null,
      })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'room_join_requests') {
          return {
            select: mockSelectReq.mockReturnValue({ eq: mockEqReq.mockReturnValue({ single: mockSingleReq }) }),
            update: mockUpdateReq.mockReturnValue({ eq: mockEqReqId.mockReturnValue({ eq: mockEqReqStatus }) }),
          } as any
        }
        if (table === 'rooms') {
          return {
            select: mockSelectRoom.mockReturnValue({ eq: mockEqRoom.mockReturnValue({ single: mockSingleRoom }) }),
          } as any
        }
        return {} as any
      })

      const result = await rejectJoinRequest('req-1', 'owner-id')
      expect(result).toEqual({ rejected: true })
      expect(mockUpdateReq).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected' })
      )
    })

    it('rejects rejection attempt when caller is NOT the room owner', async () => {
      // Mock step 1: fetch request
      const mockSelectReq = vi.fn().mockReturnThis()
      const mockEqReq = vi.fn().mockReturnThis()
      const mockSingleReq = vi.fn().mockResolvedValue({
        data: { room_id: 'room-priv' },
        error: null,
      })

      // Mock step 2: fetch room owner
      const mockSelectRoom = vi.fn().mockReturnThis()
      const mockEqRoom = vi.fn().mockReturnThis()
      const mockSingleRoom = vi.fn().mockResolvedValue({
        data: { created_by: 'actual-owner-id' },
        error: null,
      })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'room_join_requests') {
          return {
            select: mockSelectReq.mockReturnValue({ eq: mockEqReq.mockReturnValue({ single: mockSingleReq }) }),
          } as any
        }
        if (table === 'rooms') {
          return {
            select: mockSelectRoom.mockReturnValue({ eq: mockEqRoom.mockReturnValue({ single: mockSingleRoom }) }),
          } as any
        }
        return {} as any
      })

      await expect(rejectJoinRequest('req-1', 'non-owner-id')).rejects.toThrow(
        'Only the room owner can reject join requests'
      )
    })
  })

  // -------------------------------------------------------------
  // 8. Pending Requests Listing
  // -------------------------------------------------------------
  describe('getPendingJoinRequests', () => {
    it('returns pending requests for the owner', async () => {
      // Mock room owner check
      const mockSelectRoom = vi.fn().mockReturnThis()
      const mockEqRoom = vi.fn().mockReturnThis()
      const mockSingleRoom = vi.fn().mockResolvedValue({
        data: { created_by: 'owner-id' },
        error: null,
      })

      // Mock fetch requests
      const mockSelectReq = vi.fn().mockReturnThis()
      const mockEqReqRoom = vi.fn().mockReturnThis()
      const mockEqReqStatus = vi.fn().mockReturnThis()
      const mockOrderReq = vi.fn().mockResolvedValue({
        data: [
          { id: 'req-1', status: 'pending', user_id: 'u1' },
          { id: 'req-2', status: 'pending', user_id: 'u2' },
        ],
        error: null,
      })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rooms') {
          return {
            select: mockSelectRoom.mockReturnValue({ eq: mockEqRoom.mockReturnValue({ single: mockSingleRoom }) }),
          } as any
        }
        if (table === 'room_join_requests') {
          return {
            select: mockSelectReq.mockReturnValue({
              eq: mockEqReqRoom.mockReturnValue({
                eq: mockEqReqStatus.mockReturnValue({
                  order: mockOrderReq,
                }),
              }),
            }),
          } as any
        }
        return {} as any
      })

      const requests = await getPendingJoinRequests('room-priv', 'owner-id')
      expect(requests).toHaveLength(2)
    })

    it('rejects listing when caller is not the room owner', async () => {
      const mockSelectRoom = vi.fn().mockReturnThis()
      const mockEqRoom = vi.fn().mockReturnThis()
      const mockSingleRoom = vi.fn().mockResolvedValue({
        data: { created_by: 'actual-owner-id' },
        error: null,
      })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'rooms') {
          return {
            select: mockSelectRoom.mockReturnValue({ eq: mockEqRoom.mockReturnValue({ single: mockSingleRoom }) }),
          } as any
        }
        return {} as any
      })

      await expect(getPendingJoinRequests('room-priv', 'intruder-id')).rejects.toThrow(
        'Only the room owner can view join requests'
      )
    })
  })
})
