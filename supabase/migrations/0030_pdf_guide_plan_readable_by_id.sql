-- mini-export-web's own checkout actions (resolve-plan-amount.ts) need
-- 'pdf-guide''s real price by reading `plans` directly with the anon
-- key, the same way they already read the three AI-access tiers -- but
-- 'pdf-guide' is deliberately is_active = false (migrations/
-- 0016_pdf_guide_plan_not_active.sql), so the existing "plans are
-- publicly readable" policy (`using (is_active)`) hides it from anon
-- entirely. This adds that one specific id as a second, narrow
-- allowance -- every listing query in the app still explicitly filters
-- `is_active = true` itself (getActivePlans on both sides), so
-- 'pdf-guide' still never appears in any dropdown/list; it only becomes
-- directly readable by someone who already knows its exact id, which is
-- the only way any caller ever looks it up. Nothing about price/label/
-- duration is sensitive, so this isn't a new exposure, just a narrower
-- read path than the service-role bridge this previously required.
drop policy if exists "plans are publicly readable" on public.plans;
create policy "plans are publicly readable"
  on public.plans for select
  using (is_active or id = 'pdf-guide');
