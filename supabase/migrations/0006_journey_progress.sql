-- Two fixed-step progress trackers that let the mentor lead the user
-- through a known sequence instead of re-deriving "where are they" from
-- chat history on every message. Same "current status wins" shape as
-- profile_facts in schema_app.sql -- one row per (user_id, step_key).
-- Replaces the open-ended export_products/buyers tables dropped in
-- migration 0005: these steps are fixed and finite, so an explicit status
-- per step beats an open-ended extracted-entity table.
--
-- journey_setup_progress: the one-time getting-started sequence (decide
-- product -> decide country -> open domiciliary account -> create a flyer
-- and advertise), done once ever, before a user's first deal.
--
-- deal_step_progress: the repeating 5-steps-of-a-deal sequence (attract
-- buyer & quote -> get paid -> source -> pack -> ship), already baked into
-- Eva's system prompt as the COURSE MAP. Tracks a single active deal per
-- user, not deal history -- starting a new deal deletes these rows for
-- that user rather than versioning them, per the user's explicit choice of
-- "single active deal, no history" over a full deals table.
--
-- Step keys for both tables are fixed in code (src/lib/journey.ts), not
-- DB-editable, same convention as ALL_CONTACT_TYPES in src/lib/contacts.ts.

create table if not exists public.journey_setup_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  step_key text not null
    check (step_key in ('decide_product', 'decide_country', 'open_domiciliary_account', 'create_flyer_and_advertise')),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'done')),
  detail text,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, step_key)
);

create or replace trigger journey_setup_progress_set_updated_at
  before update on public.journey_setup_progress
  for each row execute function public.set_updated_at();

alter table public.journey_setup_progress enable row level security;

drop policy if exists "journey setup progress full access on own row" on public.journey_setup_progress;
create policy "journey setup progress full access on own row"
  on public.journey_setup_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.deal_step_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  step_key text not null
    check (step_key in ('attract_buyer_and_quote', 'get_paid', 'source', 'pack', 'ship')),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'done')),
  detail text,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, step_key)
);

create or replace trigger deal_step_progress_set_updated_at
  before update on public.deal_step_progress
  for each row execute function public.set_updated_at();

alter table public.deal_step_progress enable row level security;

drop policy if exists "deal step progress full access on own row" on public.deal_step_progress;
create policy "deal step progress full access on own row"
  on public.deal_step_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
