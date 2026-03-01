create extension if not exists pgcrypto;

create or replace function public.generate_claim_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'PSA-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 4)) || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 4));

    exit when not exists (
      select 1
      from public.user_stamps
      where claim_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

alter table public.user_stamps
  add column if not exists claim_code text;

update public.user_stamps
set claim_code = public.generate_claim_code()
where claim_code is null;

alter table public.user_stamps
  alter column claim_code set default public.generate_claim_code();

alter table public.user_stamps
  alter column claim_code set not null;

create unique index if not exists user_stamps_claim_code_key
  on public.user_stamps(claim_code);
