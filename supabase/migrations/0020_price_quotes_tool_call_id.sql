-- Links a price_quotes row back to the exact calculatePricing tool call
-- that produced it, so the chat UI can tell on page load whether a given
-- PricingCalculatorPanel in message history was already completed and
-- saved -- previously there was no way to connect the two, so reloading
-- the page always re-rendered a blank, step-1 calculator even for a
-- message the user had already finished and saved, no matter what the
-- panel itself looked like.
--
-- Nullable, since rows saved before this column existed have nothing to
-- backfill it with -- those just render as a fresh calculator again on
-- reload, same as before this migration. The unique index (not a plain
-- index) also makes the save itself idempotent: PricingCalculatorPanel's
-- own Save button already disables after one successful save, but an
-- upsert on this constraint means a retried request from a flaky
-- connection updates the same row instead of creating a duplicate, rather
-- than relying on the client-side disable alone.

alter table public.price_quotes
  add column if not exists tool_call_id text;

create unique index if not exists price_quotes_user_id_tool_call_id_idx
  on public.price_quotes (user_id, tool_call_id)
  where tool_call_id is not null;
