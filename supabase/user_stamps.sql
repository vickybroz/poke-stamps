create extension if not exists pgcrypto;

create table if not exists public.user_stamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stamp_id uuid not null references public.stamps(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  awarded_by uuid references auth.users(id) on delete set null,
  constraint user_stamps_user_stamp_unique unique (user_id, stamp_id)
);

create index if not exists idx_user_stamps_user_id on public.user_stamps(user_id);
create index if not exists idx_user_stamps_event_id on public.user_stamps(event_id);
create index if not exists idx_user_stamps_collection_id on public.user_stamps(collection_id);
create index if not exists idx_user_stamps_stamp_id on public.user_stamps(stamp_id);

alter table public.user_stamps enable row level security;

drop policy if exists "user_stamps_select_authenticated" on public.user_stamps;
create policy "user_stamps_select_authenticated"
  on public.user_stamps
  for select
  to authenticated
  using (true);

drop policy if exists "user_stamps_write_staff" on public.user_stamps;
create policy "user_stamps_write_staff"
  on public.user_stamps
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
