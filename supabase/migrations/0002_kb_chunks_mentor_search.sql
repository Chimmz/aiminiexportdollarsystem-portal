-- Whole-knowledge-base retrieval for the mentor chat.
--
-- schema.sql's match_kb_chunks is scoped to one batch_id — right for the
-- rag-lab's single-file "Search" tool (src/app/api/rag-lab/search/route.ts),
-- wrong for the mentor chat, which needs to search every pushed batch at
-- once. Additive only: new functions/columns, match_kb_chunks itself is
-- untouched, so the lab route keeps working exactly as before.
--
-- Idempotent like schema.sql/schema_app.sql — safe to re-run after an edit.

-- Full-text keyword search needs a tsvector column + GIN index, neither of
-- which exists yet (kb_chunks was built vector-only for the lab).
alter table kb_chunks add column if not exists content_tsv tsvector
  generated always as (to_tsvector('english', content)) stored;

create index if not exists kb_chunks_content_tsv_idx on kb_chunks using gin (content_tsv);

-- Vector half of the mentor's hybrid search — same HNSW index as
-- match_kb_chunks, just without the batch_id filter.
create or replace function match_kb_chunks_all (
  query_embedding vector(1536),
  match_count int default 25
)
returns table (
  id bigint,
  chunk_index int,
  content text,
  source_label text,
  similarity float
)
language sql stable
as $$
  select
    id,
    chunk_index,
    content,
    source_label,
    1 - (embedding <=> query_embedding) as similarity
  from kb_chunks
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Keyword half — Postgres' built-in BM25-like text ranking (ts_rank over a
-- GIN-indexed tsvector), the server-side equivalent of the rag-lab's local
-- bm25.ts. websearch_to_tsquery parses raw user text directly (quotes,
-- "-exclude", OR), so no separate tokenizer is needed on this side.
create or replace function match_kb_chunks_text (
  query_text text,
  match_count int default 25
)
returns table (
  id bigint,
  chunk_index int,
  content text,
  source_label text,
  rank float
)
language sql stable
as $$
  select
    id,
    chunk_index,
    content,
    source_label,
    ts_rank(content_tsv, websearch_to_tsquery('english', query_text)) as rank
  from kb_chunks
  where content_tsv @@ websearch_to_tsquery('english', query_text)
  order by rank desc
  limit match_count;
$$;

-- Neither function is security definer — same as match_kb_chunks, they rely
-- on kb_chunks' existing zero-policy RLS to deny anon/authenticated and are
-- only ever called with the service-role client (see createServiceClient).
