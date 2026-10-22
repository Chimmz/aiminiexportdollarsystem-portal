-- A fourth contact directory: business/regulatory documentation providers
-- (export licenses, CAC registration, compliance paperwork), distinct from
-- shipping_logistics_contacts -- that table is for moving and packing
-- goods, this one is for the paperwork that makes an export legal. Same
-- shape as shipping_logistics_contacts (service/name/state/place/offer/
-- price/phones/email) since it's the same kind of listing: a provider,
-- what they offer, and how to reach them.
--
-- Same RLS treatment as the other three directories: enabled, zero
-- policies, service-role only -- see 0003_contact_directories.sql.
--
-- Idempotent like the other migrations -- safe to re-run after an edit.

create table if not exists documentation_contacts (
  id bigint generated always as identity primary key,
  service text,
  name text,
  state text,
  place text,
  offer text,
  price_noted text,
  month_posted text,
  phones text,
  email text,
  created_at timestamptz not null default now()
);

alter table documentation_contacts enable row level security;

alter table public.documentation_contacts add column if not exists search_tsv tsvector
  generated always as (to_tsvector('english', coalesce(service, '') || ' ' || coalesce(offer, ''))) stored;
create index if not exists documentation_contacts_search_tsv_idx
  on public.documentation_contacts using gin (search_tsv);
