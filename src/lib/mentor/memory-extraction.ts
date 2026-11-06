import { generateText, Output } from 'ai';
import { z } from 'zod';
import { queryRewriteModel } from '@/lib/ai/models';
import {
  SETUP_STEPS_BY_SCALE,
  DEAL_STEPS_BY_SCALE,
  type SetupStepKey,
  type DealStepKey,
} from '@/lib/utils/journey-utils';
import {
  updateStepProgress,
  resolveDeal,
  resolveDealById,
  updateDealStatus,
} from '@/lib/actions/journey-actions';
import { upsertProfileFact, deleteProfileFact } from '@/lib/actions/memory-actions';
import type { UserMemory } from '@/lib/utils/memory-utils';

// Replaces the old manageMemory tool entirely -- memory used to be written
// by the main chat model deciding, mid-conversation, to call a tool for
// it, on top of everything else it was juggling (persona, tone, five
// other tools, a long MEMORY section). That repeatedly missed real
// signal in practice -- a tentative "thinking of ijebu garri" went
// unrecorded even with an explicit instruction covering exactly that
// phrasing. This is the fix taken all the way: one narrow, single-job
// extraction call runs after every turn, deterministic and independent
// of whatever the main model said or didn't say, same shape Matt
// Pocock's course uses for this exact problem. The main model no longer
// has a memory tool at all -- see config.ts, which no longer carries any
// memory-management instructions.

const MEMORY_STATUS_VALUES = ['not_started', 'in_progress', 'done'] as const;

function buildSchema(
  setupKeys: [SetupStepKey, ...SetupStepKey[]],
  dealKeys: [DealStepKey, ...DealStepKey[]]
) {
  return z.object({
    profileFacts: z
      .array(
        z.object({
          action: z.enum(['add', 'update', 'delete']),
          factType: z.string().describe(
            `A short, consistent key, e.g. "location", "business_name",
                "primary_market", "experience_level",
                "preferred_contact_channel", or "export_scale" (value
                exactly "small" or "large" -- infer from real signal like
                "I want to do a full container" or "I have a buyer wanting
                large volume" meaning large, "just starting small" or no
                real signal meaning small; default "small" when genuinely
                unclear). Reuse the exact same factType across turns for
                the same kind of fact so an update replaces the old value
                instead of duplicating it. Never a factType that just
                restates what product, country, or step they're on under
                different wording (e.g. "product", "chosen_product",
                "export_product", "target_market") -- that's journey data,
                not a personal fact, and it's already captured by
                setupUpdates/dealUpdates below. Recording it a second time
                here under a new name just risks the two drifting out of
                sync.`
          ),
          factValue: z
            .string()
            .nullable()
            .describe(
              'The fact itself, e.g. "Lagos, Nigeria". Null when action is "delete".'
            ),
          confidence: z
            .number()
            .min(0)
            .max(1)
            .nullable()
            .describe('How sure, 0 to 1. Null if the user stated it directly.'),
        })
      )
      .describe(
        `Loose PERSONAL facts about this user as a person or business --
          their location, business name, experience level, preferred
          contact channel, export scale, and the like -- this turn newly
          reveals, changes, or (rarely) invalidates. Never anything about
          their export journey itself (what product, what country, what
          step they're on, a deal's progress) -- that's a different kind
          of information entirely, already tracked by setupUpdates and
          dealUpdates below, not a personal fact about who they are. Only
          delete a fact that's become genuinely false, never just because
          something newer came up. Empty array if nothing qualifies.`
      ),
    setupUpdates: z
      .array(
        z.object({
          stepKey: z.enum(setupKeys),
          status: z.enum(MEMORY_STATUS_VALUES),
          detail: z
            .string()
            .nullable()
            .describe(
              'A short specific note, e.g. "ijebu garri". Null if nothing specific.'
            ),
        })
      )
      .describe(
        `One-time getting-started steps (decide_product, decide_country,
          and the rest) this turn newly reveals or changes. decide_product
          and decide_country are independent -- each saves the moment ITS
          OWN info is known, never held back waiting on the other.

          First, a rule that applies no matter what's already recorded: a
          QUESTION is never itself a lean or a decision, regardless of how
          specific the product it names is. "What do you think about
          hibiscus tea," "what's exporting ginger like" -- these are asking
          YOU something, not the user reporting their own interest or
          intent. Answer them for real (that's what searchKb is for), but
          they produce NO entry here, ever -- not even when decide_product
          is still not_started. Only the user's own first-person statement
          of leaning or deciding counts.

          Given that, how readily a step takes a new value also depends on
          whether it's already been recorded (check the current
          status/detail given below under "what's already known"):

          Still not_started: a genuine tentative lean, stated as the
          user's own inclination ("thinking of X", "maybe I'll do Y", "I'm
          considering X") is enough -- status "in_progress", detail the
          thing itself. A firm, settled choice ("let's do X", "I'll go
          with X", "I decided on X") is "done" straight away.

          Already in_progress or done: it's sticky. Only touch it on an
          unambiguous, explicit replacement -- "Couldn't get a reliable
          supplier, I'll do ginger and garlic instead" clearly replaces
          the original choice, update it, don't add a new one. A bare
          mention, question, or passing thought about a different product
          -- "what do you think about exporting ginger," "another product
          in mind is egusi, what's exporting it like" -- is curiosity or
          brainstorming, not a decision, and produces NO entry here at
          all. Working a different product in a deal is the same story --
          never a reason to touch decide_product, that's normal, not a
          replacement of their original getting-started choice.

          Empty array if nothing qualifies -- that's the common case for
          this step once it's already set, since most turns don't actually
          replace it.`
      ),
    dealUpdates: z
      .array(
        z.object({
          dealId: z
            .string()
            .nullable()
            .describe(
              `The exact id of an already-listed active deal below, when
                this update continues one of those -- preferred over
                matching by product name alone, which can miss on slightly
                different wording ("yam flour" vs "yam powder"). Null when
                there's no existing deal to copy an id from, i.e. this is
                a brand new product with no deal yet.`
            ),
          product: z
            .string()
            .min(1)
            .describe(
              `The product this update is for. Always include this even
                when dealId is set too, since it's the fallback if that id
                doesn't resolve, and it's what names a brand new deal when
                dealId is null. Reuse the exact wording already shown for
                this product below if one exists.`
            ),
          stepKey: z.enum(dealKeys),
          status: z.enum(MEMORY_STATUS_VALUES),
          detail: z
            .string()
            .nullable()
            .describe(
              'A short specific note, e.g. "paid 50% deposit via Western Union". Null if nothing specific.'
            ),
          dealStatus: z
            .enum(['done', 'abandoned'])
            .nullable()
            .describe(
              `"done" only when this update is the deal's final step (the
                goods have actually shipped) and the whole deal is
                genuinely complete. "abandoned" only if the user
                explicitly drops this product/deal entirely. Null for an
                ordinary step update -- that's most of them.`
            ),
        })
      )
      .describe(
        `Progress on a specific deal (a specific product's own
          attract-buyer-and-quote / get-paid / source / pack / ship
          sequence) this turn newly reveals or changes. A deal is created
          automatically the first time anything is recorded for a new
          product -- nothing needs resolving first. A message starting "I
          worked out my pricing:" and ending "Please save this as my price
          quote for this deal" is them completing attract_buyer_and_quote
          -- status "in_progress" unless they say it already went out to a
          buyer (then "done"), detail summarizing the numbers it states.
          Empty array if nothing qualifies.`
      ),
  });
}

function formatContext(memory: UserMemory): string {
  const { facts, exportJourneyProgress } = memory;
  const { scale, setup, activeDeals, pastDeals } = exportJourneyProgress;

  const factLines =
    facts.length > 0
      ? facts.map((f) => `- ${f.factType}: ${f.factValue}`).join('\n')
      : '(none yet)';

  const setupLines = SETUP_STEPS_BY_SCALE[scale]
    .map((step) => {
      const p = setup[step.key];
      const detail = p?.detail ? ` (${p.detail})` : '';
      return `- ${step.key}: ${p?.status ?? 'not_started'}${detail}`;
    })
    .join('\n');

  const dealStepDefs = DEAL_STEPS_BY_SCALE[scale];
  const dealsBlock =
    activeDeals.length > 0
      ? activeDeals
          .map((deal) => {
            const lines = dealStepDefs
              .map((step) => {
                const p = deal.steps[step.key];
                const detail = p?.detail ? ` (${p.detail})` : '';
                return `  - ${step.key}: ${p?.status ?? 'not_started'}${detail}`;
              })
              .join('\n');
            return `- ${deal.product} (id: ${deal.id}):\n${lines}`;
          })
          .join('\n')
      : '(none active)';

  const pastLine =
    pastDeals.length > 0
      ? pastDeals.map((d) => `${d.product} (${d.status})`).join(', ')
      : '(none)';

  return `Known profile facts:
${factLines}

Export scale: ${scale}

Getting-started steps:
${setupLines}

Active deals:
${dealsBlock}

Past deals: ${pastLine}`;
}

// Runs once per turn, independent of whatever the main model said. Never
// throws -- a Gateway hiccup here shouldn't fail the turn the user
// actually came for, it just means nothing got remembered this time.
export async function extractAndUpdateMemory(
  userId: string,
  memory: UserMemory,
  turn: { userText: string; assistantText: string }
): Promise<boolean> {
  if (!turn.userText.trim()) return false;

  const { scale } = memory.exportJourneyProgress;
  const setupKeys = SETUP_STEPS_BY_SCALE[scale].map((s) => s.key) as [
    SetupStepKey,
    ...SetupStepKey[],
  ];
  const dealKeys = DEAL_STEPS_BY_SCALE[scale].map((s) => s.key) as [
    DealStepKey,
    ...DealStepKey[],
  ];
  const schema = buildSchema(setupKeys, dealKeys);

  let output: z.infer<typeof schema>;
  try {
    const result = await generateText({
      model: queryRewriteModel,
      output: Output.object({ schema }),
      prompt: `A user is talking to their export mentor. Read this turn and
decide what, if anything, is genuinely worth remembering about this user
going forward -- loose facts, getting-started progress, or progress on a
specific deal. Only extract what this turn actually says, never invent a
value it doesn't contain. Return empty arrays for anything that doesn't
apply -- most turns (small talk, a plain question with no new personal
information) genuinely have nothing to save.

What's already known about this user:
${formatContext(memory)}

The user's message this turn:
"${turn.userText}"

The mentor's reply this turn (context only, for resolving what the user's
message refers to -- never a source of facts about the user themselves):
"${turn.assistantText}"`,
    });
    output = result.output;
  } catch (err) {
    console.error('[mentor] memory extraction failed:', err);
    return false;
  }

  console.log('[mentor] memory extraction:', output);

  const tasks: Promise<void>[] = [];

  for (const f of output.profileFacts) {
    tasks.push(
      f.action === 'delete'
        ? deleteProfileFact(userId, f.factType)
        : upsertProfileFact(userId, f.factType, f.factValue ?? '', f.confidence)
    );
  }

  for (const s of output.setupUpdates) {
    tasks.push(
      updateStepProgress({
        userId,
        track: 'setup',
        stepKey: s.stepKey,
        status: s.status,
        detail: s.detail,
      })
    );
  }

  for (const d of output.dealUpdates) {
    tasks.push(
      (async () => {
        const deal =
          (d.dealId ? await resolveDealById(userId, d.dealId) : null) ??
          (await resolveDeal(userId, d.product));
        await updateStepProgress({
          userId,
          track: 'deal',
          dealId: deal.id,
          stepKey: d.stepKey,
          status: d.status,
          detail: d.detail,
        });
        if (d.dealStatus) await updateDealStatus(deal.id, d.dealStatus);
      })()
    );
  }

  if (tasks.length === 0) return false;

  const results = await Promise.allSettled(tasks);
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    for (const f of failures) {
      console.error(
        '[mentor] memory extraction apply failed:',
        (f as PromiseRejectedResult).reason
      );
    }
  }
  return results.some((r) => r.status === 'fulfilled');
}
