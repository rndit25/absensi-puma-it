-- PUMA IT Pekanbaru — jalankan seluruh file ini di Supabase SQL Editor.
-- Aman untuk setup awal project baru. Jangan pernah gunakan service_role key di frontend.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','ketua','bph','internal','external','rnd','ricm','member');
create type public.app_division as enum ('BPH','Internal','External','R&D','RICM');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default 'Anggota PUMA IT',
  member_id text,
  division public.app_division not null default 'BPH',
  role public.app_role not null default 'member',
  created_at timestamptz not null default now()
);

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  pin_hash text not null,
  pin_hint text not null default '••••••',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  status text not null default 'present' check (status = 'present'),
  unique (session_id, user_id)
);

create index attendance_records_user_idx on public.attendance_records(user_id, checked_in_at desc);
create index attendance_records_session_idx on public.attendance_records(session_id);
create index attendance_sessions_expiry_idx on public.attendance_sessions(expires_at desc);

-- Buat profile otomatis saat akun Auth dibuat. Role publik selalu member.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_division public.app_division;
begin
  if split_part(lower(coalesce(new.email, '')), '@', 2) <> 'student.president.ac.id' then
    raise exception 'Gunakan email kampus dengan domain @student.president.ac.id.';
  end if;
  begin
    v_division := coalesce((new.raw_user_meta_data ->> 'division')::public.app_division, 'BPH'::public.app_division);
  exception when others then
    v_division := 'BPH'::public.app_division;
  end;
  insert into public.profiles (id, email, full_name, member_id, division, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Anggota PUMA IT'),
    nullif(trim(new.raw_user_meta_data ->> 'member_id'), ''),
    v_division,
    'member'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();


-- Helper SECURITY DEFINER untuk menghindari recursive RLS saat mengecek role admin.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;
grant execute on function public.is_admin() to authenticated;

-- ADMIN dan BPH dapat mengelola sesi absensi. BPH tidak mendapat akses admin lain.
create or replace function public.can_manage_attendance_sessions()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('admin'::public.app_role, 'bph'::public.app_role)
  );
$$;
grant execute on function public.can_manage_attendance_sessions() to authenticated;

-- Jangan izinkan pengguna mengubah role/divisi sendiri melalui API.
create or replace function public.prevent_profile_privilege_change()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is not null and (
    new.role is distinct from old.role or new.division is distinct from old.division
  ) and not public.is_admin() then
    raise exception 'Role dan divisi hanya dapat diubah oleh administrator.';
  end if;
  return new;
end;
$$;

create trigger protect_profile_privileges
before update on public.profiles
for each row execute procedure public.prevent_profile_privilege_change();

alter table public.profiles enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

-- Profiles: anggota melihat dirinya sendiri; ADMIN/BPH melihat roster untuk laporan absensi.
create policy "profiles_select_self_or_session_manager" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.can_manage_attendance_sessions());

create policy "profiles_update_admin" on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Semua anggota login boleh melihat sesi, tetapi PIN hash tidak pernah dikirim ke browser.
-- Kolom pin_hash dibatasi lewat view aman; akses tabel langsung hanya admin.
create policy "sessions_select_admin" on public.attendance_sessions
for select to authenticated
using (public.is_admin());

create policy "records_select_self_or_session_manager" on public.attendance_records
for select to authenticated
using (user_id = (select auth.uid()) or public.can_manage_attendance_sessions());

-- View untuk data sesi yang boleh ditampilkan anggota.
create or replace view public.public_attendance_sessions
with (security_invoker = true) as
select id, title, pin_hint, starts_at, expires_at, ended_at, created_by, created_at
from public.attendance_sessions;

grant select on public.public_attendance_sessions to authenticated;

-- RPC: sesi aktif dapat dilihat semua anggota tanpa mengungkap hash PIN.
create or replace function public.list_attendance_sessions()
returns table (
  id uuid, title text, pin_hint text, starts_at timestamptz,
  expires_at timestamptz, ended_at timestamptz, created_by uuid, created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.title, s.pin_hint, s.starts_at, s.expires_at, s.ended_at, s.created_by, s.created_at
  from public.attendance_sessions s
  where auth.uid() is not null
  order by s.created_at desc
  limit 200;
$$;

-- RPC create: role check di server, PIN acak, yang dikembalikan hanya sekali ke pengelola sesi.
create or replace function public.admin_create_attendance_session(p_title text, p_duration_minutes integer)
returns table(session_id uuid, pin text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_pin text;
  v_id uuid;
  v_title text;
  v_duration integer;
begin
  if auth.uid() is null or not public.can_manage_attendance_sessions() then
    raise exception 'Hanya ADMIN atau BPH yang dapat membuat sesi absensi.';
  end if;
  v_title := trim(coalesce(p_title, ''));
  if char_length(v_title) < 1 or char_length(v_title) > 100 then raise exception 'Nama sesi harus 1–100 karakter.'; end if;
  v_duration := greatest(5, least(coalesce(p_duration_minutes, 60), 720));
  v_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into public.attendance_sessions(title, pin_hash, expires_at, created_by)
  values (v_title, encode(extensions.digest(v_pin, 'sha256'), 'hex'), now() + make_interval(mins => v_duration), auth.uid())
  returning id into v_id;
  return query select v_id, v_pin;
end;
$$;

create or replace function public.admin_end_attendance_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_attendance_sessions() then
    raise exception 'Hanya ADMIN atau BPH yang dapat mengakhiri sesi.';
  end if;
  update public.attendance_sessions set ended_at = now()
  where id = p_session_id and ended_at is null;
  if not found then raise exception 'Sesi tidak ditemukan atau sudah diakhiri.'; end if;
end;
$$;

create or replace function public.submit_attendance_pin(p_pin text)
returns table(success boolean, message text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_session public.attendance_sessions%rowtype;
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Silakan login terlebih dahulu.'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    return query select false, 'PIN harus terdiri dari 6 digit.'; return;
  end if;
  select s.* into v_session
  from public.attendance_sessions s
  where s.pin_hash = encode(extensions.digest(p_pin, 'sha256'), 'hex')
    and s.ended_at is null and s.starts_at <= now() and s.expires_at > now()
  order by s.created_at desc limit 1;
  if not found then return query select false, 'PIN tidak valid atau sesi sudah berakhir.'; return; end if;
  insert into public.attendance_records(session_id, user_id)
  values (v_session.id, v_uid)
  on conflict (session_id, user_id) do nothing;
  if not found then return query select false, 'Akun ini sudah melakukan absensi untuk sesi tersebut.'; return; end if;
  return query select true, 'Absensi berhasil dicatat.';
end;
$$;

-- Realtime: aktifkan tabel yang perlu sinkronisasi.
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
when undefined_object then raise notice 'Publication supabase_realtime belum tersedia; aktifkan Realtime dari dashboard Supabase.';
end $$;
do $$
begin
  alter publication supabase_realtime add table public.attendance_sessions;
exception when duplicate_object then null;
when undefined_object then raise notice 'Publication supabase_realtime belum tersedia.';
end $$;
do $$
begin
  alter publication supabase_realtime add table public.attendance_records;
exception when duplicate_object then null;
when undefined_object then raise notice 'Publication supabase_realtime belum tersedia.';
end $$;

grant execute on function public.admin_create_attendance_session(text, integer) to authenticated;
grant execute on function public.admin_end_attendance_session(uuid) to authenticated;
grant execute on function public.submit_attendance_pin(text) to authenticated;
grant execute on function public.list_attendance_sessions() to authenticated;

-- PENTING: setelah akun pertama dibuat, jadikan admin lewat SQL Editor:
-- update public.profiles set role = 'admin', division = 'BPH' where email = 'email-anda@example.com';
