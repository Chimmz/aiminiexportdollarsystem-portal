-- Contact directory bonuses, ingested from the course's three contact-list
-- CSVs (International Buyer Contacts, Local Supplier Contacts, Shipping/
-- Packaging/Logistics Contacts). Read-only reference data, not something
-- an end user queries directly yet -- same RLS treatment as kb_chunks:
-- enabled, zero policies, service-role only.
--
-- Columns are plain text throughout, even where a value looks numeric or
-- date-like (prices, phone numbers, "July 2026"-style months), because the
-- source data is informally and inconsistently formatted: leading zeros on
-- phone numbers, multiple phone numbers separated by " | ", free-text
-- prices like "3k per 500g pack (wholesale)". Forcing a stricter type
-- would corrupt or truncate real data, and these tables are meant to be
-- populated via Supabase's table-editor CSV import, which does no type
-- coercion of its own beyond what the column type already allows.
--
-- Idempotent like schema.sql/schema_app.sql and the other migrations --
-- safe to re-run after an edit.

create table if not exists international_buyer_contacts (
  id bigint generated always as identity primary key,
  -- Original row number from the source CSV ("Entry") -- kept for
  -- traceability back to the sheet, not used as a uniqueness constraint.
  entry int,
  part text,
  country text,
  buyer_type text,
  name_or_company text,
  contact_person text,
  job_title text,
  place_or_address text,
  phones text,
  emails text,
  website text,
  instagram text,
  products text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists local_supplier_contacts (
  id bigint generated always as identity primary key,
  -- Original row number from the source CSV ("No").
  entry int,
  -- "Group" in the source CSV -- renamed to avoid the reserved word.
  supplier_group text,
  supplier text,
  city text,
  state text,
  products text,
  phone_1 text,
  phone_2 text,
  email text,
  social text,
  price_listed text,
  price_month text,
  minimum_order text,
  delivery_note text,
  last_listed text,
  created_at timestamptz not null default now()
);

create table if not exists shipping_logistics_contacts (
  id bigint generated always as identity primary key,
  -- Original row number from the source CSV ("Entry").
  entry int,
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

-- No policies: same reasoning as kb_chunks -- deny anon/authenticated by
-- default (who can otherwise hit any public table directly via Supabase's
-- REST API), service-role client bypasses as usual.
alter table international_buyer_contacts enable row level security;
alter table local_supplier_contacts enable row level security;
alter table shipping_logistics_contacts enable row level security;
