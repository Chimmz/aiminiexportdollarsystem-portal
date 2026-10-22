-- journey_setup_progress and deal_step_progress (migration 0006) are
-- rebuilt around scale-specific step keys (small_* / large_*) instead of
-- one generic sequence -- small-scale and large-scale export are genuinely
-- different journeys (see journey-utils.ts), not the same checklist with
-- more or less effort.
--
-- Existing rows use step keys that no longer exist under the new check
-- constraint (e.g. "decide_product" instead of "small_decide_product"), so
-- they're cleared first. This is just progress-tracking state, not billing
-- or extracted chat memory, and a missing row already defaults to "not
-- started" by design (see journey-utils.ts's defaultProgress) -- the same
-- shape resetDealProgress already relies on -- so this is a one-time reset
-- for whichever few users had already started tracking under the old step
-- keys, not real data loss.
--
-- Idempotent like the other migrations -- safe to re-run after an edit.

delete from public.journey_setup_progress;
delete from public.deal_step_progress;

alter table public.journey_setup_progress drop constraint if exists journey_setup_progress_step_key_check;
alter table public.journey_setup_progress add constraint journey_setup_progress_step_key_check
  check (step_key in (
    'small_decide_product', 'small_decide_country', 'small_register_business',
    'small_open_account', 'small_build_presence_and_advertise', 'small_get_fda',
    'large_decide_product', 'large_decide_country', 'large_register_llc',
    'large_open_corporate_account_nxp', 'large_get_fda'
  ));

alter table public.deal_step_progress drop constraint if exists deal_step_progress_step_key_check;
alter table public.deal_step_progress add constraint deal_step_progress_step_key_check
  check (step_key in (
    'small_attract_buyer_and_quote', 'small_get_paid', 'small_source', 'small_pack', 'small_ship',
    'large_attract_buyer_and_quote', 'large_negotiate_and_sign_contract', 'large_get_paid',
    'large_source', 'large_pack', 'large_ship'
  ));
