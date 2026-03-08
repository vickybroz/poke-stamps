create extension if not exists pgcrypto;

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

create unique index if not exists profiles_auth_user_id_unique
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

drop policy if exists "users_can_view_own_profile" on public.profiles;
create policy "users_can_view_own_profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

drop policy if exists "users_can_update_own_profile" on public.profiles;
create policy "users_can_update_own_profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

alter table public.user_stamps
  drop constraint if exists user_stamps_user_id_fkey;

alter table public.user_stamps
  drop constraint if exists user_stamps_awarded_by_fkey;

alter table public.user_stamps
  add constraint user_stamps_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.user_stamps
  add constraint user_stamps_awarded_by_fkey
  foreign key (awarded_by) references public.profiles(id) on delete set null;
