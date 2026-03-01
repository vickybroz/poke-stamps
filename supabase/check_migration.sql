select 'events' as table_name, count(*) as total from public.events
union all
select 'collections' as table_name, count(*) as total from public.collections
union all
select 'stamps' as table_name, count(*) as total from public.stamps
union all
select 'event_collections' as table_name, count(*) as total from public.event_collections
union all
select 'collection_stamps' as table_name, count(*) as total from public.collection_stamps
union all
select 'user_stamps' as table_name, count(*) as total from public.user_stamps;

select
  ec.event_id,
  e.name as event_name,
  ec.collection_id,
  c.name as collection_name
from public.event_collections ec
join public.events e on e.id = ec.event_id
join public.collections c on c.id = ec.collection_id
order by e.name, c.name;

select
  cs.collection_id,
  c.name as collection_name,
  cs.stamp_id,
  s.name as stamp_name
from public.collection_stamps cs
join public.collections c on c.id = cs.collection_id
join public.stamps s on s.id = cs.stamp_id
order by c.name, s.name;

select
  us.user_id,
  p.trainer_name,
  us.event_id,
  e.name as event_name,
  us.collection_id,
  c.name as collection_name,
  us.stamp_id,
  s.name as stamp_name,
  us.awarded_at
from public.user_stamps us
left join public.profiles p on p.id = us.user_id
join public.events e on e.id = us.event_id
join public.collections c on c.id = us.collection_id
join public.stamps s on s.id = us.stamp_id
order by us.awarded_at desc;

