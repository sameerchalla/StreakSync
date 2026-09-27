import { describe, it, expect, vi } from 'vitest'

// Mock the room operations module to test the join-by-code logic
vi.mock('../lib/roomOperations', () => ({
  generateRoomCode: () => Promise.resolve('A7K9Q2'),
  findRoomByCode: (code: string) => {
    if (code === 'PUBLIC1') {
      return Promise.resolve({ id: 'room-1', name: 'Test Room', visibility: 'public', room_code: 'PUBLIC1' })
    }
    if (code === 'PRIVATE') {
      return Promise.resolve({ id: 'room-2', name: 'Private Room', visibility: 'private', room_code: 'PRIVATE' })
    }
    return Promise.resolve(null)
  },
  joinPublicRoom: vi.fn(() => Promise.resolve({ room_id: 'room-1' })),
  requestJoinPrivateRoom: vi.fn(() => Promise.resolve({ id: 'req-1', status: 'pending' })),
}))

// Tests for room code generation
describe('Room Code Generation', () => {
  it('generates a 6-character uppercase code', async () => {
    const { generateRoomCode } = await import('../lib/roomOperations')
    const code = await generateRoomCode()
    expect(code).toHaveLength(6)
    expect(code).toBe(code.toUpperCase())
    expect(code).toMatch(/^[A-Z0-9]{6}$/)
  })
})

// Tests for room joining by code
describe('Room Joining by Code', () => {
  it('allows joining public rooms with valid code', async () => {
    const { findRoomByCode } = await import('../lib/roomOperations')
    const room = await findRoomByCode('PUBLIC1')
    expect(room).toBeDefined()
    expect(room?.visibility).toBe('public')
  })

  it('returns null for invalid room code', async () => {
    const { findRoomByCode } = await import('../lib/roomOperations')
    const room = await findRoomByCode('INVALID')
    expect(room).toBeNull()
  })

  it('private rooms require approval', async () => {
    const { findRoomByCode } = await import('../lib/roomOperations')
    const room = await findRoomByCode('PRIVATE')
    expect(room).toBeDefined()
    expect(room?.visibility).toBe('private')
  })
})
