import { tool } from 'ai';
import { z } from 'zod';
import {
  SETUP_STEPS,
  DEAL_STEPS,
  updateStepProgress,
  resetDealProgress,
  type SetupStepKey,
  type DealStepKey,
} from '@/lib/journey';

const SETUP_STEP_KEYS = SETUP_STEPS.map((s) => s.key);
const DEAL_STEP_KEYS = DEAL_STEPS.map((s) => s.key);
const SETUP_KEY_SET = new Set<string>(SETUP_STEP_KEYS);

// Step keys don't collide between the two tracks, so one flat enum covers
// both and the track is derived from which list the key came from -- no
// need to make the model pick a track itself as a separate field.
const ALL_STEP_KEYS = [...SETUP_STEP_KEYS, ...DEAL_STEP_KEYS] as [string, ...string[]];

// Needs userId (unlike answer-question-tool.ts/search-contacts-tool.ts,
// which are user-agnostic) since every write here is scoped to one user's
// rows -- see journey.ts.
export function createUpdateJourneyProgressTool(userId: string) {
  return tool({
    description: `Record the user's progress on the fixed getting-started
      sequence or the fixed 5-step deal sequence (see the JOURNEY PROGRESS
      section of your instructions for where they currently stand). Call
      this whenever the user tells you they've done, started, or changed
      something that maps to one of these steps, such as "I just opened my
      GTBank account" or "the buyer paid me."`,
    inputSchema: z.object({
      stepKey: z
        .enum(ALL_STEP_KEYS)
        .describe(
          `Which step this update is about. Getting-started steps, one-time
            before their first deal: ${SETUP_STEP_KEYS.join(', ')}. Current
            deal steps, repeat every deal: ${DEAL_STEP_KEYS.join(', ')}.`
        ),
      status: z
        .enum(['not_started', 'in_progress', 'done'])
        .describe('The step\'s new status.'),
      detail: z
        .string()
        .nullable()
        .describe(
          `A short specific note on what was actually decided or done, e.g.
            "catfish" for decide_product, or "paid 50% deposit via Western
            Union" for get_paid. Null if there's nothing specific to note.`
        ),
      newDeal: z
        .boolean()
        .nullable()
        .describe(
          `True only when this update marks the start of a brand new deal
            from scratch, after a previous deal already finished, such as a
            different product or a different buyer entirely. This resets
            every other deal step back to not started before applying this
            update. Null or false for anything else, including the user's
            very first deal.`
        ),
    }),
    execute: async ({ stepKey, status, detail, newDeal }) => {
      try {
        const track = SETUP_KEY_SET.has(stepKey) ? 'setup' : 'deal';
        if (newDeal && track === 'deal') {
          await resetDealProgress(userId);
        }
        await updateStepProgress({
          userId,
          track,
          stepKey: stepKey as SetupStepKey | DealStepKey,
          status,
          detail,
        });
        return { ok: true };
      } catch (err) {
        console.error('[mentor] updateJourneyProgress tool failed:', err);
        return { ok: false, note: "Couldn't save that progress update right now." };
      }
    },
  });
}
