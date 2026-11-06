-- Moves deal tracking from "one active deal per user" (migration 0006) to
-- multiple concurrent deals, one per product -- a real user talks about
-- more than one export product over time (pricing out kilishi while still
-- mid-shipment on yam flour from before), and the old singleton model had
-- no way to keep an earlier deal's progress around once a newer product
-- came up: it just silently overwrote the same rows. See
-- journey-actions.ts's resolveDeal, manage-memory-tool.ts, and config.ts's
-- MEMORY section for the matching application-layer change.
--
-- journey_setup_progress (the one-time getting-started steps, including
-- decide_product) is untouched -- that's still a genuinely one-time,
-- per-user milestone, not per-deal.

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  product text not null,
  status text not null default 'active'
    check (status in ('active', 'done', 'abandoned')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index if not exists deals_user_id_status_idx on public.deals (user_id, status);

-- Only one ACTIVE deal per user per product at a time. resolveDeal
-- (journey-actions.ts) does a manual select-then-insert rather than an
-- upsert specifically so it can rely on this partial index for real
-- concurrency safety without hitting the ON CONFLICT-vs-partial-index
-- mismatch migration 0021 already had to fix once for price_quotes.
create unique index if not exists deals_user_id_product_active_idx
  on public.deals (user_id, lower(product))
  where status = 'active';

create or replace trigger deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

alter table public.deals enable row level security;

drop policy if exists "deals full access on own row" on public.deals;
create policy "deals full access on own row"
  on public.deals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Backfill: every user who already has deal_step_progress rows under the
-- old singleton model gets exactly one deal row, product guessed from
-- their decide_product setup step detail (small or large track, whichever
-- has one) since that's the only record of "what product" those old rows
-- were ever for -- falling back to a placeholder when even that's
-- missing. Existing rows are then all pointed at that one deal, which
-- reproduces the old "single active deal" behavior exactly, just
-- expressed as a real row instead of an implicit assumption.
alter table public.deal_step_progress add column if not exists deal_id uuid references public.deals (id) on delete cascade;

insert into public.deals (user_id, product, status)
select distinct
  dsp.user_id,
  coalesce(
    (select jsp.detail from public.journey_setup_progress jsp
       where jsp.user_id = dsp.user_id
         and jsp.step_key in ('small_decide_product', 'large_decide_product')
         and jsp.detail is not null
       limit 1),
    'Unspecified product'
  ),
  'active'
from public.deal_step_progress dsp
where dsp.deal_id is null
on conflict do nothing;

update public.deal_step_progress dsp
set deal_id = d.id
from public.deals d
where dsp.deal_id is null
  and d.user_id = dsp.user_id
  and d.status = 'active';

alter table public.deal_step_progress alter column deal_id set not null;

-- Replace the old unique(user_id, step_key) -- which assumed one deal per
-- user -- with unique(deal_id, step_key), since the same step_key now
-- legitimately repeats across a user's different concurrent deals. Looked
-- up and dropped dynamically rather than by a guessed constraint name,
-- since getting this wrong would leave the old constraint in place and
-- break every second concurrent deal's first step update.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.deal_step_progress'::regclass
      and contype = 'u'
  loop
    execute format('alter table public.deal_step_progress drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.deal_step_progress add constraint deal_step_progress_deal_id_step_key_key unique (deal_id, step_key);
