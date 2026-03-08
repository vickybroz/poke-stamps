begin;

create extension if not exists pgcrypto;

create table if not exists public.event_collections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint event_collections_event_collection_unique unique (event_id, collection_id)
);

create table if not exists public.collection_stamps (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  stamp_id uuid not null references public.stamps(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint collection_stamps_collection_stamp_unique unique (collection_id, stamp_id)
);

create index if not exists idx_event_collections_event_id on public.event_collections(event_id);
create index if not exists idx_event_collections_collection_id on public.event_collections(collection_id);
create index if not exists idx_collection_stamps_collection_id on public.collection_stamps(collection_id);
create index if not exists idx_collection_stamps_stamp_id on public.collection_stamps(stamp_id);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'collections'
      and column_name = 'event_id'
  ) then
    insert into public.event_collections (event_id, collection_id, created_by)
    select distinct
      c.event_id,
      c.id,
      c.created_by
    from public.collections c
    where c.event_id is not null
    on conflict (event_id, collection_id) do nothing;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stamps'
      and column_name = 'collection_id'
  ) then
    insert into public.collection_stamps (collection_id, stamp_id, created_by)
    select distinct
      s.collection_id,
      s.id,
      s.created_by
    from public.stamps s
    where s.collection_id is not null
    on conflict (collection_id, stamp_id) do nothing;
  end if;
end
$$;

alter table public.user_stamps
  drop constraint if exists user_stamps_user_stamp_unique;

alter table public.user_stamps
  drop constraint if exists user_stamps_user_event_collection_stamp_unique;

drop index if exists public.user_stamps_user_event_collection_stamp_unique;

alter table public.user_stamps
  add constraint user_stamps_user_event_collection_stamp_unique
  unique (user_id, event_id, collection_id, stamp_id);

drop index if exists idx_stamps_collection_id;

alter table public.stamps
  drop constraint if exists stamps_collection_name_unique;

alter table public.stamps
  drop constraint if exists stamps_collection_id_fkey;

alter table public.stamps
  drop column if exists collection_id;

alter table public.collections
  drop constraint if exists collections_event_name_unique;

alter table public.collections
  drop constraint if exists collections_event_id_fkey;

alter table public.collections
  drop column if exists event_id;

alter table public.event_collections enable row level security;
alter table public.collection_stamps enable row level security;

drop policy if exists "event_collections_select_authenticated" on public.event_collections;
create policy "event_collections_select_authenticated"
  on public.event_collections
  for select
  to authenticated
  using (true);

drop policy if exists "collection_stamps_select_authenticated" on public.collection_stamps;
create policy "collection_stamps_select_authenticated"
  on public.collection_stamps
  for select
  to authenticated
  using (true);

drop policy if exists "event_collections_write_staff" on public.event_collections;
create policy "event_collections_write_staff"
  on public.event_collections
  for all
  to authenticated
  using (
    public.is_staff(auth.uid())
  )
  with check (
    public.is_staff(auth.uid())
  );

drop policy if exists "collection_stamps_write_staff" on public.collection_stamps;
create policy "collection_stamps_write_staff"
  on public.collection_stamps
  for all
  to authenticated
  using (
    public.is_staff(auth.uid())
  )
  with check (
    public.is_staff(auth.uid())
  );

commit;
