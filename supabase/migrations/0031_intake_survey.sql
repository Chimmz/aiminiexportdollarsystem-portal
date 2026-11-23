-- A short, gated questionnaire shown on first login (not tied to a login
-- count -- a single completed/not-completed flag is all this needs, same
-- shape as users.activated_at). See src/app/onboarding for the flow and
-- src/lib/actions/intake-actions.ts for the write path.
alter table public.users
  add column if not exists intake_completed_at timestamptz;

-- Answers themselves reuse profile_facts (already a generic per-user
-- key-value store, see its own comment in schema_app.sql) rather than a
-- new table -- a new source value just marks where each fact came from.
-- Kept distinct from 'user_provided' (the chat-controls rail's manual
-- "add a fact" form) specifically so memory-utils.ts's hasNoMemory can
-- exclude intake answers from counting as "this user has prior memory" --
-- every new user will have intake facts, but that must never suppress the
-- real FIRST MESSAGE EVER treatment (config.ts) on their first actual chat
-- turn.
alter table public.profile_facts
  drop constraint if exists profile_facts_source_check;
alter table public.profile_facts
  add constraint profile_facts_source_check
  check (source in ('chat_extracted', 'user_provided', 'intake'));
