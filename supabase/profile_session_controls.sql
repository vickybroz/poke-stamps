create table if not exists public.profile_session_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  force_reauth_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_profile_session_controls_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profile_session_controls_updated_at on public.profile_session_controls;
create trigger set_profile_session_controls_updated_at
before update on public.profile_session_controls
for each row
execute function public.set_profile_session_controls_updated_at();

create or replace function public.ensure_profile_session_control()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile_session_controls (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists ensure_profile_session_control on public.profiles;
create trigger ensure_profile_session_control
after insert on public.profiles
for each row
execute function public.ensure_profile_session_control();

insert into public.profile_session_controls (user_id)
select p.id
from public.profiles p
left join public.profile_session_controls c on c.user_id = p.id
where c.user_id is null;

alter table public.profile_session_controls enable row level security;

drop policy if exists "own_can_view_profile_session_controls" on public.profile_session_controls;
drop policy if exists "staff_can_view_profile_session_controls" on public.profile_session_controls;
drop policy if exists "service_role_can_manage_profile_session_controls" on public.profile_session_controls;

create policy "own_can_view_profile_session_controls"
on public.profile_session_controls
for select
to authenticated
using (auth.uid() = user_id);

create policy "staff_can_view_profile_session_controls"
on public.profile_session_controls
for select
to authenticated
using (public.is_staff(auth.uid()));

create policy "service_role_can_manage_profile_session_controls"
on public.profile_session_controls
for all
to service_role
using (true)
with check (true);

create or replace function public.mark_user_for_reauth(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'No autorizado';
  end if;

  insert into public.profile_session_controls (user_id, force_reauth_at)
  values (target_user_id, now())
  on conflict (user_id) do update
  set force_reauth_at = now(),
      updated_at = now();
end;
$$;

grant execute on function public.mark_user_for_reauth(uuid) to authenticated;
