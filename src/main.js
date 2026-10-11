import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import './style.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configured = Boolean(SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('YOUR_PROJECT'));
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 10 } }
}) : null;

const app = document.querySelector('#app');
const divisions = ['BPH', 'Internal', 'External', 'R&D', 'RICM'];
const roleLabels = { admin: 'ADMIN', ketua: 'Ketua PUMA', bph: 'BPH', internal: 'Internal', external: 'External', rnd: 'R&D', ricm: 'RICM', member: 'Anggota' };
let session = null, profile = null, activeTab = 'dashboard', liveChannel = null, latestSession = null;
let toastTimer;

const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (d) => new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(d));
const dateOnly = (d) => new Intl.DateTimeFormat('id-ID',{dateStyle:'long'}).format(new Date(d));
const initials = (name='Anggota') => name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
function notify(message, type='ok') {
  let node = document.querySelector('.toast');
  if (!node) { node = document.createElement('div'); node.className='toast'; document.body.append(node); }
  node.className = `toast ${type}`; node.textContent = message;
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>node.remove(), 3600);
}
function logo(size=42) { return `<img class="brand-logo" style="width:${size}px;height:${size}px" src="/puma-logo.png" alt="Logo PUMA IT" onerror="this.style.display='none'">`; }
function shell(content) {
  app.innerHTML = `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand">${logo(44)}<div><strong>PUMA IT</strong><span>PEKANBARU</span></div></div>
      <div class="side-caption">MENU UTAMA</div>
      <button class="nav-item ${activeTab==='dashboard'?'active':''}" data-tab="dashboard"><span>▦</span> Dashboard</button>
      <button class="nav-item ${activeTab==='attendance'?'active':''}" data-tab="attendance"><span>◷</span> Absensi</button>
      ${profile?.role==='admin' ? `<div class="side-caption">ADMINISTRASI</div><button class="nav-item ${activeTab==='members'?'active':''}" data-tab="members"><span>♙</span> Data Anggota</button><button class="nav-item ${activeTab==='sessions'?'active':''}" data-tab="sessions"><span>▧</span> Kode & QR Absensi</button>`:''}
      <div class="sidebar-bottom"><div class="user-mini">${logo(38)}<div class="user-mini-text"><strong>${esc(profile?.full_name || session?.user?.email || 'Anggota')}</strong><span>${esc(roleLabels[profile?.role] || 'Anggota')}</span></div></div><button class="logout" id="logout">↪ Keluar</button></div>
    </aside>
    <main class="main-area">
      <header class="topbar"><div class="mobile-brand">${logo(34)}<strong>PUMA IT <span>PEKANBARU</span></strong></div><div class="breadcrumb">PUMA IT <span>/</span> ${({dashboard:'Dashboard',attendance:'Absensi',members:'Data Anggota',sessions:'Kode & QR Absensi'})[activeTab]}</div><div class="top-user"><span class="live-dot"></span><span>Terhubung</span><div class="avatar">${esc(initials(profile?.full_name))}</div></div></header>
      <section class="page-content">${content}</section>
      <footer>© ${new Date().getFullYear()} PUMA IT Pekanbaru <span>•</span> Sistem Absensi Anggota</footer>
    </main>
  </div>`;
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.tab;renderTab();}));
  document.querySelector('#logout')?.addEventListener('click', async()=>{await supabase.auth.signOut();});
}
function authPage(mode='login') {
  app.innerHTML = `<div class="auth-layout"><div class="auth-visual"><div class="auth-brand">${logo(58)}<div><strong>PUMA IT</strong><span>PEKANBARU</span></div></div><div class="visual-copy"><div class="eyebrow"><span></span> SISTEM INFORMASI ORGANISASI</div><h1>Hadir bersama,<br><em>bertumbuh</em> bersama.</h1><p>Platform absensi digital anggota PUMA IT Pekanbaru. Cepat, praktis, dan tercatat real-time.</p><div class="visual-stat"><div><strong>01</strong><span>Login anggota</span></div><div><strong>02</strong><span>Masukkan PIN</span></div><div><strong>03</strong><span>Absensi tercatat</span></div></div></div><div class="auth-foot">PUMA IT PEKANBARU <span>•</span> DIGITAL ATTENDANCE</div></div>
  <div class="auth-panel"><div class="auth-mobile-brand">${logo(48)}<div><strong>PUMA IT</strong><span>PEKANBARU</span></div></div><div class="auth-card"><div class="auth-heading"><span class="eyebrow">${mode==='login'?'SELAMAT DATANG KEMBALI':'GABUNG BERSAMA KAMI'}</span><h2>${mode==='login'?'Masuk ke akun':'Buat akun anggota'}</h2><p>${mode==='login'?'Login untuk mengakses absensi dan riwayat kehadiranmu.':'Daftarkan akunmu. Data akan masuk ke daftar anggota admin.'}</p></div>
  <form id="auth-form" class="form-stack">
    ${mode==='register'?`<label>Nama lengkap<input name="name" placeholder="Nama sesuai identitas" required minlength="2" autocomplete="name"></label><label>NIM / ID Anggota<input name="nim" placeholder="Masukkan NIM atau ID anggota" required></label><label>Divisi<select name="division" required><option value="">Pilih divisi</option><option>Internal</option><option>External</option><option>R&D</option><option>RICM</option><option>BPH</option></select></label>`:''}
    <label>Email<input name="email" type="email" placeholder="nama@email.com" required autocomplete="email"></label>
    <label>Kata sandi<input name="password" type="password" placeholder="Minimal 8 karakter" required minlength="8" autocomplete="${mode==='login'?'current-password':'new-password'}"></label>
    <button class="btn btn-primary btn-full" type="submit">${mode==='login'?'Masuk ke Dashboard':'Daftar sebagai Anggota'} <span>→</span></button>
    <div class="form-error" id="auth-error" role="alert"></div>
  </form><div class="auth-switch">${mode==='login'?'Belum punya akun?':'Sudah punya akun?'} <button id="switch-auth">${mode==='login'?'Daftar sekarang':'Login di sini'}</button></div><div class="security-note">♧ <span>Akun pengurus dan ADMIN ditetapkan oleh administrator.</span></div></div></div></div>`;
  document.querySelector('#switch-auth').onclick=()=>authPage(mode==='login'?'register':'login');
  document.querySelector('#auth-form').onsubmit=async e=>{
    e.preventDefault(); const fd=new FormData(e.currentTarget), email=String(fd.get('email')).trim().toLowerCase(), password=String(fd.get('password'));
    const btn=e.currentTarget.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Memproses…';
    const err=document.querySelector('#auth-error'); err.textContent='';
    try {
      if(mode==='login') {
        const {error}=await supabase.auth.signInWithPassword({email,password}); if(error) throw error;
      } else {
        const full_name=String(fd.get('name')).trim(), nim=String(fd.get('nim')).trim(), division=String(fd.get('division'));
        const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name,nim,division}}}); if(error) throw error;
        if(data.session) {
          const {error:pe}=await supabase.from('profiles').upsert({id:data.user.id,full_name,nim,division,role:'member'}); if(pe) throw pe;
          notify('Akun berhasil dibuat. Selamat bergabung!');
        } else {
          err.textContent='Pendaftaran berhasil. Periksa email untuk verifikasi, lalu login. Profil akan dibuat setelah verifikasi.';
          btn.disabled=false; btn.textContent='Daftar sebagai Anggota'; return;
        }
      }
    } catch(ex) { err.textContent=ex.message || 'Terjadi kesalahan. Coba lagi.'; btn.disabled=false; btn.textContent=mode==='login'?'Masuk ke Dashboard':'Daftar sebagai Anggota'; }
  };
}
function statCard(label,value,caption,icon,accent='') { return `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon ${accent}">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-caption">${caption}</div></article>`; }
function pageTitle(title,sub,action='') { return `<div class="page-title-row"><div><div class="eyebrow">PUMA IT PEKANBARU</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`; }
async function dashboard() {
  const today=new Date(); const start=new Date(today); start.setHours(0,0,0,0); const end=new Date(start); end.setDate(end.getDate()+1);
  let members=[], attendance=[], sessions=[];
  const [m,a,s]=await Promise.all([
    supabase.from('profiles').select('id,full_name,nim,division,role,created_at').order('created_at',{ascending:false}).limit(500),
    supabase.from('attendance').select('id,user_id,session_id,checked_in_at,status,profiles(full_name,division)').gte('checked_in_at',start.toISOString()).lt('checked_in_at',end.toISOString()).order('checked_in_at',{ascending:false}).limit(10),
    supabase.from('attendance_sessions').select('id,title,starts_at,expires_at,is_active').order('created_at',{ascending:false}).limit(5)
  ]);
  members=m.data||[]; attendance=a.data||[]; sessions=s.data||[];
  const {data:mine}=await supabase.from('attendance').select('id,checked_in_at,status,attendance_sessions(title)').eq('user_id',session.user.id).order('checked_in_at',{ascending:false}).limit(5);
  const todayMine=(mine||[]).filter(x=>new Date(x.checked_in_at)>=start).length;
  const content=`${pageTitle('Dashboard','Ringkasan aktivitas dan kehadiran anggota.',profile.role==='admin'?'<button class="btn btn-primary" id="quick-create">＋ Buat kode absensi</button>':'')}
    <div class="welcome-banner"><div><span class="banner-tag">HALO, ${esc((profile.full_name||'ANGGOTA').split(' ')[0].toUpperCase())} 👋</span><h2>Siap berkontribusi hari ini?</h2><p>Pastikan kehadiranmu tercatat untuk setiap kegiatan PUMA IT.</p></div><div class="banner-mark">P<span>.</span></div></div>
    <div class="stats-grid">${statCard('Total Anggota',members.length,'Akun terdaftar','♙')}${statCard('Hadir Hari Ini',attendance.length,'Absensi tercatat hari ini','✓','mint')}${statCard('Sesi Aktif',sessions.filter(x=>x.is_active&&new Date(x.expires_at)>today).length,'Kode absensi tersedia','◷','amber')}${statCard('Absensiku Hari Ini',todayMine,'Kehadiran akunmu','▤','violet')}</div>
    <div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h3>Aktivitas Kehadiran</h3><p>Catatan absensi terbaru hari ini</p></div><button class="text-btn" id="go-attendance">Lihat semua →</button></div>
    ${attendance.length?`<div class="table-wrap"><table><thead><tr><th>ANGGOTA</th><th>DIVISI</th><th>WAKTU</th><th>STATUS</th></tr></thead><tbody>${attendance.map(a=>`<tr><td><div class="person-cell"><div class="avatar small">${esc(initials(a.profiles?.full_name))}</div><strong>${esc(a.profiles?.full_name||'Anggota')}</strong></div></td><td>${esc(a.profiles?.division||'-')}</td><td>${fmt(a.checked_in_at)}</td><td><span class="status status-present">Hadir</span></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-state"><div class="empty-icon">◷</div><strong>Belum ada absensi hari ini</strong><p>Data kehadiran akan muncul di sini secara otomatis.</p></div>`}
    </section><section class="panel"><div class="panel-heading"><div><h3>Sesi Absensi</h3><p>Sesi terbaru yang dibuat admin</p></div></div><div class="session-list">${sessions.length?sessions.map(s=>`<div class="session-row"><div class="session-icon">▦</div><div class="session-info"><strong>${esc(s.title)}</strong><span>${fmt(s.starts_at)}</span></div><span class="status ${s.is_active&&new Date(s.expires_at)>today?'status-present':'status-muted'}">${s.is_active&&new Date(s.expires_at)>today?'Aktif':'Selesai'}</span></div>`).join(''):`<div class="empty-state compact"><p>Belum ada sesi absensi.</p></div>`}</div></section></div>`;
  shell(content);
  document.querySelector('#quick-create')?.addEventListener('click',()=>{activeTab='sessions';renderTab();});
  document.querySelector('#go-attendance')?.addEventListener('click',()=>{activeTab='attendance';renderTab();});
}
async function attendancePage() {
  const {data:mine,error}=await supabase.from('attendance').select('id,checked_in_at,status,attendance_sessions(title,starts_at)').eq('user_id',session.user.id).order('checked_in_at',{ascending:false}).limit(100);
  if(error) notify(error.message,'error');
  const {data:active}=await supabase.from('attendance_sessions').select('id,title,description,starts_at,expires_at,is_active').eq('is_active',true).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false});
  latestSession=active?.[0]||null;
  const content=`${pageTitle('Absensi Anggota','Masukkan PIN dari admin untuk mencatat kehadiran.')}
  <div class="attendance-layout"><section class="panel pin-panel"><div class="pin-heading"><div class="pin-symbol">✓</div><h2>Catat Kehadiran</h2><p>Masukkan kode PIN yang ditampilkan oleh admin atau scan QR kegiatan.</p></div>
  ${latestSession?`<div class="active-session"><span class="live-dot"></span><div><strong>${esc(latestSession.title)}</strong><span>Kode absensi sedang aktif</span></div><span class="status status-present">Aktif</span></div>`:`<div class="notice">Belum ada sesi aktif. Hubungi admin untuk mendapatkan kode absensi.</div>`}
  <form id="checkin-form" class="pin-form"><label for="pin">KODE PIN ABSENSI</label><input id="pin" name="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="• • • • • •" required ${latestSession?'':'disabled'}><button class="btn btn-primary btn-full" ${latestSession?'':'disabled'}>Konfirmasi Kehadiran <span>→</span></button><div class="form-error" id="pin-error"></div></form><p class="fine-print">Setiap akun hanya dapat absen satu kali untuk setiap sesi.</p></section>
  <section class="panel"><div class="panel-heading"><div><h3>Riwayat Absensi</h3><p>Catatan kehadiran akunmu</p></div><span class="count-pill">${mine?.length||0} catatan</span></div>
  ${mine?.length?`<div class="history-list">${mine.map(a=>`<div class="history-item"><div class="history-check">✓</div><div class="history-detail"><strong>${esc(a.attendance_sessions?.title||'Kegiatan PUMA IT')}</strong><span>${fmt(a.checked_in_at)}</span></div><span class="status status-present">Hadir</span></div>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">▤</div><strong>Belum ada riwayat</strong><p>Riwayatmu akan muncul setelah berhasil melakukan absensi.</p></div>`}</section></div>`;
  shell(content);
  document.querySelector('#checkin-form').onsubmit=async e=>{
    e.preventDefault(); const btn=e.currentTarget.querySelector('button'); const err=document.querySelector('#pin-error'); err.textContent='';
    const pin=String(new FormData(e.currentTarget).get('pin')).trim(); btn.disabled=true; btn.textContent='Memverifikasi…';
    try {
      const {data,error}=await supabase.rpc('check_in_with_pin',{pin_input:pin});
      if(error) throw error;
      notify('Absensi berhasil dicatat. Terima kasih!');
      await attendancePage();
    } catch(ex) { err.textContent=ex.message||'PIN tidak valid atau sudah kedaluwarsa.'; btn.disabled=false; btn.innerHTML='Konfirmasi Kehadiran <span>→</span>'; }
  };
}
async function membersPage() {
  const {data:members,error}=await supabase.from('profiles').select('id,full_name,nim,email,division,role,created_at').order('created_at',{ascending:false}).limit(1000);
  if(error) notify(error.message,'error');
  const content=`${pageTitle('Data Anggota','Kelola dan pantau akun anggota yang terdaftar.')}<section class="panel"><div class="toolbar"><div class="searchbox">⌕ <input id="member-search" placeholder="Cari nama, NIM, atau divisi…"></div><span class="count-pill">${members?.length||0} anggota</span><button class="btn btn-outline" id="export-members">↓ Ekspor CSV</button></div>
  <div class="table-wrap"><table id="members-table"><thead><tr><th>NAMA ANGGOTA</th><th>NIM / ID</th><th>DIVISI</th><th>PERAN</th><th>TANGGAL DAFTAR</th></tr></thead><tbody>${(members||[]).map(m=>`<tr data-search="${esc([m.full_name,m.nim,m.email,m.division,m.role].join(' ').toLowerCase())}"><td><div class="person-cell"><div class="avatar small">${esc(initials(m.full_name))}</div><div><strong>${esc(m.full_name||'—')}</strong><span class="subline">${esc(m.email||'')}</span></div></div></td><td>${esc(m.nim||'—')}</td><td><span class="division-tag">${esc(m.division||'—')}</span></td><td><span class="role-pill">${esc(roleLabels[m.role]||m.role||'Anggota')}</span></td><td>${m.created_at?dateOnly(m.created_at):'—'}</td></tr>`).join('')}</tbody></table></div>
  <div class="table-foot">Data disinkronkan langsung dari database. Perubahan akun baru akan muncul secara real-time.</div></section>`;
  shell(content);
  document.querySelector('#member-search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('#members-table tbody tr').forEach(r=>r.hidden=!r.dataset.search.includes(q));});
  document.querySelector('#export-members').onclick=()=>downloadCSV('anggota-puma-it.csv',[['Nama','NIM/ID','Email','Divisi','Peran','Tanggal Daftar'],...(members||[]).map(m=>[m.full_name,m.nim,m.email,m.division,roleLabels[m.role]||m.role,m.created_at])]);
}
function downloadCSV(name,rows) { const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n'); const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));a.download=name;a.click();URL.revokeObjectURL(a.href); }
async function sessionsPage() {
  const {data:sessions,error}=await supabase.from('attendance_sessions').select('*').order('created_at',{ascending:false}).limit(100);
  if(error) notify(error.message,'error');
  const content=`${pageTitle('Kode & QR Absensi','Buat PIN dan QR untuk kegiatan. Fitur ini hanya tersedia bagi ADMIN.', '<span class="admin-only-tag">♙ ADMIN</span>')}
  <div class="session-admin-grid"><section class="panel create-panel"><div class="panel-heading"><div><h3>Buat sesi baru</h3><p>Atur masa berlaku kode kehadiran</p></div><div class="panel-icon">＋</div></div>
  <form id="create-session" class="form-stack"><label>Nama kegiatan<input name="title" placeholder="Contoh: Rapat Kerja PUMA IT" required maxlength="100"></label><label>Deskripsi <span class="optional">(opsional)</span><textarea name="description" rows="2" placeholder="Informasi singkat kegiatan…"></textarea></label><div class="two-fields"><label>Mulai<input name="starts" type="datetime-local" required></label><label>Berlaku (menit)<select name="duration"><option value="15">15 menit</option><option value="30" selected>30 menit</option><option value="60">1 jam</option><option value="120">2 jam</option><option value="360">6 jam</option><option value="1440">24 jam</option></select></label></div><button class="btn btn-primary btn-full">＋ Buat PIN & QR</button><div id="session-error" class="form-error"></div></form><div class="admin-hint">🔒 PIN hanya disimpan di database dan dapat digunakan selama masa berlaku sesi.</div></section>
  <section class="panel qr-panel"><div class="panel-heading"><div><h3>Pratinjau kode</h3><p>QR siap ditampilkan atau dibagikan</p></div></div><div id="qr-result" class="qr-empty"><div class="qr-placeholder">▦</div><strong>Belum ada QR dibuat</strong><p>Buat sesi baru untuk menghasilkan QR dan PIN.</p></div></section></div>
  <section class="panel sessions-table-panel"><div class="panel-heading"><div><h3>Daftar sesi absensi</h3><p>Riwayat sesi yang dibuat</p></div><span class="count-pill">${sessions?.length||0} sesi</span></div>
  <div class="table-wrap"><table><thead><tr><th>NAMA KEGIATAN</th><th>PIN</th><th>MULAI</th><th>KEDALUWARSA</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>${(sessions||[]).map(s=>`<tr><td><strong>${esc(s.title)}</strong><span class="subline">${esc(s.description||'')}</span></td><td><span class="pin-masked">${s.is_active?'••••••':'—'}</span></td><td>${fmt(s.starts_at)}</td><td>${fmt(s.expires_at)}</td><td><span class="status ${s.is_active&&new Date(s.expires_at)>new Date()?'status-present':'status-muted'}">${s.is_active&&new Date(s.expires_at)>new Date()?'Aktif':'Selesai'}</span></td><td><button class="mini-btn end-session" data-id="${s.id}" ${s.is_active?'':'disabled'}>Akhiri</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty-cell">Belum ada sesi absensi.</td></tr>'}</tbody></table></div></section>`;
  shell(content);
  document.querySelector('#create-session').onsubmit=async e=>{
    e.preventDefault(); const fd=new FormData(e.currentTarget), btn=e.currentTarget.querySelector('button'), err=document.querySelector('#session-error'); err.textContent='';
    const starts=new Date(fd.get('starts')), duration=Number(fd.get('duration')); if(Number.isNaN(starts.getTime())){err.textContent='Waktu mulai tidak valid.';return;}
    const pin=String(Math.floor(100000+Math.random()*900000)); btn.disabled=true;btn.textContent='Membuat sesi…';
    try {
      const {data,error}=await supabase.rpc('create_attendance_session',{title_input:String(fd.get('title')).trim(),description_input:String(fd.get('description')||''),starts_at_input:starts.toISOString(),expires_at_input:new Date(starts.getTime()+duration*60000).toISOString(),pin_input:pin});
      if(error) throw error;
      const item=Array.isArray(data)?data[0]:data;
      await renderQrResult({title:String(fd.get('title')).trim(),pin,starts:starts.toISOString(),expires:new Date(starts.getTime()+duration*60000).toISOString(),id:item?.id});
      notify('Sesi absensi berhasil dibuat.');
      activeTab='sessions';
    } catch(ex) { err.textContent=ex.message||'Gagal membuat sesi.'; }
    finally {btn.disabled=false;btn.innerHTML='＋ Buat PIN & QR';}
  };
  document.querySelectorAll('.end-session').forEach(b=>b.onclick=async()=>{if(!confirm('Akhiri sesi absensi ini?'))return;const {error}=await supabase.rpc('end_attendance_session',{session_id_input:b.dataset.id});if(error)notify(error.message,'error');else{notify('Sesi telah diakhiri.');await sessionsPage();}});
}
async function renderQrResult(s) {
  const payload=JSON.stringify({type:'PUMA_IT_ATTENDANCE',session_id:s.id,pin:s.pin});
  const dataUrl=await QRCode.toDataURL(payload,{width:250,margin:2,color:{dark:'#172d3b',light:'#ffffff'},errorCorrectionLevel:'H'});
  const node=document.querySelector('#qr-result'); if(!node)return;
  node.className='qr-result';node.innerHTML=`<div class="qr-event">${esc(s.title)}</div><img class="qr-image" src="${dataUrl}" alt="QR absensi ${esc(s.title)}"><div class="pin-label">PIN ABSENSI</div><div class="pin-digits">${s.pin.split('').join(' ')}</div><div class="qr-valid">BERLAKU SAMPAI<br><strong>${fmt(s.expires)}</strong></div><div class="qr-actions"><button class="btn btn-primary" id="download-qr">↓ Unduh QR</button><button class="btn btn-outline" id="print-qr">Cetak</button></div><p class="qr-note">Jangan bagikan PIN ke pihak di luar anggota kegiatan.</p>`;
  document.querySelector('#download-qr').onclick=()=>{const a=document.createElement('a');a.href=dataUrl;a.download='qr-absensi-puma-it.png';a.click();};
  document.querySelector('#print-qr').onclick=()=>window.print();
}
async function renderTab() {
  if(!session||!profile)return;
  if(activeTab==='members'&&profile.role!=='admin')activeTab='dashboard';
  if(activeTab==='sessions'&&profile.role!=='admin')activeTab='dashboard';
  if(activeTab==='dashboard')await dashboard();
  else if(activeTab==='attendance')await attendancePage();
  else if(activeTab==='members')await membersPage();
  else if(activeTab==='sessions')await sessionsPage();
}
function startRealtime() {
  if(liveChannel) supabase.removeChannel(liveChannel);
  liveChannel=supabase.channel('puma-it-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'profiles'},()=>{if(activeTab==='dashboard'||activeTab==='members')renderTab();})
    .on('postgres_changes',{event:'*',schema:'public',table:'attendance'},()=>{if(activeTab==='dashboard'||activeTab==='attendance')renderTab();})
    .on('postgres_changes',{event:'*',schema:'public',table:'attendance_sessions'},()=>{if(activeTab==='dashboard'||activeTab==='attendance'||activeTab==='sessions')renderTab();})
    .subscribe();
}
async function boot() {
  if(!configured) { setupPage(); return; }
  const {data:{session:current}}=await supabase.auth.getSession(); session=current;
  supabase.auth.onAuthStateChange((_event,newSession)=>{session=newSession;setTimeout(()=>newSession?loadProfile():authPage('login'),0);});
  if(session) await loadProfile(); else authPage('login');
}
async function loadProfile() {
  if(!session) return;
  const {data,error}=await supabase.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
  if(error){authPage('login');notify('Tidak dapat memuat profil: '+error.message,'error');return;}
  if(!data) {
    const meta=session.user.user_metadata||{};
    const {error:insertError}=await supabase.from('profiles').upsert({id:session.user.id,full_name:meta.full_name||session.user.email?.split('@')[0]||'Anggota',nim:meta.nim||'',division:meta.division||'Internal',role:'member',email:session.user.email});
    if(insertError){authPage('login');notify('Profil belum siap. Coba login ulang.','error');return;}
    const {data:again}=await supabase.from('profiles').select('*').eq('id',session.user.id).single();profile=again;
  } else profile=data;
  activeTab='dashboard'; startRealtime(); await renderTab();
}
function setupPage() {
  app.innerHTML=`<div class="setup-screen"><div class="setup-card">${logo(60)}<div class="eyebrow">PUMA IT PEKANBARU</div><h1>Hubungkan database</h1><p>Aplikasi sudah siap. Hubungkan project Supabase agar login, data anggota, PIN, QR, dan sinkronisasi real-time berfungsi untuk seluruh anggota.</p><ol><li>Buat project di <a href="https://supabase.com" target="_blank" rel="noreferrer">Supabase</a>.</li><li>Jalankan SQL dari file <code>supabase/schema.sql</code> di SQL Editor.</li><li>Salin <code>.env.example</code> menjadi <code>.env</code> dan isi URL serta publishable/anon key project.</li><li>Jalankan ulang aplikasi dengan <code>npm run dev</code>.</li></ol><div class="setup-warning">Untuk keamanan, jangan pernah menaruh service_role key di frontend.</div><p class="setup-small">Panduan lengkap ada di README.md dalam paket aplikasi.</p></div></div>`;
}
boot();