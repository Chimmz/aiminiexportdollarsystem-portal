-- users.trial_messages_used/trial_messages_limit were never written
-- anywhere (confirmed: no INSERT/UPDATE touches them in the app, ever --
-- token_usage, added in migration 0012, already replaced them as the real
-- metering mechanism). Stuck permanently at their defaults (0 used, limit
-- 10), they weren't just dead weight -- they were silently wrong in a way
-- that mattered: user_access_status's status computation fell back to
-- `trial_messages_used < trial_messages_limit` (always true, 0 < 10)
-- whenever there was no CURRENTLY active paid period, which incorrectly
-- read as 'trial' even for a user whose paid access_period had already
-- ENDED. That meant getUserAccessTier() (user-actions.ts) returned
-- 'trial' instead of 'expired' for a lapsed paying member, so
-- checkMentorChatLimits (api/mentor/chat/_utils.ts) never hit its
-- 'expired' block -- it fell through to the trial token-budget check
-- instead, which only blocks once lifetime usage crosses
-- TRIAL_TOKEN_BUDGET. A lapsed member with modest historical usage could
-- keep chatting for free, under the (lower) trial rate-limit ceiling,
-- until they happened to cross that unrelated number.
--
-- Fix: redefine status purely from access_periods, which is the only
-- thing that actually reflects reality here -- a user who's never had any
-- access_period at all is 'trial'; one whose most recent period has
-- already ended is 'expired'; one with a period covering right now is
-- 'active'. No column on `users` is needed for this at all.

-- Redefine the view FIRST -- it's what actually references the two
-- columns below (via trial_messages_used/trial_messages_limit in the old
-- definition), so dropping them beforehand fails with "other objects
-- depend on it" (Postgres won't drop a column a view still reads, short
-- of DROP ... CASCADE, which would also blow away the view's grants and
-- isn't needed once this replaces its body to not reference them at all).
--
-- A plain CREATE OR REPLACE can't do this particular redefinition --
-- Postgres allows replacing a view's query but refuses if the new one
-- drops or reorders existing output columns (ours drops
-- trial_messages_used/trial_messages_limit/trial_has_messages_left and
-- moves paid_access_until earlier), erroring "cannot drop columns from
-- view". Drop and recreate instead -- nothing else in this schema
-- references the view itself (confirmed: no other view/function selects
-- from it), so there's nothing a plain DROP would orphan.
drop view if exists public.user_access_status;

create view public.user_access_status
  with (security_invoker = true)
as
select
  u.id as user_id,
  latest_period.ends_at as paid_access_until,
  (latest_period.ends_at is not null and latest_period.ends_at > now()) as has_active_paid_access,
  case
    when latest_period.ends_at is not null and latest_period.ends_at > now() then 'active'
    when latest_period.ends_at is not null then 'expired'
    else 'trial'
  end as status
from public.users u
left join lateral (
  select ends_at
  from public.access_periods
  where user_id = u.id and starts_at is not null
  order by ends_at desc
  limit 1
) latest_period on true;

alter table public.users drop column if exists trial_messages_used;
alter table public.users drop column if exists trial_messages_limit;
