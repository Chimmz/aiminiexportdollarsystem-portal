-- Until now, every `plans` row was implicitly an AI-access tier (its
-- duration_days directly fed the access_period chaining algorithm). That
-- stops being true once the sales site's base product (the PDF guide +
-- bonus directories, no AI plan) also needs a payments row -- someone can
-- buy just the guide, which "auto comes with Eva free trial" for free
-- (anyone with zero access_periods already reads as 'trial', no row
-- needed for that), with no AI-access tier attached to the purchase
-- itself.
--
-- grants_ai_access makes that distinction explicit rather than relying on
-- an implicit "duration_days happens to be 0" signal, which is one typo
-- away from silently skipping a real access grant as more non-AI
-- products get added later (upsells, bundles, etc). Defaults to true so
-- the three existing tiers need no individual update.
alter table public.plans
  add column if not exists grants_ai_access boolean not null default true;

-- Price is the current launch price (index.html: "Get Instant Access —
-- ₦9,800", rising to ₦19,800 later) -- payments.amount_kobo on each real
-- row is the actual source of truth for what was charged; this is just a
-- reference default, same role price_kobo already plays for the three AI
-- tiers (duplicated against the dashboard Upgrade page's own hardcoded
-- tier list, a pre-existing minor duplication, not introduced here).
insert into public.plans (id, label, price_kobo, duration_days, grants_ai_access, is_recommended, sort_order)
values ('pdf-guide', 'Export Guide + Directories', 980000, 0, false, false, 0)
on conflict (id) do nothing;
