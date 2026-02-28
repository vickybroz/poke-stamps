create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  trainer_name text not null,
  trainer_code text not null,
  active boolean not null default true,
  role text not null default 'user' check (role in ('user', 'mod', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists active boolean not null default true;

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'mod', 'admin'));

create unique index if not exists profiles_trainer_code_unique
  on public.profiles(trainer_code);

alter table public.profiles enable row level security;

create policy "users_can_view_own_profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "users_can_update_own_profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "service_role_can_manage_profiles"
  on public.profiles
  for all
  to service_role
  using (true)
  with check (true);
