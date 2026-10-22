import { tool } from 'ai';
import { z } from 'zod';
import {
  ALL_SETUP_STEPS,
  ALL_DEAL_STEPS,
  type SetupStepKey,
  type DealStepKey,
} from '@/lib/utils/journey-utils';
import { updateStepProgress, resetDealProgress } from '@/lib/actions/journey-actions';
import { upsertProfileFact, deleteProfileFact } from '@/lib/actions/memory-actions';

// The flat union of both export-scale tracks' keys, not just the user's
// current scale -- the model needs the whole set expressible in the
// schema, since this tool has no per-user scale of its own to narrow by.
// config.ts instructs it to only ever use the keys matching the user's
// actual current export_scale fact.
const SETUP_STEP_KEYS = ALL_SETUP_STEPS.map((s) => s.key) as [SetupStepKey, ...SetupStepKey[]];
const DEAL_STEP_KEYS = ALL_DEAL_STEPS.map((s) => s.key) as [DealStepKey, ...DealStepKey[]];

// One tool, three memory types, each its own precisely-typed branch of a
// discriminated union keyed by memoryType -- not a loose
// { key, action, value } shape, so the model still can't express an
// invalid stepKey/status any more than the old dedicated
// updateJourneyProgress tool could. "profile_fact" is the only branch with
// a "delete" action: a fact can become outright false ("I don't use
// WhatsApp anymore"), but a progress step just transitions status, it
// never needs to disappear (see memory-utils.ts).
const ProfileFactOperation = z.object({
  memoryType: z.literal('profile_fact'),
  action: z.enum(['add', 'update', 'delete']),
  factType: z
    .string()
    .describe(
      `A short, consistent key for what kind of fact this is, e.g.
        "product", "location", "business_name", "primary_market",
        "experience_level", "preferred_contact_channel". Always "product"
        for whatever they've settled on exporting, even when they're
        replacing an earlier choice rather than deciding for the first
        time. Reuse the exact same factType across turns and conversations
        for the same kind of fact instead of inventing new wording each
        time -- that's what lets "update" find and replace the old value
        rather than create a duplicate.`
    ),
  factValue: z
    .string()
    .nullable()
    .describe('The fact itself, e.g. "Lagos, Nigeria". Null when action is "delete".'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe(
      `How sure you are this is accurate, 0 to 1. Null if the user stated it
        directly rather than you inferring it from context.`
    ),
});

const SetupProgressOperation = z.object({
  memoryType: z.literal('setup_progress'),
  action: z.enum(['add', 'update']),
  stepKey: z.enum(SETUP_STEP_KEYS),
  status: z.enum(['not_started', 'in_progress', 'done']),
  detail: z
    .string()
    .nullable()
    .describe('A short specific note on what was decided, e.g. "catfish". Null if nothing specific to note.'),
});

const DealProgressOperation = z.object({
  memoryType: z.literal('deal_progress'),
  action: z.enum(['add', 'update']),
  stepKey: z.enum(DEAL_STEP_KEYS),
  status: z.enum(['not_started', 'in_progress', 'done']),
  detail: z
    .string()
    .nullable()
    .describe('A short specific note on what was done, e.g. "paid 50% deposit via Western Union". Null if nothing specific to note.'),
  newDeal: z
    .boolean()
    .nullable()
    .describe(
      `True only when this marks the start of a brand new deal from
        scratch, after a previous deal already finished -- resets every
        other deal step back to not started before applying this update.
        Null or false for anything else, including the user's very first
        deal.`
    ),
});

const MemoryOperation = z.discriminatedUnion('memoryType', [
  ProfileFactOperation,
  SetupProgressOperation,
  DealProgressOperation,
]);

async function applyOperation(
  userId: string,
  op: z.infer<typeof MemoryOperation>
): Promise<void> {
  if (op.memoryType === 'profile_fact') {
    if (op.action === 'delete') {
      await deleteProfileFact(userId, op.factType);
    } else {
      await upsertProfileFact(userId, op.factType, op.factValue ?? '', op.confidence);
    }
    return;
  }

  if (op.memoryType === 'deal_progress' && op.newDeal) {
    await resetDealProgress(userId);
  }
  await updateStepProgress({
    userId,
    track: op.memoryType === 'setup_progress' ? 'setup' : 'deal',
    stepKey: op.stepKey,
    status: op.status,
    detail: op.detail,
  });
}

// Needs userId (unlike answer-question-tool.ts/search-contacts-tool.ts,
// which are user-agnostic) since every write here is scoped to one user's
// rows.
export function createManageMemoryTool(userId: string) {
  return tool({
    description: `Save what you learn about this user as you talk, across
      three kinds of memory: loose profile facts (location, business
      name, preferences -- anything worth remembering that doesn't fit the
      other two), one-time getting-started progress, and the current
      deal's progress (see the MEMORY section of your instructions for
      what's already known). Call this autonomously whenever something
      worth remembering comes up, such as "I just opened my GTBank
      account" or "the buyer paid me" -- don't ask permission first, just
      record it and keep talking. Pass several operations in one call when
      a single message reveals more than one thing.`,
    inputSchema: z.object({
      operations: z
        .array(MemoryOperation)
        .min(1)
        .describe(
          `One or more memory writes to apply in this call, e.g. two
            entries if one message reveals both a product decision and a
            country decision.`
        ),
    }),
    execute: async ({ operations }) => {
      console.log('[mentor] manageMemory call:', { userId, operations });
      const results = await Promise.allSettled(
        operations.map((op) => applyOperation(userId, op))
      );
      const failures = results.filter((r) => r.status === 'rejected').length;
      if (failures > 0) {
        for (const r of results) {
          if (r.status === 'rejected') {
            console.error('[mentor] manageMemory operation failed:', r.reason);
          }
        }
        return {
          ok: false,
          note: `${failures} of ${operations.length} memory update(s) failed to save -- mention briefly that you couldn't save everything, if it matters to the conversation.`,
        };
      }
      return { ok: true };
    },
  });
}
