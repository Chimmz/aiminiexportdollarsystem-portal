-- Semantic recall over profile_facts, same reasoning as messages
-- (migrations/0017): a user's fact list only ever grows for as long as
-- they keep chatting, and formatMemoryForPrompt (memory-utils.ts) sent
-- literally every one of them, every turn, forever -- exactly the kind
-- of unbounded per-turn cost WORKING_MEMORY_LIMITS already exists to
-- avoid for message history, except nothing capped this one at all.
--
-- Pure semantic here, no keyword-fusion half like
-- match_mentor_messages_text -- facts are short, structured key-value
-- pairs, not prose, so one similarity ranking already does the job
-- without the extra tsvector/GIN plumbing a keyword half would need.
--
-- Only ever called over source = 'chat_extracted' rows -- 'intake' and
-- 'user_provided' facts are always included in full regardless (see
-- getUserMemory in memory-actions.ts), so this never needs to rank or
-- exclude them.

alter table public.profile_facts add column if not exists embedding vector(1536);

create index if not exists profile_facts_embedding_idx
  on public.profile_facts using hnsw (embedding vector_cosine_ops);

-- Scoped to p_user_id so this can safely run as this table's existing
-- RLS policy would even if ever called by an authenticated client
-- directly (not security definer), same posture as match_mentor_messages
-- (migrations/0017) and match_kb_chunks (schema.sql).
create or replace function public.match_profile_facts (
  p_user_id uuid,
  query_embedding vector(1536),
  match_count int default 15
)
returns table (
  fact_type text,
  fact_value text,
  confidence real,
  source text,
  score float
)
language sql stable
as $$
  select fact_type, fact_value, confidence, source,
         1 - (embedding <=> query_embedding) as score
  from public.profile_facts
  where user_id = p_user_id
    and source = 'chat_extracted'
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
