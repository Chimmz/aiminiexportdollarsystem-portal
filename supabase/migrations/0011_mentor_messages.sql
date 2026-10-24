-- Persisted mentor chat history -- replaces the "deliberately NOT in here
-- yet" note on this in schema_app.sql now that /api/mentor/chat actually
-- writes it (this file is the incremental addition per CLAUDE.md's
-- migration convention; schema_app.sql itself is never edited after the
-- fact).
--
-- One row per UI message, not per model turn -- a single assistant
-- UIMessage can bundle several tool calls plus the final reply text into
-- one `parts` array, matching exactly what the client already renders as
-- one bubble (see ai-elements/message.tsx). `id` is text, not uuid: the
-- AI SDK's default client-side id generator (createIdGenerator in
-- @ai-sdk/provider-utils) produces a 16-char alphanumeric string, not a
-- UUID, and that client-generated id is what this table's primary key
-- has to match for upsert-by-id to work.
--
-- One flat table, not a conversations+messages pair -- this app has
-- exactly one ongoing mentor conversation per user (no thread-list UI),
-- so a conversations table would carry a foreign key nothing ever
-- branches on. `seq` (not created_at) is what orders messages on read --
-- an identity column is guaranteed strictly increasing even when two rows
-- from the same request land on the same rounded timestamp.

create table if not exists public.messages (
  id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  parts jsonb not null,
  seq bigint generated always as identity,
  created_at timestamptz not null default now()
);

create index if not exists messages_user_id_seq_idx on public.messages (user_id, seq);

alter table public.messages enable row level security;

drop policy if exists "messages full access on own row" on public.messages;
create policy "messages full access on own row"
  on public.messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
