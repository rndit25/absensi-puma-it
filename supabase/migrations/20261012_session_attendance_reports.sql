-- Run once in Supabase SQL Editor to allow ADMIN/BPH to see the roster and
-- attendance records needed by per-session present/absent reports.
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

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
drop policy if exists "profiles_select_self_or_session_manager" on public.profiles;
create policy "profiles_select_self_or_session_manager" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.can_manage_attendance_sessions());

drop policy if exists "records_select_self_or_admin" on public.attendance_records;
drop policy if exists "records_select_self_or_session_manager" on public.attendance_records;
create policy "records_select_self_or_session_manager" on public.attendance_records
for select to authenticated
using (user_id = (select auth.uid()) or public.can_manage_attendance_sessions());
