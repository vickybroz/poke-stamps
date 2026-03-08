create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  trainer_name text,
  trainer_code text not null,
  email text,
  status text not null default 'pending',
  active boolean not null default true,
  role text not null default 'user' check (role in ('user', 'mod', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  alter column id set default gen_random_uuid();

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists auth_user_id uuid;

alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  alter column trainer_name drop not null;

update public.profiles
set auth_user_id = id
where auth_user_id is null;

alter table public.profiles
  drop constraint if exists profiles_auth_user_id_fkey;

alter table public.profiles
  add constraint profiles_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users(id) on delete set null;

alter table public.profiles
  add column if not exists status text not null default 'pending';

alter table public.profiles
  add column if not exists active boolean not null default true;

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'mod', 'admin'));

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('active', 'pending', 'provisional', 'inactive'));

create unique index if not exists profiles_trainer_code_unique
  on public.profiles(trainer_code);

create unique index if not exists profiles_auth_user_id_unique
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

alter table public.profiles enable row level security;

create policy "users_can_view_own_profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

create policy "users_can_update_own_profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

create policy "service_role_can_manage_profiles"
  on public.profiles
  for all
  to service_role
  using (true)
  with check (true);
