-- Admin flag table, to gate any future admin-only route/action (e.g. the
-- payment-reminder job discussed earlier). Deliberately not a
-- users.role column -- a separate table means "is admin" never has to be
-- threaded through getCurrentUser()/requireCurrentUser()'s cached
-- per-request query, and every other user never has an admin-related
-- column to reason about at all. Same shape as public.users itself: the
-- referenced id is the primary key, not a separate id + FK.
create table if not exists public.admins (
  user_id uuid primary key references public.users (id) on delete cascade,

  -- Who/what granted this -- null for the first, bootstrap admin, since
  -- there's no earlier admin to have granted it.
  granted_by uuid references public.users (id) on delete set null,

  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- No policies: same reasoning as leads/kb_chunks -- deny-all to
-- anon/authenticated (nobody should be able to query who's an admin via
-- the client SDK), service role only. Any admin check in app code goes
-- through the service-role client.

-- Bootstrap admin. Requires that this email has already signed in at
-- least once (so its public.users row exists via the
-- handle_new_auth_user trigger in schema_app.sql) -- idempotent, safe to
-- re-run; a no-op if the email hasn't signed in yet, not an error.
insert into public.admins (user_id)
select id from public.users where lower(email) = lower('chimaorji25@gmail.com')
on conflict (user_id) do nothing;
