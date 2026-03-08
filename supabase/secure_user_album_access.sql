drop policy if exists "events_select_authenticated" on public.events;
drop policy if exists "collections_select_authenticated" on public.collections;
drop policy if exists "stamps_select_authenticated" on public.stamps;
drop policy if exists "event_collections_select_authenticated" on public.event_collections;
drop policy if exists "collection_stamps_select_authenticated" on public.collection_stamps;
drop policy if exists "user_stamps_select_authenticated" on public.user_stamps;
drop policy if exists "events_select_staff" on public.events;
drop policy if exists "collections_select_staff" on public.collections;
drop policy if exists "stamps_select_staff" on public.stamps;
drop policy if exists "event_collections_select_staff" on public.event_collections;
drop policy if exists "collection_stamps_select_staff" on public.collection_stamps;
drop policy if exists "user_stamps_select_own_or_staff" on public.user_stamps;

create or replace function public.get_my_profile_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

create policy "events_select_staff"
  on public.events
  for select
  to authenticated
  using (public.is_staff(auth.uid()));

create policy "collections_select_staff"
  on public.collections
  for select
  to authenticated
  using (public.is_staff(auth.uid()));

create policy "stamps_select_staff"
  on public.stamps
  for select
  to authenticated
  using (public.is_staff(auth.uid()));

create policy "event_collections_select_staff"
  on public.event_collections
  for select
  to authenticated
  using (public.is_staff(auth.uid()));

create policy "collection_stamps_select_staff"
  on public.collection_stamps
  for select
  to authenticated
  using (public.is_staff(auth.uid()));

create policy "user_stamps_select_own_or_staff"
  on public.user_stamps
  for select
  to authenticated
  using (user_id = public.get_my_profile_id() or public.is_staff(auth.uid()));

create or replace function public.get_my_album_entries()
returns table (
  event_id uuid,
  event_name text,
  event_starts_at date,
  event_ends_at date,
  event_image_url text,
  event_description text,
  collection_id uuid,
  collection_name text,
  collection_image_url text,
  stamp_id uuid,
  stamp_name text,
  stamp_image_url text,
  owned boolean,
  awarded_at timestamptz,
  claim_code text
)
language sql
security definer
set search_path = public
as $$
  with my_event_collections as (
    select distinct
      us.event_id,
      us.collection_id
    from public.user_stamps us
    where us.user_id = public.get_my_profile_id()
  )
  select
    e.id as event_id,
    e.name as event_name,
    e.starts_at as event_starts_at,
    e.ends_at as event_ends_at,
    e.image_url as event_image_url,
    e.description as event_description,
    c.id as collection_id,
    c.name as collection_name,
    c.image_url as collection_image_url,
    s.id as stamp_id,
    s.name as stamp_name,
    s.image_url as stamp_image_url,
    (owned_stamp.id is not null) as owned,
    owned_stamp.awarded_at,
    owned_stamp.claim_code
  from my_event_collections mec
  join public.events e on e.id = mec.event_id
  join public.collections c on c.id = mec.collection_id
  join public.collection_stamps cs on cs.collection_id = mec.collection_id
  join public.stamps s on s.id = cs.stamp_id
  left join public.user_stamps owned_stamp
    on owned_stamp.user_id = public.get_my_profile_id()
   and owned_stamp.event_id = mec.event_id
   and owned_stamp.collection_id = mec.collection_id
   and owned_stamp.stamp_id = s.id
  order by e.starts_at desc, e.name, c.name, s.name;
$$;

grant execute on function public.get_my_profile_id() to authenticated;
grant execute on function public.get_my_album_entries() to authenticated;
