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
    where id = user_id
      and active = true
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
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'No autorizado';
  end if;

  if public.is_admin_profile(target_user_id) then
    raise exception 'No se puede eliminar un usuario admin';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

grant execute on function public.is_staff(uuid) to authenticated;
grant execute on function public.is_admin_profile(uuid) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

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
