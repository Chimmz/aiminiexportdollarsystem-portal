-- Lets a specific local supplier contact be pinned to the top of
-- searchContacts results for their own products, instead of ranking
-- wherever Postgres's default row order happens to put them. A plain
-- boolean, not a numeric priority, since there's exactly one real case
-- today (feature this one contact) -- searchLocalSuppliers in
-- contacts-actions.ts orders by this column descending, so a featured
-- row always sorts before non-featured ones in the combined result.
--
-- Added for Adanma (07085803828, Lagos -- unadulterated palm oil, garri,
-- dry panla fish, crayfish, dry pepper, dry periwinkles, dry/fresh
-- vegetables, date powder), who should surface first whenever any of
-- those products is searched.
--
-- Idempotent like the other migrations -- safe to re-run after an edit.

alter table public.local_supplier_contacts
  add column if not exists featured boolean not null default false;

update public.local_supplier_contacts
  set featured = true
  where supplier = 'Adanma' and phone_1 = '07085803828';
