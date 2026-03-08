drop policy if exists "storage_select_poke_stamp_images_staff_only" on storage.objects;
drop policy if exists "storage_insert_poke_stamp_images_staff_only" on storage.objects;
drop policy if exists "storage_update_poke_stamp_images_staff_only" on storage.objects;
drop policy if exists "storage_delete_poke_stamp_images_staff_only" on storage.objects;
drop policy if exists "public_read_poke_stamp_images" on storage.objects;
drop policy if exists "staff_insert_poke_stamp_images" on storage.objects;
drop policy if exists "staff_update_poke_stamp_images" on storage.objects;
drop policy if exists "staff_delete_poke_stamp_images" on storage.objects;

drop function if exists public.admin_list_users();
drop function if exists public.admin_get_albums();
drop function if exists public.admin_get_events_overview();
drop function if exists public.admin_get_collections_overview();
drop function if exists public.admin_get_stamps_overview();
drop function if exists public.admin_identify_stamp(text);
drop function if exists public.admin_get_image_bucket_usage();
drop function if exists public.admin_get_logs(date, text, text, text, text, text, text, text, integer, integer);

create policy "storage_select_poke_stamp_images_staff_only"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'poke-stamp-images'
  and public.is_staff(auth.uid())
);

create policy "storage_insert_poke_stamp_images_staff_only"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'poke-stamp-images'
  and public.is_staff(auth.uid())
);

create policy "storage_update_poke_stamp_images_staff_only"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'poke-stamp-images'
  and public.is_staff(auth.uid())
)
with check (
  bucket_id = 'poke-stamp-images'
  and public.is_staff(auth.uid())
);

create policy "storage_delete_poke_stamp_images_staff_only"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'poke-stamp-images'
  and public.is_staff(auth.uid())
);

create or replace function public.admin_list_users()
returns table (
  id uuid,
  auth_user_id uuid,
  trainer_name text,
  trainer_code text,
  email text,
  role text,
  status text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.auth_user_id,
    p.trainer_name,
    p.trainer_code,
    p.email,
    p.role,
    p.status
  from public.profiles p
  where public.is_staff(auth.uid())
  order by p.trainer_name asc;
$$;

grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_get_albums()
returns table (
  event_id uuid,
  event_name text,
  event_starts_at date,
  event_ends_at date,
  event_description text,
  event_image_url text,
  collection_id uuid,
  collection_name text,
  collection_description text,
  collection_image_url text,
  stamp_id uuid,
  stamp_name text,
  stamp_description text,
  stamp_image_url text
)
language sql
security definer
set search_path = public
as $$
  select
    e.id as event_id,
    e.name as event_name,
    e.starts_at as event_starts_at,
    e.ends_at as event_ends_at,
    e.description as event_description,
    e.image_url as event_image_url,
    c.id as collection_id,
    c.name as collection_name,
    c.description as collection_description,
    c.image_url as collection_image_url,
    s.id as stamp_id,
    s.name as stamp_name,
    s.description as stamp_description,
    s.image_url as stamp_image_url
  from public.event_collections ec
  join public.events e on e.id = ec.event_id
  join public.collections c on c.id = ec.collection_id
  left join public.collection_stamps cs on cs.collection_id = c.id
  left join public.stamps s on s.id = cs.stamp_id
  where public.is_staff(auth.uid())
  order by e.starts_at desc, e.name, c.name, s.name;
$$;

grant execute on function public.admin_get_albums() to authenticated;

create or replace function public.admin_get_events_overview()
returns table (
  event_id uuid,
  event_name text,
  event_starts_at date,
  event_ends_at date,
  event_description text,
  event_image_url text,
  collection_id uuid,
  collection_name text
)
language sql
security definer
set search_path = public
as $$
  select
    e.id as event_id,
    e.name as event_name,
    e.starts_at as event_starts_at,
    e.ends_at as event_ends_at,
    e.description as event_description,
    e.image_url as event_image_url,
    c.id as collection_id,
    c.name as collection_name
  from public.events e
  left join public.event_collections ec on ec.event_id = e.id
  left join public.collections c on c.id = ec.collection_id
  where public.is_staff(auth.uid())
  order by e.starts_at desc, e.name, c.name;
$$;

grant execute on function public.admin_get_events_overview() to authenticated;

create or replace function public.admin_get_collections_overview()
returns table (
  collection_id uuid,
  collection_name text,
  collection_description text,
  collection_image_url text,
  event_id uuid,
  event_name text,
  stamp_id uuid,
  stamp_name text,
  stamp_description text,
  stamp_image_url text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id as collection_id,
    c.name as collection_name,
    c.description as collection_description,
    c.image_url as collection_image_url,
    e.id as event_id,
    e.name as event_name,
    s.id as stamp_id,
    s.name as stamp_name,
    s.description as stamp_description,
    s.image_url as stamp_image_url
  from public.collections c
  left join public.event_collections ec on ec.collection_id = c.id
  left join public.events e on e.id = ec.event_id
  left join public.collection_stamps cs on cs.collection_id = c.id
  left join public.stamps s on s.id = cs.stamp_id
  where public.is_staff(auth.uid())
  order by c.name, e.name, s.name;
$$;

grant execute on function public.admin_get_collections_overview() to authenticated;

create or replace function public.admin_get_stamps_overview()
returns table (
  stamp_id uuid,
  stamp_name text,
  stamp_description text,
  stamp_image_url text,
  collection_id uuid,
  collection_name text
)
language sql
security definer
set search_path = public
as $$
  select
    s.id as stamp_id,
    s.name as stamp_name,
    s.description as stamp_description,
    s.image_url as stamp_image_url,
    c.id as collection_id,
    c.name as collection_name
  from public.stamps s
  left join public.collection_stamps cs on cs.stamp_id = s.id
  left join public.collections c on c.id = cs.collection_id
  where public.is_staff(auth.uid())
  order by s.name, c.name;
$$;

grant execute on function public.admin_get_stamps_overview() to authenticated;

create or replace function public.admin_get_image_bucket_usage()
returns table (
  used_bytes bigint,
  object_count bigint
)
language sql
security definer
set search_path = public, storage
as $$
  select
    coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0)::bigint as used_bytes,
    count(*)::bigint as object_count
  from storage.objects o
  where public.is_staff(auth.uid())
    and o.bucket_id = 'poke-stamp-images';
$$;

grant execute on function public.admin_get_image_bucket_usage() to authenticated;

create or replace function public.admin_identify_stamp(
  p_claim_code text
)
returns table (
  id uuid,
  claim_code text,
  awarded_at timestamptz,
  event_id uuid,
  event_name text,
  collection_id uuid,
  collection_name text,
  stamp_id uuid,
  stamp_name text,
  stamp_image_url text,
  delivered_to_id uuid,
  delivered_to_name text,
  delivered_to_code text,
  delivered_to_status text,
  delivered_by_id uuid,
  delivered_by_name text,
  delivered_by_code text,
  delivered_by_role text
)
language sql
security definer
set search_path = public
as $$
  select
    us.id,
    us.claim_code,
    us.awarded_at,
    e.id as event_id,
    e.name as event_name,
    c.id as collection_id,
    c.name as collection_name,
    s.id as stamp_id,
    s.name as stamp_name,
    s.image_url as stamp_image_url,
    recipient.id as delivered_to_id,
    recipient.trainer_name as delivered_to_name,
    recipient.trainer_code as delivered_to_code,
    recipient.status as delivered_to_status,
    awarder.id as delivered_by_id,
    awarder.trainer_name as delivered_by_name,
    awarder.trainer_code as delivered_by_code,
    awarder.role as delivered_by_role
  from public.user_stamps us
  join public.events e on e.id = us.event_id
  join public.collections c on c.id = us.collection_id
  join public.stamps s on s.id = us.stamp_id
  join public.profiles recipient on recipient.id = us.user_id
  left join public.profiles awarder on awarder.id = us.awarded_by
  where public.is_staff(auth.uid())
    and us.claim_code = upper(trim(coalesce(p_claim_code, '')))
  limit 1;
$$;

grant execute on function public.admin_identify_stamp(text) to authenticated;

create or replace function public.admin_get_logs(
  p_awarded_at date default null,
  p_stamp_name text default null,
  p_collection_name text default null,
  p_event_name text default null,
  p_trainer_code text default null,
  p_delivered_to text default null,
  p_delivered_by text default null,
  p_claim_code text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  id uuid,
  awarded_at timestamptz,
  claim_code text,
  event_name text,
  collection_name text,
  stamp_name text,
  trainer_code text,
  delivered_to text,
  delivered_by text,
  total_count bigint
)
language sql
security definer
set search_path = public
as $$
  with filtered as (
    select
      us.id,
      us.awarded_at,
      us.claim_code,
      e.name as event_name,
      c.name as collection_name,
      s.name as stamp_name,
      recipient.trainer_code,
      recipient.trainer_name as delivered_to,
      coalesce(awarder.trainer_name, '-') as delivered_by
    from public.user_stamps us
    join public.events e on e.id = us.event_id
    join public.collections c on c.id = us.collection_id
    join public.stamps s on s.id = us.stamp_id
    join public.profiles recipient on recipient.id = us.user_id
    left join public.profiles awarder on awarder.id = us.awarded_by
    where public.is_staff(auth.uid())
      and (p_awarded_at is null or us.awarded_at >= p_awarded_at::timestamptz)
      and (p_awarded_at is null or us.awarded_at < (p_awarded_at::timestamptz + interval '1 day'))
      and (p_stamp_name is null or s.name ilike '%' || p_stamp_name || '%')
      and (p_collection_name is null or c.name ilike '%' || p_collection_name || '%')
      and (p_event_name is null or e.name ilike '%' || p_event_name || '%')
      and (p_trainer_code is null or recipient.trainer_code ilike '%' || p_trainer_code || '%')
      and (p_delivered_to is null or recipient.trainer_name ilike '%' || p_delivered_to || '%')
      and (p_delivered_by is null or coalesce(awarder.trainer_name, '') ilike '%' || p_delivered_by || '%')
      and (p_claim_code is null or us.claim_code ilike '%' || p_claim_code || '%')
  ),
  counted as (
    select
      filtered.*,
      count(*) over() as total_count
    from filtered
  )
  select
    counted.id,
    counted.awarded_at,
    counted.claim_code,
    counted.event_name,
    counted.collection_name,
    counted.stamp_name,
    counted.trainer_code,
    counted.delivered_to,
    counted.delivered_by,
    counted.total_count
  from counted
  order by counted.awarded_at desc
  offset greatest((coalesce(p_page, 1) - 1) * coalesce(p_page_size, 20), 0)
  limit greatest(coalesce(p_page_size, 20), 1);
$$;

grant execute on function public.admin_get_logs(date, text, text, text, text, text, text, text, integer, integer) to authenticated;
