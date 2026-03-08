create or replace view public.admin_users as
select
  p.id,
  p.trainer_name,
  p.trainer_code,
  p.role,
  p.active,
  p.auth_user_id,
  coalesce(u.email, p.email) as email
from public.profiles p
left join auth.users u on u.id = p.auth_user_id;

grant select on public.admin_users to authenticated;
