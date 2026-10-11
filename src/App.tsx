import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import type { Profile, AttendanceSession, AttendanceRecord, Division, Role } from './types'
import { QRCodeSVG } from 'qrcode.react'
import {
  Activity, ArrowDownToLine, CalendarDays, CheckCircle2, ChevronRight, Clock3,
  Cpu, FileSpreadsheet, Fingerprint, KeyRound, LayoutDashboard, LogOut, Menu,
  Plus, QrCode, RefreshCw, Search, ShieldCheck, Users, X
} from 'lucide-react'

type Tab = 'overview' | 'attendance' | 'members' | 'sessions'
const DIVISIONS: Division[] = ['BPH', 'Internal', 'External', 'R&D', 'RICM']
const ALLOWED_EMAIL_DOMAIN = 'student.president.ac.id'
const ROLE_LABEL: Record<Role, string> = {
  admin: 'ADMIN', ketua: 'Ketua PUMA', bph: 'BPH', internal: 'Internal',
  external: 'External', rnd: 'R&D', ricm: 'RICM', member: 'Anggota'
}
const isAdmin = (p: Profile | null) => p?.role === 'admin'
const canManageSessions = (p: Profile | null) => p?.role === 'admin' || p?.role === 'bph'
const dateTime = (s?: string | null) => s ? new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const dateOnly = (s?: string | null) => s ? new Date(s).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : '—'

function Brand({ small = false }: { small?: boolean }) {
  return <div className="brand">
    <img className={`brand-logo ${small ? 'brand-logo-small' : ''}`} src="/puma-logo.png" alt="Logo PUMA IT Pekanbaru" />
    <div><strong>PUMA IT</strong><span>PEKANBARU</span></div>
  </div>
}

function SetupNotice() {
  return <div className="setup-screen"><div className="setup-card"><Brand/><div className="setup-icon"><ShieldCheck size={28}/></div>
    <h1>Hubungkan database terlebih dahulu</h1>
    <p>Website sudah siap dijalankan. Masukkan URL dan publishable/anon key Supabase agar login, pendaftaran, dan absensi dapat digunakan.</p>
    <ol><li>Buat project di <a href="https://supabase.com" target="_blank" rel="noreferrer">Supabase</a>.</li><li>Jalankan seluruh file <code>supabase/schema.sql</code> di SQL Editor.</li><li>Salin <code>.env.example</code> menjadi <code>.env</code>, lalu isi URL dan key dari Project Settings → API.</li><li>Jalankan ulang <code>npm run dev</code>.</li></ol>
    <div className="notice">Jangan masukkan <code>service_role</code> key ke aplikasi frontend.</div>
  </div></div>
}

export default function App() {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<{type:'success'|'error'; text:string} | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [sessionTitle, setSessionTitle] = useState('Absensi Kegiatan PUMA IT')
  const [duration, setDuration] = useState('60')
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null)
  const [pin, setPin] = useState('')
  const [attendBusy, setAttendBusy] = useState(false)
  const [adminPin, setAdminPin] = useState<string | null>(null)
  const [memberRole, setMemberRole] = useState<Role>('member')
  const [memberDivision, setMemberDivision] = useState<Division>('BPH')
  const [editingMember, setEditingMember] = useState<Profile | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [endingSession, setEndingSession] = useState<string | null>(null)
  const [memberBusy, setMemberBusy] = useState(false)

  const flash = (type: 'success'|'error', text: string) => {
    setNotice({type, text})
    window.setTimeout(() => setNotice(null), 4500)
  }

  const loadProfile = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    if (error) console.error(error)
    setProfile(data as Profile | null)
  }, [])

  const loadData = useCallback(async () => {
    if (!userId || !profile) return
    setDataLoading(true)
    try {
      const [s, a] = await Promise.all([
        supabase.rpc('list_attendance_sessions'),
        supabase.from('attendance_records').select('id,session_id,user_id,checked_in_at,status').order('checked_in_at', {ascending:false}).limit(1000)
      ])
      if (!s.error) setSessions((s.data || []) as AttendanceSession[])
      if (!a.error) setRecords((a.data || []) as AttendanceRecord[])
      if (profile.role === 'admin') {
        const p = await supabase.from('profiles').select('*').order('created_at', {ascending:false}).limit(1000)
        if (!p.error) setProfiles((p.data || []) as Profile[])
      } else setProfiles([profile])
    } catch (err) {
      console.error('Gagal memuat data portal:', err)
      flash('error', 'Koneksi bermasalah. Periksa internet lalu muat ulang data.')
    } finally { setDataLoading(false) }
  }, [userId, profile])

  useEffect(() => {
    const qrPin = new URLSearchParams(window.location.search).get('attendancePin')
    if (qrPin && /^\d{6}$/.test(qrPin)) { setPin(qrPin); setTab('attendance') }
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({data}) => {
      if (!alive) return
      const id = data.session?.user.id || null
      setUserId(id)
      if (!id) setLoading(false)
    })
    const {data: listener} = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id || null
      setUserId(id)
      if (!id) { setProfile(null); setLoading(false) }
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!userId) return
    loadProfile(userId).finally(() => setLoading(false))
  }, [userId, loadProfile])

  useEffect(() => { if (userId && profile) loadData() }, [userId, profile, loadData])

  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel('puma-live-updates')
      .on('postgres_changes', {event:'*', schema:'public', table:'attendance_sessions'}, () => loadData())
      .on('postgres_changes', {event:'*', schema:'public', table:'attendance_records'}, () => loadData())
      .on('postgres_changes', {event:'*', schema:'public', table:'profiles'}, () => { loadData(); loadProfile(userId) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, loadData, loadProfile])

  const activeSessions = useMemo(() => sessions.filter(s => !s.ended_at && new Date(s.expires_at).getTime() > Date.now()), [sessions])
  const myRecords = useMemo(() => records.filter(r => r.user_id === userId), [records, userId])
  const todayRecords = useMemo(() => records.filter(r => new Date(r.checked_in_at).toDateString() === new Date().toDateString()), [records])
  const filteredProfiles = useMemo(() => profiles.filter(p => `${p.full_name} ${p.email} ${p.member_id || ''} ${p.division} ${ROLE_LABEL[p.role]}`.toLowerCase().includes(search.toLowerCase())), [profiles, search])
  const sessionById = useMemo(() => Object.fromEntries(sessions.map(s => [s.id, s])), [sessions])

  async function submitAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setAuthError(''); setAuthBusy(true)
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') || '').trim().toLowerCase()
    const password = String(fd.get('password') || '')
    try {
      if (authMode === 'register') {
        if (email.slice(email.lastIndexOf('@') + 1) !== ALLOWED_EMAIL_DOMAIN) {
          throw new Error(`Gunakan email kampus dengan domain @${ALLOWED_EMAIL_DOMAIN}.`)
        }
        const full_name = String(fd.get('full_name') || '').trim()
        const member_id = String(fd.get('member_id') || '').trim()
        const division = String(fd.get('division') || 'BPH') as Division
        if (full_name.length < 2) throw new Error('Nama lengkap wajib diisi.')
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name, member_id, division } } })
        if (error) throw error
        if (!data.session) {
          setAuthError('Akun berhasil dibuat. Periksa email untuk konfirmasi, lalu login.')
          setAuthMode('login')
        } else flash('success', 'Pendaftaran berhasil. Selamat datang!')
      } else {
        const {error} = await supabase.auth.signInWithPassword({email, password})
        if (error) throw error
      }
    } catch (err) { setAuthError(err instanceof Error ? err.message : 'Terjadi kesalahan.') }
    finally { setAuthBusy(false) }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUserId(null); setProfile(null); setTab('overview')
  }

  async function createSession(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canManageSessions(profile)) return
    setNotice(null); setAdminPin(null)
    const mins = Math.max(5, Math.min(720, Number(duration) || 60))
    setSessionBusy(true)
    try {
      const {data, error} = await supabase.rpc('admin_create_attendance_session', {p_title: sessionTitle.trim() || 'Absensi PUMA IT', p_duration_minutes: mins})
      if (error) return flash('error', error.message)
      const result = Array.isArray(data) ? data[0] : data
      if (!result?.session_id || !result?.pin) return flash('error', 'Server tidak mengembalikan PIN. Periksa fungsi SQL.')
      setAdminPin(String(result.pin))
      setShowCreate(false)
      flash('success', 'Sesi absensi berhasil dibuat.')
      await loadData()
      const {data: latestSessions} = await supabase.rpc('list_attendance_sessions')
      const created = (latestSessions || []).find((s: AttendanceSession) => s.id === result.session_id)
      if (created) setActiveSession(created as AttendanceSession)
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Gagal membuat sesi. Periksa koneksi internet.')
    } finally { setSessionBusy(false) }
  }

  async function endSession(id: string) {
    setEndingSession(id)
    try {
      const {error} = await supabase.rpc('admin_end_attendance_session', {p_session_id:id})
      if (error) flash('error', error.message)
      else { flash('success', 'Sesi absensi telah diakhiri.'); loadData(); setActiveSession(null) }
    } catch { flash('error', 'Gagal mengakhiri sesi. Periksa koneksi internet.') }
    finally { setEndingSession(null) }
  }

  async function checkIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!pin.trim()) return
    setAttendBusy(true)
    try {
      const {data, error} = await supabase.rpc('submit_attendance_pin', {p_pin: pin.trim()})
      if (error) return flash('error', error.message)
      const result = Array.isArray(data) ? data[0] : data
      if (result?.success) {
        setPin('')
        const url = new URL(window.location.href); url.searchParams.delete('attendancePin'); window.history.replaceState({}, '', url)
        flash('success', 'Absensi berhasil dicatat.'); await loadData()
      } else flash('error', result?.message || 'PIN tidak valid atau sesi sudah berakhir.')
    } catch { flash('error', 'Gagal mengirim absensi. Periksa koneksi internet.') }
    finally { setAttendBusy(false) }
  }

  async function updateMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingMember || !isAdmin(profile)) return
    setMemberBusy(true)
    try {
      const {error} = await supabase.from('profiles').update({role:memberRole, division:memberDivision}).eq('id', editingMember.id)
      if (error) flash('error', error.message)
      else { flash('success', 'Role anggota diperbarui.'); setEditingMember(null); await loadData() }
    } catch { flash('error', 'Gagal menyimpan perubahan. Periksa koneksi internet.') }
    finally { setMemberBusy(false) }
  }

  function exportCsv() {
    const rows = [['Nama','Email','ID Anggota','Divisi','Role','Tanggal Daftar']]
    profiles.forEach(p => rows.push([p.full_name,p.email,p.member_id || '',p.division,ROLE_LABEL[p.role],dateTime(p.created_at)]))
    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'}))
    const a = document.createElement('a'); a.href=url; a.download='anggota-puma-it.csv'; a.click(); URL.revokeObjectURL(url)
  }

  if (!isSupabaseConfigured) return <SetupNotice/>
  if (loading) return <div className="loading-screen"><div className="spinner"/><span>Memuat PUMA IT…</span></div>

  if (!userId || !profile) return <div className="auth-layout">
    <section className="auth-aside"><Brand/><div className="auth-hero-icon"><img src="/puma-logo.png" alt="Logo PUMA IT Pekanbaru"/></div><p className="eyebrow">SISTEM INFORMASI ORGANISASI</p><h1>Absensi lebih mudah.<br/><em>Terhubung</em> dalam satu sistem.</h1><p className="auth-copy">Portal resmi kehadiran anggota PUMA IT Pekanbaru. Cepat, teratur, dan bisa diakses dari mana saja.</p><div className="auth-footer">© {new Date().getFullYear()} PUMA IT Pekanbaru</div></section>
    <section className="auth-main"><div className="auth-box"><div className="mobile-brand"><Brand/></div><span className="pill"><span className="dot"/> PORTAL ANGGOTA</span><h2>{authMode === 'login' ? 'Selamat datang!' : 'Buat akun anggota'}</h2><p className="muted">{authMode === 'login' ? 'Masuk untuk melakukan absensi dan melihat riwayat kehadiran.' : 'Daftarkan data dirimu untuk bergabung di portal PUMA IT.'}</p>
      <form onSubmit={submitAuth} className="form-stack">
        {authMode === 'register' && <>
          <label>Nama lengkap<input name="full_name" placeholder="Nama sesuai identitas" autoComplete="name" required minLength={2}/></label>
          <label>NIM / ID anggota <span className="optional">Opsional</span><input name="member_id" placeholder="Contoh: 24001234"/></label>
          <label>Divisi<select name="division" defaultValue="BPH">{DIVISIONS.map(d=><option key={d}>{d}</option>)}</select></label>
        </>}
        <label>Email<input type="email" name="email" placeholder="nama@email.com" autoComplete="email" required/></label>
        <label>Kata sandi<input type="password" name="password" placeholder="Minimal 8 karakter" autoComplete={authMode==='login'?'current-password':'new-password'} required minLength={8}/></label>
        {authError && <div className="inline-error">{authError}</div>}
        <button className="btn btn-primary btn-full" disabled={authBusy}>{authBusy ? 'Memproses…' : authMode === 'login' ? 'Masuk ke akun' : 'Daftar akun'} <ChevronRight size={17}/></button>
      </form>
      <p className="switch-auth">{authMode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'} <button onClick={()=>{setAuthMode(authMode==='login'?'register':'login');setAuthError('')}}>{authMode==='login'?'Daftar sekarang':'Masuk'}</button></p>
      <div className="security-note"><ShieldCheck size={16}/> Data akun tersimpan dengan aman di database organisasi.</div>
    </div></section>
  </div>

  const nav = [
    {id:'overview' as Tab, label:'Ringkasan', icon:LayoutDashboard},
    {id:'attendance' as Tab, label:'Absensi', icon:Fingerprint},
        {id:'sessions' as Tab, label:'Sesi & Kode', icon:QrCode, admin:canManageSessions(profile)},
    {id:'members' as Tab, label:'Data Anggota', icon:Users, admin:true},
  ].filter(n => n.id === 'sessions' ? canManageSessions(profile) : !n.admin || isAdmin(profile))

  return <div className="app-shell">
    {mobileMenu && <button className="mobile-overlay" aria-label="Tutup menu" onClick={()=>setMobileMenu(false)}/>}
    <aside className={`sidebar ${mobileMenu?'sidebar-open':''}`}><div className="sidebar-top"><Brand small/><button className="icon-btn mobile-close" onClick={()=>setMobileMenu(false)}><X size={19}/></button></div>
      <div className="workspace-label">MENU UTAMA</div><nav>{nav.map(n=><button key={n.id} className={`nav-link ${tab===n.id?'active':''}`} onClick={()=>{setTab(n.id);setMobileMenu(false)}}><n.icon size={18}/><span>{n.label}</span>{tab===n.id&&<span className="nav-active-mark"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="live-chip"><span className="dot"/> Sistem aktif <span className="live-pulse"/></div><div className="sidebar-user"><div className="avatar">{profile.full_name?.slice(0,1).toUpperCase() || 'A'}</div><div className="user-info"><strong>{profile.full_name}</strong><span>{ROLE_LABEL[profile.role]}</span></div><button className="icon-btn" title="Keluar" onClick={signOut}><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu-btn" onClick={()=>setMobileMenu(true)}><Menu size={21}/></button><div><div className="breadcrumb">PUMA IT <ChevronRight size={13}/> <strong>{nav.find(n=>n.id===tab)?.label || 'Portal'}</strong></div><div className="topbar-sub">Portal kehadiran anggota</div></div></div><div className="topbar-right"><span className="today-label"><CalendarDays size={16}/>{new Date().toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</span><span className={`connection-status ${dataLoading?'is-loading':''}`} aria-live="polite">{dataLoading?<><span className="spinner spinner-small"/> Memuat data…</>:<><span className="dot"/> Terhubung</>}</span><button className="icon-btn refresh-btn" title="Muat ulang" onClick={loadData} disabled={dataLoading}><RefreshCw size={17}/></button><div className="top-avatar">{profile.full_name?.slice(0,1).toUpperCase()}</div></div></header>
      <div className="page-content">
        {notice && <div className={`toast ${notice.type}`}><CheckCircle2 size={18}/>{notice.text}<button onClick={()=>setNotice(null)}><X size={16}/></button></div>}
        {tab==='overview' && <><div className="page-heading"><div><div className="eyebrow">DASHBOARD</div><h1>Halo, {profile.full_name?.split(' ')[0] || 'Anggota'}! <span className="wave">✦</span></h1><p>Pantau aktivitas dan kehadiran PUMA IT hari ini.</p></div><div className="heading-actions"><span className="live-status"><span className="dot"/> Real-time aktif</span><button className="btn btn-primary" onClick={()=>setTab('attendance')}><Fingerprint size={17}/> Absen sekarang</button></div></div>
          <div className="stats-grid"><StatCard icon={<Users/>} label="Total Anggota" value={isAdmin(profile)?profiles.length:'—'} detail={isAdmin(profile)?'Terdaftar di sistem':'Data dikelola admin'} tone="teal"/><StatCard icon={<CheckCircle2/>} label="Hadir Hari Ini" value={todayRecords.length} detail="Catatan kehadiran hari ini" tone="green"/><StatCard icon={<QrCode/>} label="Sesi Aktif" value={activeSessions.length} detail="Sesi yang masih terbuka" tone="blue"/><StatCard icon={<Activity/>} label="Riwayat Saya" value={myRecords.length} detail="Total absensi tercatat" tone="orange"/></div>
          <div className="content-grid"><section className="panel panel-large"><div className="panel-header"><div><h3>Sesi absensi aktif</h3><p>Pilih sesi dan masukkan PIN yang diberikan admin.</p></div><span className="count-badge">{activeSessions.length} aktif</span></div>
            {activeSessions.length===0?<EmptyState icon={<Clock3/>} title="Belum ada sesi aktif" text="Sesi absensi akan muncul di sini saat admin membukanya."/>:<div className="session-list">{activeSessions.map(s=><div className="session-row" key={s.id}><div className="session-icon"><QrCode size={21}/></div><div className="session-info"><strong>{s.title}</strong><span>Berakhir {dateTime(s.expires_at)}</span></div><button className="btn btn-outline btn-sm" onClick={()=>{setTab('attendance');setActiveSession(s)}}>Absen <ChevronRight size={15}/></button></div>)}</div>}
          </section><section className="panel"><div className="panel-header"><div><h3>Aktivitas terbaru</h3><p>Riwayat kehadiranmu</p></div><button className="text-button" onClick={()=>setTab('attendance')}>Lihat semua</button></div>
            {myRecords.slice(0,5).length===0?<EmptyState icon={<CalendarDays/>} title="Belum ada riwayat" text="Riwayat akan tampil setelah kamu absen."/>:<div className="activity-list">{myRecords.slice(0,5).map(r=><div className="activity-row" key={r.id}><div className="activity-check"><CheckCircle2 size={16}/></div><div><strong>{sessionById[r.session_id]?.title || 'Absensi kegiatan'}</strong><span>{dateTime(r.checked_in_at)}</span></div><span className="status-tag">Hadir</span></div>)}</div>}
          </section></div>
          {canManageSessions(profile)&&<section className="panel admin-banner"><div className="admin-banner-icon"><ShieldCheck size={25}/></div><div><h3>Kelola absensi</h3><p>Buat sesi kegiatan dan bagikan PIN atau QR kepada anggota.</p></div><button className="btn btn-dark" onClick={()=>setTab('sessions')}>Kelola sesi <ChevronRight size={16}/></button></section>}
        </>}
        {tab==='attendance' && <><div className="page-heading"><div><div className="eyebrow">KEHADIRAN</div><h1>Absensi anggota</h1><p>Masukkan PIN enam digit atau pindai QR sesi untuk mengisi PIN otomatis.</p></div></div><div className="attendance-layout"><section className="panel pin-panel"><div className="pin-emblem"><Fingerprint size={32}/></div><h2>Masukkan kode absensi</h2><p className="muted">Pastikan kamu sudah login menggunakan akun pribadi.</p><form onSubmit={checkIn} className="pin-form"><label htmlFor="attendance-pin">PIN ABSENSI</label><input id="attendance-pin" className="pin-input" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" maxLength={6} required/><div className="pin-help"><KeyRound size={15}/> PIN hanya berlaku selama sesi aktif.</div><button className="btn btn-primary btn-full" disabled={attendBusy || pin.length!==6}>{attendBusy?<><span className="spinner spinner-small spinner-light"/> Mengirim absensi…</>:<>Konfirmasi kehadiran <ChevronRight size={17}/></>}</button></form><div className="pin-security"><ShieldCheck size={17}/><span>Setiap anggota hanya dapat absen satu kali untuk setiap sesi.</span></div></section><section className="panel"><div className="panel-header"><div><h3>Sesi yang tersedia</h3><p>Pilih sesi yang ingin kamu ikuti.</p></div></div>{activeSessions.length===0?<EmptyState icon={<QrCode/>} title="Tidak ada sesi terbuka" text="Tunggu admin membuka sesi absensi baru."/>:<div className="session-list">{activeSessions.map(s=><button className={`session-row selectable ${activeSession?.id===s.id?'selected':''}`} key={s.id} onClick={()=>setActiveSession(s)}><div className="session-icon"><QrCode size={21}/></div><div className="session-info"><strong>{s.title}</strong><span>Berlaku sampai {dateTime(s.expires_at)}</span></div><ChevronRight size={17}/></button>)}</div>}{activeSession&&<div className="selected-session"><span className="eyebrow">SESI DIPILIH</span><strong>{activeSession.title}</strong><span>Masukkan PIN yang diumumkan admin untuk sesi ini.</span></div>}</section></div>
          <section className="panel history-panel"><div className="panel-header"><div><h3>Riwayat kehadiran saya</h3><p>Daftar absensi yang tercatat di akunmu.</p></div><span className="count-badge">{myRecords.length} catatan</span></div><AttendanceTable records={myRecords} sessionById={sessionById}/></section></>}
        {tab==='sessions' && canManageSessions(profile) && <><div className="page-heading"><div><div className="eyebrow">PENGELOLA SESI</div><h1>Kode & QR absensi</h1><p>Buat sesi, bagikan PIN/QR kepada anggota, dan pantau kehadiran.</p></div><button className="btn btn-primary" onClick={()=>setShowCreate(true)}><Plus size={18}/> Buat sesi baru</button></div><div className="session-howto">ADMIN dan BPH dapat membuka sesi: tekan <strong>Buat sesi baru</strong>, isi nama kegiatan dan durasi, lalu bagikan PIN atau QR yang muncul.</div>
          {adminPin&&<div className="generated-pin panel"><div className="generated-copy"><span className="eyebrow">PIN SESI BARU</span><h2>{adminPin}</h2><p>Bagikan PIN atau minta anggota memindai QR. QR membuka portal absensi dan mengisi PIN otomatis.</p><button className="btn btn-outline btn-sm" onClick={()=>navigator.clipboard.writeText(adminPin).then(()=>flash('success','PIN disalin.'))}><KeyRound size={15}/> Salin PIN</button></div><div className="qr-box"><QRCodeSVG value={`${window.location.origin}/?attendancePin=${adminPin}`} size={156} level="M" includeMargin/><span>SCAN UNTUK BUKA ABSENSI</span></div><button className="icon-btn dismiss-generated" onClick={()=>setAdminPin(null)}><X size={18}/></button></div>}
          <section className="panel"><div className="panel-header"><div><h3>Semua sesi absensi</h3><p>Sesi terbaru akan muncul paling atas.</p></div><span className="count-badge">{sessions.length} sesi</span></div><div className="table-wrap"><table><thead><tr><th>Nama sesi</th><th>Status</th><th>Dibuat</th><th>Batas waktu</th><th>Kehadiran</th><th>Aksi</th></tr></thead><tbody>{sessions.map(s=>{const active=!s.ended_at&&new Date(s.expires_at).getTime()>Date.now();const count=records.filter(r=>r.session_id===s.id).length;return <tr key={s.id}><td><strong>{s.title}</strong><span className="cell-sub">{s.id.slice(0,8)}</span></td><td><span className={`status-tag ${active?'':'inactive'}`}>{active?'Aktif':s.ended_at?'Diakhiri':'Kedaluwarsa'}</span></td><td>{dateTime(s.created_at)}</td><td>{dateTime(s.expires_at)}</td><td><strong>{count}</strong> anggota</td><td>{active?<button className="btn btn-danger btn-xs" onClick={()=>endSession(s.id)} disabled={endingSession===s.id}>{endingSession===s.id?'Mengakhiri…':'Akhiri sesi'}</button>:'—'}</td></tr>})}{sessions.length===0&&<tr><td colSpan={6}><EmptyState icon={<QrCode/>} title="Belum ada sesi" text="Klik Buat sesi baru untuk memulai."/></td></tr>}</tbody></table></div></section>
          {showCreate&&<Modal title="Buat sesi absensi" onClose={()=>!sessionBusy&&setShowCreate(false)}><form onSubmit={createSession} className="form-stack modal-form"><label>Nama kegiatan<input value={sessionTitle} onChange={e=>setSessionTitle(e.target.value)} required maxLength={100} placeholder="Contoh: Rapat rutin PUMA IT"/></label><label>Durasi sesi<select value={duration} onChange={e=>setDuration(e.target.value)}><option value="15">15 menit</option><option value="30">30 menit</option><option value="60">1 jam</option><option value="120">2 jam</option><option value="240">4 jam</option><option value="720">12 jam</option></select></label><div className="notice">Akses untuk ADMIN dan BPH. Isi kegiatan dan durasi, lalu buat sesi. Bagikan PIN atau QR kepada anggota; kode hanya tampil sekali.</div><div className="modal-actions"><button type="button" className="btn btn-outline" onClick={()=>setShowCreate(false)} disabled={sessionBusy}>Batal</button><button className="btn btn-primary" disabled={sessionBusy}>{sessionBusy?<><span className="spinner spinner-small spinner-light"/> Membuat sesi…</>:<><Plus size={17}/> Buat sesi</>}</button></div></form></Modal>}
        </>}
        {tab==='members' && isAdmin(profile) && <><div className="page-heading"><div><div className="eyebrow">ADMINISTRATOR</div><h1>Data anggota</h1><p>Data pendaftaran anggota yang tersimpan di database.</p></div><button className="btn btn-outline" onClick={exportCsv}><ArrowDownToLine size={17}/> Ekspor CSV</button></div><div className="stats-grid members-stats"><StatCard icon={<Users/>} label="Total anggota" value={profiles.length} detail="Seluruh akun terdaftar" tone="teal"/><StatCard icon={<ShieldCheck/>} label="Administrator" value={profiles.filter(p=>p.role==='admin').length} detail="Akses kelola sesi" tone="blue"/><StatCard icon={<Activity/>} label="Divisi terisi" value={new Set(profiles.map(p=>p.division)).size} detail="Dari 5 kategori" tone="green"/><StatCard icon={<CalendarDays/>} label="Pendaftar hari ini" value={profiles.filter(p=>new Date(p.created_at).toDateString()===new Date().toDateString()).length} detail="Akun baru hari ini" tone="orange"/></div><section className="panel"><div className="panel-header member-table-header"><div><h3>Direktori anggota</h3><p>Perubahan data disinkronkan secara real-time.</p></div><div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama, email, divisi…"/></div></div><div className="table-wrap"><table><thead><tr><th>Anggota</th><th>ID Anggota</th><th>Divisi</th><th>Role</th><th>Tanggal daftar</th><th>Aksi</th></tr></thead><tbody>{filteredProfiles.map(p=><tr key={p.id}><td><div className="member-cell"><div className="avatar small">{p.full_name?.slice(0,1).toUpperCase()}</div><div><strong>{p.full_name}</strong><span className="cell-sub">{p.email}</span></div></div></td><td>{p.member_id||'—'}</td><td><span className="division-pill">{p.division}</span></td><td><span className={`role-pill ${p.role==='admin'?'role-admin':''}`}>{ROLE_LABEL[p.role]}</span></td><td>{dateOnly(p.created_at)}</td><td><button className="btn btn-outline btn-xs" onClick={()=>{setEditingMember(p);setMemberRole(p.role);setMemberDivision(p.division)}}>Atur role</button></td></tr>)}{filteredProfiles.length===0&&<tr><td colSpan={6}><EmptyState icon={<Search/>} title="Anggota tidak ditemukan" text="Coba kata kunci lain."/></td></tr>}</tbody></table></div></section>
          {editingMember&&<Modal title="Atur role anggota" onClose={()=>!memberBusy&&setEditingMember(null)}><form onSubmit={updateMember} className="form-stack modal-form"><div className="member-edit-summary"><div className="avatar">{editingMember.full_name?.slice(0,1).toUpperCase()}</div><div><strong>{editingMember.full_name}</strong><span>{editingMember.email}</span></div></div><label>Role<select value={memberRole} onChange={e=>setMemberRole(e.target.value as Role)} disabled={memberBusy}>{Object.entries(ROLE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label>Divisi<select value={memberDivision} onChange={e=>setMemberDivision(e.target.value as Division)} disabled={memberBusy}>{DIVISIONS.map(d=><option key={d}>{d}</option>)}</select></label><div className="notice">Hanya role ADMIN yang dapat mengubah role anggota.</div><div className="modal-actions"><button type="button" className="btn btn-outline" onClick={()=>setEditingMember(null)} disabled={memberBusy}>Batal</button><button className="btn btn-primary" disabled={memberBusy}>{memberBusy?'Menyimpan…':'Simpan perubahan'}</button></div></form></Modal>}
        </>}
        <footer className="page-footer"><Brand small/><span>Absensi PUMA IT Pekanbaru · {new Date().getFullYear()}</span><span className="footer-live"><span className="dot"/> Terhubung</span></footer>
      </div>
    </main>
  </div>
}

function StatCard({icon,label,value,detail,tone}:{icon:React.ReactNode;label:string;value:string|number;detail:string;tone:string}) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>
}
function EmptyState({icon,title,text}:{icon:React.ReactNode;title:string;text:string}) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><span>{text}</span></div>
}
function AttendanceTable({records,sessionById}:{records:AttendanceRecord[];sessionById:Record<string,AttendanceSession>}) {
  return <div className="table-wrap"><table><thead><tr><th>Kegiatan</th><th>Tanggal</th><th>Waktu absen</th><th>Status</th></tr></thead><tbody>{records.map(r=><tr key={r.id}><td><strong>{sessionById[r.session_id]?.title||'Absensi kegiatan'}</strong></td><td>{dateOnly(r.checked_in_at)}</td><td>{new Date(r.checked_in_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</td><td><span className="status-tag">Hadir</span></td></tr>)}{records.length===0&&<tr><td colSpan={4}><EmptyState icon={<CalendarDays/>} title="Belum ada kehadiran" text="Data absensi akan muncul setelah kamu melakukan check-in."/></td></tr>}</tbody></table></div>
}
function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}) {
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal"><div className="modal-header"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X size={19}/></button></div>{children}</section></div>
}
