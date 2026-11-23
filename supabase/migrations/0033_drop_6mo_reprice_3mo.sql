-- Dropping the 6-month tier: with the per-user token-budget-per-tier idea
-- scrapped (see limits.ts's USAGE_CEILING_* comment -- margin now comes
-- from the blended average across the paying base, not a tight
-- per-tier quota), there's no cost-side reason left to offer it, and a
-- 6-month flat-fee commitment to a course most people finish well within
-- 3 months was never a realistic sell on its own. is_active = false, not
-- a delete, so any historical payments/access_periods already
-- referencing '6-month' keep a valid plans.id to join against -- see
-- migrations/0016's identical reasoning for 'pdf-guide'.
update public.plans set is_active = false where id = '6-month';

-- 3-month becomes the top tier now that 6-month is gone, so its price
-- moves off the old 3-vs-6 discount ladder: 9,500/month flat x3 would be
-- 28,500; this keeps a modest ~17.5% discount over three separate
-- 1-month purchases instead of the deeper discount 6-month used to
-- justify.
update public.plans set price_kobo = 2350000 where id = '3-month';
