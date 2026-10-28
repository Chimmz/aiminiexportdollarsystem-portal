-- payments.lead_id was `not null` on the assumption every payment
-- originates from the mini-export-web sales funnel (which only ever has a
-- lead, never a real user). That's no longer true: the dashboard Upgrade
-- page now lets an already-signed-in member buy/renew a plan directly,
-- with no lead involved at all — only a user_id. Relax the column and
-- require at least one of the two instead of forcing a synthetic lead row
-- for a purchase that was never a funnel lead to begin with.

alter table public.payments alter column lead_id drop not null;

alter table public.payments
  drop constraint if exists payments_lead_or_user_id_check;
alter table public.payments
  add constraint payments_lead_or_user_id_check
  check (lead_id is not null or user_id is not null);
