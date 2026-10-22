-- Adds human-friendly batch numbering + a source label to kb_chunks.
-- Run once in the Supabase SQL Editor. Idempotent, safe to re-run.
--
-- batch_id (existing) is a random uuid, only useful for scoping a search
-- query (see match_kb_chunks in schema.sql). batch_no is an ordinal
-- assigned once per embed action via the sequence below, so the rag-lab UI
-- can show "batch 1, 2, 3..." in the order files were actually ingested.
-- source_label records the filename/label typed in the UI when pasting a
-- KB source file, since pasted text has no filename of its own.

alter table kb_chunks add column if not exists batch_no int;
alter table kb_chunks add column if not exists source_label text;

create sequence if not exists kb_batch_no_seq;

-- PostgREST/the JS client can't call nextval() on a bare sequence directly —
-- this RPC is the only way the embed route can claim the next batch_no.
create or replace function next_kb_batch_no ()
returns int
language sql
as $$
  select nextval('kb_batch_no_seq')::int;
$$;
