-- Real text search for the contact directories' product/service fields,
-- replacing the plain JS substring match in searchIntlBuyers/
-- searchLocalSuppliers/searchLogistics (src/lib/utils/contacts-utils.ts).
--
-- A substring match is too literal for this data: a search for "cartons"
-- misses a row that only says "carton" (singular), and there's no way to
-- fix that without stemming. Same generated-tsvector-column + GIN-index
-- shape as kb_chunks.content_tsv in migration 0002, just one column per
-- table combining whichever fields that table's search actually matches
-- against today.
--
-- Idempotent like the other migrations -- safe to re-run after an edit.

alter table public.international_buyer_contacts add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(products, '') || ' ' || coalesce(notes, ''))) stored;
create index if not exists international_buyer_contacts_search_tsv_idx
  on public.international_buyer_contacts using gin (search_tsv);

alter table public.local_supplier_contacts add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(products, '') || ' ' || coalesce(supplier_group, ''))) stored;
create index if not exists local_supplier_contacts_search_tsv_idx
  on public.local_supplier_contacts using gin (search_tsv);

alter table public.shipping_logistics_contacts add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(service, '') || ' ' || coalesce(offer, ''))) stored;
create index if not exists shipping_logistics_contacts_search_tsv_idx
  on public.shipping_logistics_contacts using gin (search_tsv);
