-- A live diagnostic turned up an auth.users row with no matching
-- public.users row (chimarokemorji@gmail.com) -- that combination can
-- only happen if the on_auth_user_created trigger below either never
-- fired or was dropped/disabled at some point. If it HAD fired and
-- thrown, the whole insert transaction, including the auth.users row
-- itself, would have rolled back, so the row wouldn't exist at all. Re-
-- asserting the function and trigger here is a safe no-op if they're
-- already correct, and recovers if either one was lost.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill every auth.users row that's currently missing its
-- public.users counterpart, so any account already stuck in this broken
-- state (not just the one that surfaced it) gets fixed without needing
-- to sign up again.
insert into public.users (id, email)
select au.id, au.email
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null
on conflict (id) do nothing;
