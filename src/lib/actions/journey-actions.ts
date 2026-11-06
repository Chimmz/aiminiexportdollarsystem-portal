import { createServiceClient } from '@/lib/supabase/service';
import {
  SETUP_STEPS_BY_SCALE,
  DEAL_STEPS_BY_SCALE,
  defaultProgress,
  type ExportScale,
  type ProgressTrack,
  type SetupStepKey,
  type DealStepKey,
  type StepStatus,
  type StepProgress,
  type DealStatus,
  type Deal,
  type PastDeal,
  type FullExportJourneyProgress,
} from '@/lib/utils/journey-utils';

// scale is resolved by the caller (see memory-actions.ts's getUserMemory,
// from the "export_scale" profile fact, defaulting to "small" -- this
// course's main focus -- until the user says otherwise), so this only ever
// reads the one step-label set that's actually relevant right now. Deals
// themselves aren't scale-specific -- a user's deals carry over if their
// scale changes mid-journey, only which step labels apply to them does.
const RECENT_DEALS_LIMIT = 30;

// "Full" because this is not a read of journey_setup_progress alone --
// it fetches that table AND every active row in deals AND joins each of
// those to its own deal_step_progress rows (by deal_id, the two queries +
// in-memory merge below), returning the whole combined picture as one
// FullExportJourneyProgress. See journey-utils.ts for that shape.
export async function getFullExportJourneyProgress(
  userId: string,
  scale: ExportScale
): Promise<FullExportJourneyProgress> {
  const supabase = createServiceClient();

  const [{ data: setupRows, error: setupError }, { data: dealRows, error: dealsError }] =
    await Promise.all([
      supabase
        .from('journey_setup_progress')
        .select('step_key, status, detail')
        .eq('user_id', userId),
      supabase
        .from('deals')
        .select('id, product, status, last_active_at')
        .eq('user_id', userId)
        .order('last_active_at', { ascending: false })
        .limit(RECENT_DEALS_LIMIT),
    ]);
  if (setupError) throw new Error(`journey setup progress: ${setupError.message}`);
  if (dealsError) throw new Error(`deals: ${dealsError.message}`);

  const setupKeys = SETUP_STEPS_BY_SCALE[scale].map((s) => s.key as string);
  const setup = defaultProgress(setupKeys);
  for (const row of setupRows ?? []) {
    if (setupKeys.includes(row.step_key)) {
      setup[row.step_key] = { status: row.status as StepStatus, detail: row.detail };
    }
  }

  const activeDealRows = (dealRows ?? []).filter((d) => d.status === 'active');
  const pastDeals: PastDeal[] = (dealRows ?? [])
    .filter((d) => d.status !== 'active')
    .map((d) => ({ product: d.product, status: d.status as DealStatus }));

  const dealKeys = DEAL_STEPS_BY_SCALE[scale].map((s) => s.key as string);
  const stepsByDealId = new Map<string, Record<string, StepProgress>>();
  for (const d of activeDealRows) stepsByDealId.set(d.id, defaultProgress(dealKeys));

  if (activeDealRows.length > 0) {
    const { data: stepRows, error: stepsError } = await supabase
      .from('deal_step_progress')
      .select('deal_id, step_key, status, detail')
      .in(
        'deal_id',
        activeDealRows.map((d) => d.id)
      );
    if (stepsError) throw new Error(`deal step progress: ${stepsError.message}`);
    for (const row of stepRows ?? []) {
      const steps = stepsByDealId.get(row.deal_id);
      if (steps && dealKeys.includes(row.step_key)) {
        steps[row.step_key] = { status: row.status as StepStatus, detail: row.detail };
      }
    }
  }

  const activeDeals: Deal[] = activeDealRows.map((d) => ({
    id: d.id,
    product: d.product,
    status: d.status as DealStatus,
    steps: stepsByDealId.get(d.id) ?? defaultProgress(dealKeys),
    lastActiveAt: d.last_active_at,
  }));

  return { scale, setup, activeDeals, pastDeals };
}

export interface UpdateStepParams {
  userId: string;
  track: ProgressTrack;
  // Required when track is 'deal' -- see resolveDeal below. Unused for
  // 'setup', which stays keyed by (user_id, step_key) as before, since
  // getting-started steps are genuinely one-time per user, not per-deal.
  dealId?: string;
  stepKey: SetupStepKey | DealStepKey;
  status: StepStatus;
  detail: string | null;
}

export async function updateStepProgress({
  userId,
  track,
  dealId,
  stepKey,
  status,
  detail,
}: UpdateStepParams): Promise<void> {
  const supabase = createServiceClient();
  const completed_at = status === 'done' ? new Date().toISOString() : null;

  if (track === 'setup') {
    const { error } = await supabase
      .from('journey_setup_progress')
      .upsert(
        { user_id: userId, step_key: stepKey, status, detail, completed_at },
        { onConflict: 'user_id,step_key' }
      );
    if (error) throw new Error(`update setup step progress: ${error.message}`);
    return;
  }

  if (!dealId) throw new Error('update deal step progress: dealId is required');
  const { error } = await supabase.from('deal_step_progress').upsert(
    {
      user_id: userId,
      deal_id: dealId,
      step_key: stepKey,
      status,
      detail,
      completed_at,
    },
    { onConflict: 'deal_id,step_key' }
  );
  if (error) throw new Error(`update deal step progress: ${error.message}`);
}

// Exact-id continuation: the deal id is given straight back from MEMORY
// (see journey-utils.ts's formatFullExportJourneyProgressForPrompt, which
// lists each active deal's own id), so this is a direct lookup, not fuzzy
// matching --
// used in preference to resolveDeal below whenever the model has one to
// give, since matching by product text alone can't tell "yam flour" and
// "yam powder" apart. Still scoped to this user and to 'active' so a
// hallucinated or stale id (another user's deal, or one already finished)
// can never silently write to the wrong row -- returns null instead, and
// the caller falls back to resolveDeal by product name.
export async function resolveDealById(
  userId: string,
  dealId: string
): Promise<{ id: string } | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('deals')
    .select('id')
    .eq('id', dealId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(`find deal by id: ${error.message}`);
  if (!data) return null;

  const { error: touchError } = await supabase
    .from('deals')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', data.id);
  if (touchError) throw new Error(`touch deal: ${touchError.message}`);
  return { id: data.id };
}

// Get-or-create, keyed by product: finds this user's existing ACTIVE deal
// for that product (case-insensitive, trimmed), or starts a new one. A
// manual select-then-insert rather than an upsert -- deals' uniqueness is
// a partial index (active rows only, see migration 0022), and Supabase's
// upsert always emits a plain ON CONFLICT with no WHERE clause, which
// can't target a partial index (the exact issue migration 0021 already
// had to fix once for price_quotes). This is the fallback path, used when
// there's no known deal id yet (a brand new deal) or the given one didn't
// resolve -- see resolveDealById above, which is tried first.
export async function resolveDeal(
  userId: string,
  product: string
): Promise<{ id: string }> {
  const supabase = createServiceClient();
  const normalized = product.trim();

  const { data: existing, error: findError } = await supabase
    .from('deals')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .ilike('product', normalized)
    .maybeSingle();
  if (findError) throw new Error(`find deal: ${findError.message}`);

  if (existing) {
    const { error: touchError } = await supabase
      .from('deals')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (touchError) throw new Error(`touch deal: ${touchError.message}`);
    return { id: existing.id };
  }

  const { data: created, error: createError } = await supabase
    .from('deals')
    .insert({ user_id: userId, product: normalized, status: 'active' })
    .select('id')
    .single();
  if (createError) throw new Error(`create deal: ${createError.message}`);
  return { id: created.id };
}

export async function updateDealStatus(
  dealId: string,
  status: DealStatus
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('deals').update({ status }).eq('id', dealId);
  if (error) throw new Error(`update deal status: ${error.message}`);
}
