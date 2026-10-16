import { createServiceClient } from '@/lib/supabase/service';

// Two fixed-step progress trackers (see supabase/migrations/
// 0006_journey_progress.sql) so the mentor can lead the user through a
// known sequence instead of re-deriving "where are they" from chat history
// on every message. Step keys are fixed here, not DB-editable, same
// convention as ALL_CONTACT_TYPES in contacts.ts.

export type SetupStepKey =
  | 'decide_product'
  | 'decide_country'
  | 'open_domiciliary_account'
  | 'create_flyer_and_advertise';

export const SETUP_STEPS: { key: SetupStepKey; label: string }[] = [
  { key: 'decide_product', label: 'Decide what product to export and confirm wholesale prices' },
  { key: 'decide_country', label: 'Decide which country to sell to' },
  { key: 'open_domiciliary_account', label: 'Open a domiciliary account' },
  {
    key: 'create_flyer_and_advertise',
    label: 'Create a flyer and run adverts that target buyers abroad',
  },
];

// Mirrors Eva's own COURSE MAP (config.ts) -- step 1 covers both Chapter 4
// (attract buyer) and Chapter 5 (price & quote) since the material treats
// them as one combined move before anything else happens.
export type DealStepKey = 'attract_buyer_and_quote' | 'get_paid' | 'source' | 'pack' | 'ship';

export const DEAL_STEPS: { key: DealStepKey; label: string }[] = [
  { key: 'attract_buyer_and_quote', label: 'Attract a buyer and send a price quote' },
  { key: 'get_paid', label: 'Get paid (deposit or full payment, or escrow funded) before shipping' },
  { key: 'source', label: 'Source the goods from a supplier' },
  { key: 'pack', label: 'Pack the goods for export' },
  { key: 'ship', label: 'Ship the goods' },
];

export type StepStatus = 'not_started' | 'in_progress' | 'done';

export interface StepProgress {
  status: StepStatus;
  detail: string | null;
}

export interface JourneyProgress {
  setup: Record<SetupStepKey, StepProgress>;
  deal: Record<DealStepKey, StepProgress>;
}

function defaultProgress<K extends string>(keys: K[]): Record<K, StepProgress> {
  return Object.fromEntries(
    keys.map((k) => [k, { status: 'not_started' as StepStatus, detail: null }])
  ) as Record<K, StepProgress>;
}

// Fetched once per request (same pattern as getCurrentUserFirstName in
// dal.ts) and injected straight into the system prompt so Eva knows exact
// state without needing a tool call just to find out where the user is.
export async function getJourneyProgress(userId: string): Promise<JourneyProgress> {
  const supabase = createServiceClient();

  const [{ data: setupRows, error: setupError }, { data: dealRows, error: dealError }] =
    await Promise.all([
      supabase.from('journey_setup_progress').select('step_key, status, detail').eq('user_id', userId),
      supabase.from('deal_step_progress').select('step_key, status, detail').eq('user_id', userId),
    ]);
  if (setupError) throw new Error(`journey setup progress: ${setupError.message}`);
  if (dealError) throw new Error(`deal step progress: ${dealError.message}`);

  const setup = defaultProgress(SETUP_STEPS.map((s) => s.key));
  for (const row of setupRows ?? []) {
    setup[row.step_key as SetupStepKey] = { status: row.status as StepStatus, detail: row.detail };
  }

  const deal = defaultProgress(DEAL_STEPS.map((s) => s.key));
  for (const row of dealRows ?? []) {
    deal[row.step_key as DealStepKey] = { status: row.status as StepStatus, detail: row.detail };
  }

  return { setup, deal };
}

function statusLabel(status: StepStatus): string {
  return { not_started: 'not started', in_progress: 'in progress', done: 'done' }[status];
}

// Dynamic, per-user text injected at the very end of the system prompt
// (see config.ts) for the same caching reason userFirstName sits there:
// anything that varies per request breaks prompt caching for everything
// after it, so it goes last.
export function formatJourneyProgressForPrompt(progress: JourneyProgress): string {
  const setupLines = SETUP_STEPS.map((step, i) => {
    const p = progress.setup[step.key];
    const detail = p.detail ? ` (${p.detail})` : '';
    return `${i + 1}. ${step.label} [${statusLabel(p.status)}]${detail}`;
  }).join('\n');

  const dealLines = DEAL_STEPS.map((step, i) => {
    const p = progress.deal[step.key];
    const detail = p.detail ? ` (${p.detail})` : '';
    return `${i + 1}. ${step.label} [${statusLabel(p.status)}]${detail}`;
  }).join('\n');

  return `Getting started (one-time, done once ever, before their first deal):\n${setupLines}\n\nCurrent deal (the 5 steps of an actual sale, repeats every deal):\n${dealLines}`;
}

export type ProgressTrack = 'setup' | 'deal';

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
// defaultProgress above), so a plain delete is enough to "reset."
export async function resetDealProgress(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('deal_step_progress').delete().eq('user_id', userId);
  if (error) throw new Error(`reset deal progress: ${error.message}`);
}
