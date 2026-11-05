-- Replaces the separate admins table (migrations/0026) with a role
-- column on users directly, per decision to make authorization
-- role-based rather than a parallel allow-list table. Three roles: the
-- default 'user', 'staff' (reserved for future non-owner internal use,
-- not granted anywhere yet), and 'admin' (full internal access --
-- gates /dev/rag-lab for now).
alter table public.users
  add column if not exists role text not null default 'user';

alter table public.users
  drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('user', 'staff', 'admin'));

-- Putting the admin flag on the same row a signed-in user can already
-- update themselves ("users update own row", auth.uid() = id, with no
-- column restriction) is only safe because of this: without it, any
-- signed-in user could grant themselves admin with a direct client
-- update call, since RLS governs which ROW is reachable, not which
-- COLUMNS on it, and column-level grants are checked independently of
-- (and before) row policies. Revoking table-wide update and re-granting
-- it only on the columns a user is actually meant to self-edit (the
-- Account page's profile fields) closes that off. Anything added to
-- `users` later that users shouldn't be able to set themselves needs the
-- same treatment -- this is not automatic just because a column is new.
revoke update on public.users from authenticated;
grant update (full_name, company_name, phone, country, avatar_url)
  on public.users to authenticated;

-- Bootstrap admin, idempotent.
update public.users set role = 'admin' where lower(email) = lower('chimaorji25@gmail.com');

drop table if exists public.admins;
