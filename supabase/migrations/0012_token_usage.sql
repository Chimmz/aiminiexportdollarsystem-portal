-- Real, provider-reported token usage, one append-only row per mentor
-- chat turn -- backs two independent checks in /api/mentor/chat, not one:
-- a trial user's lifetime budget (never resets, replaces the unused
-- trial_messages_used/trial_messages_limit message-count columns on
-- users) and a rolling-window abuse rate limit that applies to trial and
-- paid users alike (does reset, protects the AI Gateway bill from being
-- hammered regardless of plan status). Both are just SUM(tokens) queries
-- against this table with a different WHERE clause -- no denormalized
-- counter to keep in sync, no race condition to guard against with an
-- atomic increment. Same append-only shape as price_quotes.
--
-- Only ever written by the server (service-role client, from
-- route.ts's streamText onFinish) -- RLS here is read-only for the
-- owning user (e.g. a future usage-history UI), never write, so a client
-- can't fake a low number to dodge its own limit.

create table if not exists public.token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  tokens int not null,
  created_at timestamptz not null default now()
);

create index if not exists token_usage_user_id_created_at_idx
  on public.token_usage (user_id, created_at);

alter table public.token_usage enable row level security;

drop policy if exists "token usage select own row" on public.token_usage;
create policy "token usage select own row"
  on public.token_usage for select
  using (auth.uid() = user_id);
