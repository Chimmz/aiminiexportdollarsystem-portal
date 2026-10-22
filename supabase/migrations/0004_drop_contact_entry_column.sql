-- 0003 kept a redundant "entry" column (the source CSV's original row
-- number) on all three contact-directory tables, for traceability back to
-- the sheet. Dropped: it holds the same sequential values as the identity
-- "id" column already does, so it added nothing and just complicated the
-- CSV import's header-matching.
--
-- Idempotent like the other migrations -- safe to re-run after an edit.

alter table international_buyer_contacts drop column if exists entry;
alter table local_supplier_contacts drop column if exists entry;
alter table shipping_logistics_contacts drop column if exists entry;
