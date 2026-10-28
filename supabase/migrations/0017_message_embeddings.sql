-- Working memory for the mentor chat (see lib/mentor/working-memory.ts):
-- an embedding per text-only message, so older history can be searched
-- semantically instead of sent to the model in full every turn. Same
-- embedding model/dimension as kb_chunks (schema.sql) -- the `vector`
-- extension is already enabled by that file, not repeated here.
--
-- Only ever populated for a message isTextOnlyMessage() (lib/utils/
-- conversation-utils.ts) considers a real candidate -- a message with any
-- tool-call/tool-result part is left null and never shows up as a match
-- below, since the recall window only ever wants to feed the model plain
-- back-and-forth, never a dangling tool part with no matching call/result
-- alongside it.

alter table public.messages add column if not exists embedding vector(1536);

create index if not exists messages_embedding_idx
  on public.messages using hnsw (embedding vector_cosine_ops);

-- One call per recent message being used as a semantic-recall query (see
-- working-memory.ts -- each recent message gets its own query, results
-- merged by score across all of them). Scoped to p_user_id so this can
-- safely run as this table's existing RLS policy would even if ever
-- called by an authenticated client directly (not security definer),
-- same posture as match_kb_chunks/match_kb_chunks_all in schema.sql.
--
-- pool_limit bounds the candidate set to the most recent N qualifying
-- older messages *before* ranking by similarity -- deliberately not a
-- search over a user's entire lifetime history, see WORKING_MEMORY_LIMITS'
-- own comment in lib/mentor/limits.ts for why. exclude_ids keeps whichever
-- messages are already in the "recent" window (verbatim, not reranked)
-- out of the pool, so nothing is ever double-counted.
create or replace function public.match_mentor_messages (
  p_user_id uuid,
  query_embedding vector(1536),
  exclude_ids text[] default '{}',
  pool_limit int default 20,
  match_count int default 5
)
returns table (
  id text,
  role text,
  parts jsonb,
  created_at timestamptz,
  score float
)
language sql stable
as $$
  with pool as (
    select id, role, parts, created_at, embedding
    from public.messages
    where user_id = p_user_id
      and embedding is not null
      and not (id = any (exclude_ids))
    order by created_at desc
    limit pool_limit
  )
  select
    id,
    role,
    parts,
    created_at,
    1 - (embedding <=> query_embedding) as score
  from pool
  order by embedding <=> query_embedding
  limit match_count;
$$;
