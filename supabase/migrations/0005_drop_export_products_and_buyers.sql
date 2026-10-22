-- export_products, buyers, and buyer_products (schema_app.sql) were
-- extracted-memory tables for two "big" repeatable entities the mentor
-- would pull out of chat, but neither ever got a write path, and they're
-- being replaced with a purpose-built journey-progress table instead
-- (predefined, finite steps want an explicit status per step, not an
-- open-ended extracted-entity table). Confirmed zero application code
-- references any of the three before dropping them.
--
-- buyer_products first: it holds the foreign keys into the other two.
--
-- Idempotent like the other migrations -- safe to re-run after an edit.

drop table if exists public.buyer_products;
drop table if exists public.buyers;
drop table if exists public.export_products;
