# Absensi PUMA IT Pekanbaru

Aplikasi React + Vite + Supabase untuk absensi anggota PUMA IT. Responsif di HP/laptop, login/registrasi, data anggota admin, PIN/QR sesi, riwayat, ekspor CSV, dan realtime.

## 1. Kebutuhan

- Node.js 20 atau lebih baru
- Project Supabase

## 2. Siapkan database

1. Buat project di https://supabase.com.
2. Buka **SQL Editor**.
3. Jalankan seluruh isi `supabase/schema.sql`.
4. Di **Project Settings → API**, salin Project URL dan publishable key (atau anon key lama).

## 3. Jalankan lokal

```bash
npm install
cp .env.example .env
```

Isi `.env`:

```env
VITE_SUPABASE_URL=https://PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=PASTE_PUBLISHABLE_OR_ANON_KEY
```

Pendaftaran hanya menerima alamat email dengan domain `@student.president.ac.id`.

Lalu:

```bash
npm run dev
```

Buka URL yang ditampilkan Vite, biasanya `http://localhost:5173`.

## 4. Jadikan akun pertama sebagai ADMIN

1. Daftar akun di website memakai email kampus dengan domain `@student.president.ac.id`.
2. Jika konfirmasi email aktif, konfirmasi dulu.
3. Buka Supabase → SQL Editor dan jalankan (ganti email):
```sql
update public.profiles
set role = 'admin', division = 'BPH'
where email = 'email-admin-kamu@example.com';
```
4. Logout/login ulang atau refresh halaman.

Jangan pernah membuka pilihan ADMIN di form publik. Role di pendaftaran otomatis `member`.

## 5. Buat sesi absensi dan atur role pengurus

Hanya ADMIN yang bisa mengubah role lewat dashboard atau membuka direktori anggota. ADMIN dan BPH dapat membuat/mengakhiri sesi absensi. Pilihan role: ADMIN, Ketua PUMA, BPH, Internal, External, R&D, RICM, Anggota.

Untuk membuat sesi, login dengan akun ber-role ADMIN atau BPH, buka menu **Sesi & Kode → Buat sesi baru**, isi nama kegiatan dan durasi, lalu pilih **Buat sesi**. Bagikan PIN enam digit atau QR yang muncul. Anggota dapat memindai QR untuk membuka portal dengan PIN terisi otomatis, atau memasukkan PIN secara manual. Sesi juga dapat diakhiri dari menu yang sama.

Jika project Supabase sudah memakai schema lama, jalankan `supabase/migrations/20261011_bph_session_management.sql` sekali di SQL Editor agar pemeriksaan role BPH pada fungsi database ikut diperbarui. Akun anggota BPH harus diberi role `bph` oleh ADMIN sebelum dapat mengelola sesi.

Laporan per sesi memerlukan akses roster dan catatan absensi untuk pengelola sesi. Untuk project yang sudah berjalan, jalankan `supabase/migrations/20261012_session_attendance_reports.sql` di SQL Editor. Laporan menampilkan anggota yang hadir dan anggota yang belum hadir; setelah sesi ditutup/kedaluwarsa, yang belum check-in ditandai tidak hadir.

Untuk project Supabase yang sudah berjalan, jalankan juga `supabase/migrations/20261011_restrict_signup_email_domain.sql` sekali di SQL Editor. Ini menerapkan validasi domain email pada trigger database; aturan di form website saja dapat dilewati.

## 6. Deploy ke Vercel / Netlify / Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Tambahkan environment variables `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
- Pastikan schema sudah dijalankan di project Supabase yang digunakan hosting.
- Di Supabase → Authentication → URL Configuration, atur Site URL dan Redirect URLs ke domain deploy.

## Catatan penting

- Jangan pernah masukkan `service_role` key ke frontend.
- QR membuka alamat portal dengan PIN sesi terisi otomatis. Jika anggota belum login, PIN tetap terisi setelah login. Kamera QR bawaan ponsel dapat membuka tautan tersebut.
- PIN dibuat dan diverifikasi di database. Sesi dibatasi durasi dan absensi ganda per sesi dicegah dengan unique constraint.
- Sebelum kegiatan resmi, uji akun anggota, akun admin, pembuatan/akhir sesi, batas waktu PIN, dan absensi ganda.
