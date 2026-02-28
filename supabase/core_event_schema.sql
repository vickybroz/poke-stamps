create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at date not null,
  ends_at date,
  description text,
  image_url text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint events_dates_check check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint collections_event_name_unique unique (event_id, name)
);

create table if not exists public.stamps (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint stamps_collection_name_unique unique (collection_id, name)
);

create index if not exists idx_events_starts_at on public.events(starts_at);
create index if not exists idx_collections_event_id on public.collections(event_id);
create index if not exists idx_stamps_collection_id on public.stamps(collection_id);

alter table public.events enable row level security;
alter table public.collections enable row level security;
alter table public.stamps enable row level security;

drop policy if exists "events_select_authenticated" on public.events;
create policy "events_select_authenticated"
  on public.events
  for select
  to authenticated
  using (true);

drop policy if exists "collections_select_authenticated" on public.collections;
create policy "collections_select_authenticated"
  on public.collections
  for select
  to authenticated
  using (true);

drop policy if exists "stamps_select_authenticated" on public.stamps;
create policy "stamps_select_authenticated"
  on public.stamps
  for select
  to authenticated
  using (true);

drop policy if exists "events_write_staff" on public.events;
create policy "events_write_staff"
  on public.events
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role in ('admin', 'mod')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role in ('admin', 'mod')
    )
  );

drop policy if exists "collections_write_staff" on public.collections;
create policy "collections_write_staff"
  on public.collections
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role in ('admin', 'mod')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role in ('admin', 'mod')
    )
  );

drop policy if exists "stamps_write_staff" on public.stamps;
create policy "stamps_write_staff"
  on public.stamps
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role in ('admin', 'mod')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.role in ('admin', 'mod')
    )
  );
