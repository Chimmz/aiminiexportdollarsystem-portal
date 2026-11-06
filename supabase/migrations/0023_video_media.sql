-- Curated video reference library (packaging/labeling how-to clips from
-- YouTube and Instagram), surfaced to the mentor chat the same way
-- reference photos already are -- Eva calls a searchVideos tool, which
-- does a hybrid keyword + vector search over this table and returns
-- matches to embed inline in the chat.
--
-- Unlike the Cloudinary image library (media-actions.ts), there's no API
-- to re-derive this list from live, so it isn't re-indexed on every
-- request -- it's a small, manually curated set (title, description,
-- link), seeded from a spreadsheet via a one-off ingestion script and
-- re-run whenever rows are added. Same hybrid-search shape as
-- kb_chunks/match_kb_chunks_all/match_kb_chunks_text (migration 0002) and
-- the contact directories' search_tsv columns (migration 0007), just over
-- curated video metadata instead of KB chunks or contact rows.
--
-- Idempotent like the other migrations -- safe to re-run after an edit.

create extension if not exists vector;

create table if not exists video_media (
  id bigint generated always as identity primary key,
  title text,
  description text,
  video_url text not null unique,
  -- Which platform this link is from -- resolved once at ingestion time
  -- from the URL (youtube.com/youtu.be vs instagram.com), not re-parsed
  -- on every read. Drives which embed strategy the chat UI uses per
  -- video (see src/components/tools-ui's video player, once built).
  platform text not null,
  -- Same dimension as kb_chunks.embedding -- Cohere embed-v4.0's default
  -- output size. Embeds title + description together (see the ingestion
  -- script); a row with no description still gets a usable embedding
  -- from the title alone.
  embedding vector(1536) not null,
  content_tsv tsvector
    generated always as (
      to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
    ) stored,
  created_at timestamptz not null default now()
);

create index if not exists video_media_content_tsv_idx
  on video_media using gin (content_tsv);

create index if not exists video_media_embedding_idx
  on video_media using hnsw (embedding vector_cosine_ops);

-- No policies: no legitimate end-user access path (same reasoning as
-- kb_chunks) -- deny-by-default to anon/authenticated, service role
-- only. The RPCs below aren't security definer either, so this also
-- covers anyone calling them directly as anon/authenticated.
alter table video_media enable row level security;

-- Vector half of the hybrid search.
create or replace function match_video_media_all (
  query_embedding vector(1536),
  match_count int default 10
)
returns table (
  id bigint,
  title text,
  description text,
  video_url text,
  platform text,
  similarity float
)
language sql stable
as $$
  select
    id,
    title,
    description,
    video_url,
    platform,
    1 - (embedding <=> query_embedding) as similarity
  from video_media
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Keyword half -- same websearch_to_tsquery approach as
-- match_kb_chunks_text, parses raw query text directly.
create or replace function match_video_media_text (
  query_text text,
  match_count int default 10
)
returns table (
  id bigint,
  title text,
  description text,
  video_url text,
  platform text,
  rank float
)
language sql stable
as $$
  select
    id,
    title,
    description,
    video_url,
    platform,
    ts_rank(content_tsv, websearch_to_tsquery('english', query_text)) as rank
  from video_media
  where content_tsv @@ websearch_to_tsquery('english', query_text)
  order by rank desc
  limit match_count;
$$;
