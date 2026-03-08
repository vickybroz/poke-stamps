alter table public.profiles
  add column if not exists status text;

update public.profiles
set status = case
  when auth_user_id is null then 'provisional'
  when coalesce(active, false) = true then 'active'
  else 'pending'
end
where status is null;

alter table public.profiles
  alter column status set default 'pending';

update public.profiles
set active = (status = 'active')
where active is distinct from (status = 'active');

alter table public.profiles
  alter column status set not null;

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('active', 'pending', 'provisional', 'inactive'));

drop function if exists public.sync_profile_active_from_status();
create or replace function public.sync_profile_active_from_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.active := (new.status = 'active');
  return new;
end;
$$;

drop trigger if exists sync_profile_active_from_status on public.profiles;
create trigger sync_profile_active_from_status
before insert or update of status
on public.profiles
for each row
execute function public.sync_profile_active_from_status();

drop function if exists public.admin_set_user_status(uuid, text);
create or replace function public.admin_set_user_status(
  target_user_id uuid,
  next_status text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles;
  target_profile public.profiles;
  normalized_next_status text := lower(btrim(coalesce(next_status, '')));
  updated_profile public.profiles;
begin
  select *
    into actor_profile
  from public.profiles
  where auth_user_id = auth.uid()
  limit 1;

  if actor_profile.id is null or actor_profile.role not in ('admin', 'mod') or actor_profile.status <> 'active' then
    raise exception 'No autorizado';
  end if;

  if normalized_next_status not in ('active', 'inactive') then
    raise exception 'Estado no soportado';
  end if;

  select *
    into target_profile
  from public.profiles
  where id = target_user_id
  limit 1;

  if target_profile.id is null then
    raise exception 'Usuario no encontrado';
  end if;

  if target_profile.role = 'admin' then
    raise exception 'No se puede modificar el estado de un admin';
  end if;

  if normalized_next_status = 'inactive' then
    update public.profiles
    set
      status = 'inactive',
      updated_at = now()
    where id = target_user_id
    returning * into updated_profile;

    return updated_profile;
  end if;

  if target_profile.status = 'inactive' and actor_profile.role <> 'admin' then
    raise exception 'Solo un admin puede reactivar usuarios inactivos';
  end if;

  if target_profile.status not in ('pending', 'inactive') then
    raise exception 'Solo se puede activar un usuario pending o inactive';
  end if;

  update public.profiles
  set
    status = 'active',
    updated_at = now()
  where id = target_user_id
  returning * into updated_profile;

  return updated_profile;
end;
$$;

grant execute on function public.admin_set_user_status(uuid, text) to authenticated;
