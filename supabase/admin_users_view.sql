create or replace view public.admin_users as
select
  p.id,
  p.trainer_name,
  p.trainer_code,
  p.role,
  p.active,
  u.email
from public.profiles p
join auth.users u on u.id = p.id;

grant select on public.admin_users to authenticated;
