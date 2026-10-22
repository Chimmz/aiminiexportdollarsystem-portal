-- Core app schema: identity, billing/access, and extracted memory.
-- Run this once in the Supabase SQL Editor for your project, after
-- schema.sql (the RAG lab schema). Separate file because this is the
-- user-facing app's schema, not the RAG lab's.
--
-- Chat (conversations/messages/summaries) is deliberately NOT in here yet —
-- that shape depends on decisions we haven't made (streaming format, tool
-- calls, attachments, model/token metadata), so it'll be designed once the
-- mentor chat is actually being built, not guessed at now. That's also why
-- profile_facts below has no source_message_id column yet — it'll be added
-- via a plain ALTER TABLE once messages exists.
--
-- Design notes (read before extending this):
-- * Every public table is uuid-keyed via gen_random_uuid() — app-facing
--   ids should never leak sequential counts (contrast with kb_chunks'
--   bigint identity in schema.sql, which is an internal lab-only table).
-- * "users" is deliberately not named "buyers" — in this product, "buyer"
--   means the people *our* user (the exporter) sells to, a distinct
--   domain concept from the account-holder. Reusing the word for
--   account-holders would make every join and every conversation about
--   this schema ambiguous.
-- * Money is stored in kobo (bigint) everywhere, never floats.
-- * RLS is enabled on every table even though today the app only talks to
--   Supabase via the service-role key from server routes (service role
--   bypasses RLS). This is defense-in-depth for the day a client component
--   queries Supabase directly, not a workaround for anything missing now.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Identity: users (1:1 extension of auth.users)
-- ============================================================

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  company_name text,
  phone text,
  country text,
  avatar_url text,

  trial_messages_used int not null default 0,
  trial_messages_limit int not null default 10,

  -- Set the first time the user sends a mentor message. Paid access
  -- periods purchased before this is set stay unactivated (starts_at is
  -- null on access_periods) until this flips — see access_periods below.
  activated_at timestamptz,

  -- Soft delete: scrub full_name/email to a placeholder and disable auth
  -- sign-in (via Admin API) on delete, but keep the row and every related
  -- payments/conversations/extracted-data row intact for accounting and
  -- analytics. Never hard-delete from the app; this column is how "deleted"
  -- is represented instead.
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Auto-create the profile row the moment someone signs up via Supabase Auth
-- (magic link included) — nothing else populates public.users.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

alter table public.users enable row level security;

drop policy if exists "users select own row" on public.users;
create policy "users select own row"
  on public.users for select
  using (auth.uid() = id);

drop policy if exists "users update own row" on public.users;
create policy "users update own row"
  on public.users for update
  using (auth.uid() = id);

-- ============================================================
-- Leads: captured and paid for on the separate mini-export-web sales
-- site, which shares this Supabase project but otherwise never writes to
-- any table beyond leads/payments. Linked to a real users row only once
-- they sign in here via magic link — see the funnel_stage states below.
-- ============================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,

  -- email_captured/checkout_started/payment_failed/abandoned: written by
  -- mini-export-web's webhook server. paid: Paystack confirmed the charge,
  -- but they haven't signed in here yet (don't conflate this with
  -- "converted" — someone can sit in 'paid' for days before claiming
  -- their account, and that's a distinct, important nurture-email case).
  -- converted: this project found the lead by email on magic-link verify
  -- and linked/created a real users row.
  funnel_stage text not null default 'email_captured'
    check (funnel_stage in ('email_captured', 'checkout_started', 'payment_failed', 'abandoned', 'paid', 'converted')),

  -- Filled in by THIS project, once/if this email actually signs in and
  -- gets linked to a real account — lets you stop emailing them without
  -- deleting the marketing record.
  converted_user_id uuid references public.users (id) on delete set null,

  utm_source text,
  utm_medium text,
  utm_campaign text,

  -- Nurture-email bookkeeping.
  email_sequence_step int not null default 0,
  last_emailed_at timestamptz,
  unsubscribed boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists leads_email_unique_idx on public.leads (lower(email));

create or replace trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- No policies: leads have no auth.uid() to match against (they're not
-- signed up yet) — deny-all to anon/authenticated, service role only.
alter table public.leads enable row level security;

-- ============================================================
-- Plans, payments, access periods
-- ============================================================

create table if not exists public.plans (
  id text primary key, -- e.g. '30-day', '3-month', '6-month' — matches the upgrade page's tier ids
  label text not null,
  price_kobo bigint not null,
  duration_days int not null,
  is_recommended boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.plans (id, label, price_kobo, duration_days, is_recommended, sort_order)
values
  ('30-day', '30 Days', 950000, 30, false, 1),
  ('3-month', '3 Months', 2300000, 90, true, 2),
  ('6-month', '6 Months', 3500000, 180, false, 3)
on conflict (id) do nothing;

alter table public.plans enable row level security;

drop policy if exists "plans are publicly readable" on public.plans;
create policy "plans are publicly readable"
  on public.plans for select
  using (is_active);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),

  -- Always known: written by mini-export-web's webhook server, which only
  -- ever has a lead, never a real user.
  lead_id uuid not null references public.leads (id) on delete restrict,

  -- Backfilled by THIS project once that lead signs in and gets linked to
  -- a real users row — null until then. Drives the "payments select own
  -- row" RLS policy below, so a signed-in user can read their own history.
  user_id uuid references public.users (id) on delete cascade,

  plan_id text not null references public.plans (id),

  paystack_reference text not null unique,
  amount_kobo bigint not null,
  currency text not null default 'NGN',

  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed', 'abandoned')),
  paid_at timestamptz,
  raw_webhook_payload jsonb,

  created_at timestamptz not null default now()
);

create index if not exists payments_lead_id_idx on public.payments (lead_id);
create index if not exists payments_user_id_idx on public.payments (user_id);

alter table public.payments enable row level security;

drop policy if exists "payments select own row" on public.payments;
create policy "payments select own row"
  on public.payments for select
  using (auth.uid() = user_id);

-- Activation/extension model (implemented in app logic, not SQL — this is
-- business logic, not a constraint). Crucially, these rows don't exist
-- until a real user_id does, so none of this runs in the Paystack webhook
-- (that's mini-export-web, which only ever writes leads/payments and has
-- no user yet). It all runs in THIS project's lead-conversion flow, i.e.
-- the magic-link-verify handler that finds a lead by email:
--   * On conversion, create one access_period per 'paid' payment on that
--     lead that doesn't have one yet (oldest paid_at first), copying
--     duration_days from plans at that moment — so a later price/duration
--     change never retroactively alters a past purchase.
--   * starts_at/ends_at are null until activated.
--   * If the user has never been activated (users.activated_at is null),
--     the period stays unactivated until their first mentor message, at
--     which point users.activated_at is set and every unactivated period
--     for that user is activated in purchase order, chained back-to-back.
--   * If the user is already activated and buys again (a second
--     conversion-flow run, or a later purchase while already a member),
--     the new period chains onto the end of their latest period (or now(),
--     if none is currently running) — this is the "stacks on top" behavior.
create table if not exists public.access_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  payment_id uuid not null references public.payments (id) on delete restrict,

  duration_days int not null,
  starts_at timestamptz,
  ends_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists access_periods_user_id_idx on public.access_periods (user_id);

alter table public.access_periods enable row level security;

drop policy if exists "access periods select own row" on public.access_periods;
create policy "access periods select own row"
  on public.access_periods for select
  using (auth.uid() = user_id);

-- One row per user: current trial/paid status, derived rather than stored,
-- so nothing can drift out of sync with the underlying data.
create or replace view public.user_access_status
  with (security_invoker = true)
as
select
  u.id as user_id,
  u.trial_messages_used,
  u.trial_messages_limit,
  (u.trial_messages_used < u.trial_messages_limit) as trial_has_messages_left,
  latest_period.ends_at as paid_access_until,
  (latest_period.ends_at is not null and latest_period.ends_at > now()) as has_active_paid_access,
  case
    when latest_period.ends_at is not null and latest_period.ends_at > now() then 'active'
    when u.trial_messages_used < u.trial_messages_limit then 'trial'
    else 'expired'
  end as status
from public.users u
left join lateral (
  select ends_at
  from public.access_periods
  where user_id = u.id and starts_at is not null
  order by ends_at desc
  limit 1
) latest_period on true;

-- ============================================================
-- Extracted memory: loose profile facts
-- ============================================================
-- export_products/buyers/buyer_products used to live here as dedicated
-- tables for two "big" repeatable entities the mentor would extract, but
-- they were never given a write path and are being replaced by a
-- purpose-built, structured journey-progress table instead (predefined,
-- finite steps want an explicit status per step, not an open-ended
-- extracted-entity table) — see migrations/0005 for the drop on any
-- database that already ran the old version of this file.
--
-- profile_facts remains: a generic key-value store for loose attributes
-- (location, company size, preferred market, etc.) that don't warrant
-- their own table, so new fact types never need a migration. Current
-- value wins on every extracted row (no history of changed facts) —
-- revisit if you ever need "what did they used to say" over time.

create table if not exists public.profile_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  fact_type text not null, -- e.g. 'location', 'experience_level', 'primary_market'
  fact_value text not null,
  confidence real, -- 0..1, how sure the extraction was; null for user-provided facts

  source text not null default 'chat_extracted'
    check (source in ('chat_extracted', 'user_provided')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, fact_type)
);

create or replace trigger profile_facts_set_updated_at
  before update on public.profile_facts
  for each row execute function public.set_updated_at();

alter table public.profile_facts enable row level security;

drop policy if exists "profile facts full access on own row" on public.profile_facts;
create policy "profile facts full access on own row"
  on public.profile_facts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
