-- Run once in Supabase SQL Editor for an existing deployment.
-- BPH and ADMIN can create/end sessions; only ADMIN retains member-management access.

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
