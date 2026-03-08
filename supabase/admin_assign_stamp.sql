drop function if exists public.admin_assign_stamp(text, uuid, uuid, uuid, boolean);

create or replace function public.admin_assign_stamp(
  p_trainer_code text,
  p_event_id uuid,
  p_collection_id uuid,
  p_stamp_id uuid,
  p_allow_create_provisional boolean default false
)
returns table (
  user_id uuid,
  trainer_code text,
  trainer_name text,
  created_provisional boolean,
  claim_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_trainer_code text := regexp_replace(coalesce(p_trainer_code, ''), '\D', '', 'g');
  awarder_profile_id uuid;
  target_profile public.profiles;
  created_now boolean := false;
  awarded_claim_code text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'No autorizado';
  end if;

  if length(normalized_trainer_code) <> 12 then
    raise exception 'Debes indicar un codigo de entrenador valido de 12 digitos';
  end if;

  select p.id
    into awarder_profile_id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.status = 'active'
    and p.role in ('admin', 'mod')
  limit 1;

  if awarder_profile_id is null then
    raise exception 'No autorizado';
  end if;

  if not exists (
    select 1
    from public.event_collections ec
    where ec.event_id = p_event_id
      and ec.collection_id = p_collection_id
  ) then
    raise exception 'La coleccion no pertenece al evento seleccionado';
  end if;

  if not exists (
    select 1
    from public.collection_stamps cs
    where cs.collection_id = p_collection_id
      and cs.stamp_id = p_stamp_id
  ) then
    raise exception 'La stamp no pertenece a la coleccion seleccionada';
  end if;

  select *
    into target_profile
  from public.profiles p
  where p.trainer_code = normalized_trainer_code
  limit 1;

  if target_profile.id is null then
    if not p_allow_create_provisional then
      raise exception 'El trainer code no existe. Marca la confirmacion para crear un usuario provisorio.';
    end if;

    begin
      insert into public.profiles (
        trainer_code,
        status,
        role
      )
      values (
        normalized_trainer_code,
        'provisional',
        'user'
      )
      returning * into target_profile;

      created_now := true;
    exception
      when unique_violation then
        select *
          into target_profile
        from public.profiles p
        where p.trainer_code = normalized_trainer_code
        limit 1;
    end;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = target_profile.id
      and p.status = 'inactive'
  ) then
    raise exception 'No se puede asignar una stamp a un usuario inactive';
  end if;

  if exists (
    select 1
    from public.user_stamps us
    where us.user_id = target_profile.id
      and us.event_id = p_event_id
      and us.collection_id = p_collection_id
      and us.stamp_id = p_stamp_id
  ) then
    raise exception 'Este usuario ya tiene esta stamp en esa coleccion y evento';
  end if;

  insert into public.user_stamps (
    user_id,
    event_id,
    collection_id,
    stamp_id,
    awarded_by
  )
  values (
    target_profile.id,
    p_event_id,
    p_collection_id,
    p_stamp_id,
    awarder_profile_id
  )
  returning user_stamps.claim_code into awarded_claim_code;

  return query
  select
    target_profile.id,
    target_profile.trainer_code,
    coalesce(target_profile.trainer_name, format('Trainer %s', target_profile.trainer_code)),
    created_now,
    awarded_claim_code;
end;
$$;

grant execute on function public.admin_assign_stamp(text, uuid, uuid, uuid, boolean) to authenticated;
