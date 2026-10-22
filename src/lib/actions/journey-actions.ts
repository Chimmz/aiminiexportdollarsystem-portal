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
  type JourneyProgress,
} from '@/lib/utils/journey-utils';

// scale is resolved by the caller (see memory-actions.ts's getUserMemory,
// from the "export_scale" profile fact, defaulting to "small" -- this
// course's main focus -- until the user says otherwise), so this only ever
// fetches and shows the one track that's actually relevant right now. Rows
// still in the DB for the other track (e.g. a user who switched scale
// partway) are simply not read here, not deleted -- they'd resurface if
// the user switched back.
export async function getJourneyProgress(userId: string, scale: ExportScale): Promise<JourneyProgress> {
  const supabase = createServiceClient();

  const [{ data: setupRows, error: setupError }, { data: dealRows, error: dealError }] =
    await Promise.all([
      supabase.from('journey_setup_progress').select('step_key, status, detail').eq('user_id', userId),
      supabase.from('deal_step_progress').select('step_key, status, detail').eq('user_id', userId),
    ]);
  if (setupError) throw new Error(`journey setup progress: ${setupError.message}`);
  if (dealError) throw new Error(`deal step progress: ${dealError.message}`);

  const setupKeys = SETUP_STEPS_BY_SCALE[scale].map((s) => s.key as string);
  const dealKeys = DEAL_STEPS_BY_SCALE[scale].map((s) => s.key as string);

  const setup = defaultProgress(setupKeys);
  for (const row of setupRows ?? []) {
    if (setupKeys.includes(row.step_key)) {
      setup[row.step_key] = { status: row.status as StepStatus, detail: row.detail };
    }
  }

  const deal = defaultProgress(dealKeys);
  for (const row of dealRows ?? []) {
    if (dealKeys.includes(row.step_key)) {
      deal[row.step_key] = { status: row.status as StepStatus, detail: row.detail };
    }
  }

  return { scale, setup, deal };
}

const TABLE_BY_TRACK: Record<ProgressTrack, string> = {
  setup: 'journey_setup_progress',
  deal: 'deal_step_progress',
};

export interface UpdateStepParams {
  userId: string;
  track: ProgressTrack;
  stepKey: SetupStepKey | DealStepKey;
  status: StepStatus;
  detail: string | null;
}

export async function updateStepProgress({
  userId,
  track,
  stepKey,
  status,
  detail,
}: UpdateStepParams): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from(TABLE_BY_TRACK[track])
    .upsert(
      {
        user_id: userId,
        step_key: stepKey,
        status,
        detail,
        completed_at: status === 'done' ? new Date().toISOString() : null,
      },
      { onConflict: 'user_id,step_key' }
    );
  if (error) throw new Error(`update ${track} step progress: ${error.message}`);
}

// Starting a new deal deletes every deal-track row for this user instead
// of keeping deal history -- missing rows default to not_started (see
// defaultProgress in journey-utils.ts), so a plain delete is enough to
// "reset." Deletes across both scales' rows, not just the current one -- a
// user switching scale between deals should start the new deal's track
// clean too, and this never fires except on an explicit newDeal, so
// there's nothing to lose from the inactive track either.
export async function resetDealProgress(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('deal_step_progress').delete().eq('user_id', userId);
  if (error) throw new Error(`reset deal progress: ${error.message}`);
}
