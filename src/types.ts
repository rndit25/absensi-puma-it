export type Role = 'admin' | 'ketua' | 'bph' | 'internal' | 'external' | 'rnd' | 'ricm' | 'member'
export type Division = 'BPH' | 'Internal' | 'External' | 'R&D' | 'RICM'
export interface Profile {
  id: string
  email: string
  full_name: string
  member_id: string | null
  division: Division
  role: Role
  created_at: string
}
export interface AttendanceSession {
  id: string
  title: string
  pin_hint: string
  starts_at: string
  expires_at: string
  ended_at: string | null
  created_by: string
  created_at: string
}
export interface AttendanceRecord {
  id: string
  session_id: string
  user_id: string
  checked_in_at: string
  status: string
  profiles?: Profile
  attendance_sessions?: AttendanceSession
}
