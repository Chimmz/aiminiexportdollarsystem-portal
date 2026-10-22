-- The pricing calculator (calculatePricingTool / PricingCalculatorPanel)
-- writes here directly from the client on Save, not through the model --
-- the structured numbers (unit cost, margin, bank rate, both prices)
-- should be exact, and routing them through manageMemory's free-text
-- `detail` field would mean trusting the model to transcribe decimals
-- correctly into prose and back. deal_step_progress's
-- (small|large)_attract_buyer_and_quote step still gets its own short
-- human-readable note from Eva as before -- this table is the real,
-- queryable record underneath it.
--
-- One row per calculation, never updated or deduped -- unlike
-- profile_facts/deal_step_progress's "current value wins, one row per
-- key" shape, a user can have more than one product on the go and may
-- reprice the same product more than once, so this is an append-only log,
-- not current-state. product is nullable because the calculator still
-- works (and is still worth recording) even when Eva couldn't resolve a
-- product name to prefill it with.

create table if not exists public.price_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  product text,

  total_cost numeric not null,
  total_quantity numeric not null,
  unit_cost numeric not null,
  profit_margin_pct numeric not null,
  bank_rate numeric not null,
  price_ngn numeric not null,
  price_usd numeric not null,
  market_price_usd numeric, -- optional "what I found it selling for" comparison, step 4

  created_at timestamptz not null default now()
);

create index if not exists price_quotes_user_id_created_at_idx
  on public.price_quotes (user_id, created_at desc);

alter table public.price_quotes enable row level security;

drop policy if exists "price quotes full access on own row" on public.price_quotes;
create policy "price quotes full access on own row"
  on public.price_quotes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
