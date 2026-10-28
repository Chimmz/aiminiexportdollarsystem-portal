-- Adds the keyword-search half of hybrid retrieval for the mentor chat's
-- working memory (lib/mentor/working-memory.ts) -- 0017 added the
-- semantic/vector half alone; this makes it keyword + semantic, fused by
-- the same reciprocal-rank-fusion lib/rag/retrieval already uses for
-- kb_chunks, rather than reimplementing fusion a second way. Purely
-- additive: the embedding column and its HNSW index from 0017 are
-- untouched by this file, Postgres indexes are independent per
-- column/expression, adding one never drops another.
--
-- Same content/content_tsv split kb_chunks already uses (schema.sql), not
-- a different scheme -- `content` is the plain text saveMentorMessages
-- already computes via getMessageText for a qualifying (text-only)
-- message, stored now instead of only ever turned into an embedding.

alter table public.messages add column if not exists content text;

alter table public.messages add column if not exists content_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;

create index if not exists messages_content_tsv_idx
  on public.messages using gin (content_tsv);

-- Same pool-then-rank shape as match_mentor_messages (0017): narrow to the
-- most recent pool_limit qualifying older messages first, then rank that
-- window by ts_rank -- never a search over a user's entire history. Only
-- a message with real `content` (i.e. isTextOnlyMessage was true for it
-- at save time) is ever a candidate, same as embedding is not null for
-- the vector side.
create or replace function public.match_mentor_messages_text (
  p_user_id uuid,
  query_text text,
  exclude_ids text[] default '{}',
  pool_limit int default 20,
  match_count int default 5
)
returns table (
  id text,
  role text,
  parts jsonb,
  created_at timestamptz,
  rank float
)
language sql stable
as $$
  with pool as (
    select id, role, parts, created_at, content_tsv
    from public.messages
    where user_id = p_user_id
      and content is not null
      and not (id = any (exclude_ids))
    order by created_at desc
    limit pool_limit
  )
  select id, role, parts, created_at,
         ts_rank(content_tsv, websearch_to_tsquery('english', query_text)) as rank
  from pool
  where content_tsv @@ websearch_to_tsquery('english', query_text)
  order by rank desc
  limit match_count;
$$;
