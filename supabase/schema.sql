-- RAG lab storage. Run this once in the Supabase SQL Editor for your project.
-- Embedding dimension is pinned to Cohere embed-v4.0's default output size (1536).
-- If you switch embedding models later, this column and the function below both
-- need to match the new model's dimension.

create extension if not exists vector;

create table if not exists kb_chunks (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  -- batch_id is random and only useful for scoping a search query (see
  -- match_kb_chunks below). batch_no is a human-friendly ordinal assigned
  -- once per embed action, via the sequence below, so the UI can show
  -- "batch 1, 2, 3..." in the order files were actually ingested.
  batch_no int,
  -- Filename/label typed in the UI when pasting a KB source file. Pasted
  -- text has no filename of its own, so this is the only record of which
  -- KB file a batch came from.
  source_label text,
  chunk_index int not null,
  content text not null,
  token_count int,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create sequence if not exists kb_batch_no_seq;

-- PostgREST/the JS client can't call nextval() on a bare sequence directly —
-- this RPC is the only way the embed route can claim the next batch_no.
create or replace function next_kb_batch_no ()
returns int
language sql
as $$
  select nextval('kb_batch_no_seq')::int;
$$;

create index if not exists kb_chunks_batch_idx on kb_chunks (batch_id);

create index if not exists kb_chunks_embedding_idx
  on kb_chunks using hnsw (embedding vector_cosine_ops);

-- No policies: this is a server-side dev tool with zero legitimate
-- end-user access — deny-by-default to anon/authenticated (who are
-- otherwise able to hit it directly via the public REST API), service
-- role only. match_kb_chunks below isn't security definer, so this also
-- covers anyone calling that RPC directly as anon/authenticated.
alter table kb_chunks enable row level security;

create or replace function match_kb_chunks (
  query_embedding vector(1536),
  match_batch_id uuid,
  match_count int default 8
)
returns table (
  id bigint,
  chunk_index int,
  content text,
  similarity float
)
language sql stable
as $$
  select
    id,
    chunk_index,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from kb_chunks
  where batch_id = match_batch_id
  order by embedding <=> query_embedding
  limit match_count;
$$;
