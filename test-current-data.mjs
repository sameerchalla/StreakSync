// Check current database state and test data
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://poacwioygsyioyikkzvw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYWN3aW95Z3N5aW95aWtrenZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NDUwNTcsImV4cCI6MjEwNDAyMTA1N30.JdD524tgRHDrZ5EZs3tESt8IYyYxVsaFkpA3BiihMv8'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  console.log('=== CURRENT DATABASE STATE ===\n')

  // Get all profiles
  const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
  console.log('PROFILES:')
  if (profiles && profiles.length > 0) {
    profiles.forEach(p => {
      console.log(`  ${p.username} (id: ${p.id.slice(0, 8)}...): current=${p.current_streak}, longest=${p.longest_streak}, total=${p.total_checkins}, xp=${p.xp}`)
    })
  } else {
    console.log('  (none)')
  }

  // Get all rooms
  const { data: rooms } = await supabase.from('rooms').select('*')
  console.log('\nROOMS:')
  if (rooms && rooms.length > 0) {
    rooms.forEach(r => {
      console.log(`  ${r.name} (id: ${r.id.slice(0, 8)}...): current_streak=${r.current_room_streak}, max_streak=${r.max_room_streak}`)
    })
  } else {
    console.log('  (none)')
  }

  // Get all check-ins
  const { data: checkins } = await supabase.from('check_ins').select('*').order('check_in_date', { ascending: false })
  console.log('\nCHECK-INS:')
  if (checkins && checkins.length > 0) {
    checkins.forEach(c => {
      console.log(`  user_id: ${c.user_id?.slice(0, 8)}..., room_id: ${c.room_id?.slice(0, 8)}..., date: ${c.check_in_date}, completed: ${c.completed}`)
    })
  } else {
    console.log('  (none)')
  }

  // Get all room members
  const { data: members } = await supabase.from('room_members').select('*')
  console.log('\nROOM MEMBERSHIPS:')
  if (members && members.length > 0) {
    members.forEach(m => {
      console.log(`  user_id: ${m.user_id?.slice(0, 8)}..., room_id: ${m.room_id?.slice(0, 8)}..., is_active: ${m.is_active}`)
    })
  } else {
    console.log('  (none)')
  }
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
