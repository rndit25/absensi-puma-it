-- Run once in Supabase SQL Editor for an existing deployment.
-- Restrict Auth sign-ups at the database trigger, even if the client is bypassed.
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
