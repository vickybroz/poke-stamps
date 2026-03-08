drop policy if exists "staff_can_view_all_profiles" on public.profiles;
drop policy if exists "staff_can_update_profiles" on public.profiles;

create or replace function public.is_staff(user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where auth_user_id = user_id
      and status = 'active'
      and role in ('admin', 'mod')
  );
$$;

create or replace function public.is_admin_profile(user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = 'admin'
  );
$$;

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  linked_auth_user_id uuid;
begin
  if not public.is_admin_profile((select id from public.profiles where auth_user_id = auth.uid() limit 1)) then
    raise exception 'No autorizado';
  end if;

  if public.is_admin_profile(target_user_id) then
    raise exception 'No se puede eliminar un usuario admin';
  end if;

  select auth_user_id
    into linked_auth_user_id
  from public.profiles
  where id = target_user_id;

  if linked_auth_user_id is null then
    delete from public.profiles where id = target_user_id;
    return;
  end if;

  delete from auth.users where id = linked_auth_user_id;
  delete from public.profiles where id = target_user_id;
end;
$$;

create or replace function public.admin_create_provisional_user(
  p_trainer_code text,
  p_trainer_name text default null,
  p_email text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  created_profile public.profiles;
  normalized_trainer_code text := regexp_replace(coalesce(p_trainer_code, ''), '\D', '', 'g');
  normalized_trainer_name text := nullif(btrim(coalesce(p_trainer_name, '')), '');
  normalized_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'No autorizado';
  end if;

  if length(normalized_trainer_code) <> 12 then
    raise exception 'Debes indicar un codigo de entrenador valido de 12 digitos';
  end if;

  insert into public.profiles (
    trainer_code,
    trainer_name,
    email,
    status,
    role
  )
  values (
    normalized_trainer_code,
    normalized_trainer_name,
    normalized_email,
    'provisional',
    'user'
  )
  returning * into created_profile;

  return created_profile;
end;
$$;

grant execute on function public.is_staff(uuid) to authenticated;
grant execute on function public.is_admin_profile(uuid) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_create_provisional_user(text, text, text) to authenticated;

create policy "staff_can_view_all_profiles"
on public.profiles
for select
to authenticated
using (public.is_staff(auth.uid()));

create policy "staff_can_update_profiles"
on public.profiles
for update
to authenticated
using (public.is_staff(auth.uid()) and not public.is_admin_profile(id))
with check (public.is_staff(auth.uid()));
