-- 0020's unique index was partial (`where tool_call_id is not null`), but
-- Supabase's upsert({ onConflict: 'user_id,tool_call_id' }) always sends a
-- plain `ON CONFLICT (user_id, tool_call_id)` with no WHERE clause -- it
-- doesn't know about the partial predicate, so Postgres can't match it to
-- that index and the upsert in savePriceQuote (pricing-actions.ts) fails
-- outright: "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification".
--
-- A plain (non-partial) unique constraint on (user_id, tool_call_id) gets
-- the exact same real-world behavior without needing a predicate anyway:
-- Postgres never treats two NULLs as equal for uniqueness purposes, so
-- rows with tool_call_id still null (pre-0020 legacy rows, or any future
-- edge case) stay unconstrained against each other, while a real
-- tool_call_id is still enforced unique per user. That's a strictly
-- simpler way to express what 0020 was actually going for.

drop index if exists public.price_quotes_user_id_tool_call_id_idx;

alter table public.price_quotes
  add constraint price_quotes_user_id_tool_call_id_key unique (user_id, tool_call_id);
