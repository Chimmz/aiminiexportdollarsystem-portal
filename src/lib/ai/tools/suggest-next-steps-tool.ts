import { tool } from 'ai';
import { z } from 'zod';

// Purely a structured output channel, not a real action -- nothing to
// persist or look up, so execute just echoes the input back as the
// result. See mentor-chat-client.tsx for how the UI reads this part to
// render the suggestion chips above the prompt box, and config.ts's
// "LEADING THE CONVERSATION FORWARD" section for when Eva is told to
// call it.
//
// Was briefly a deterministic, code-triggered call instead of a tool
// (lib/mentor/next-steps.ts, now removed): calling it on every single
// reply fixed how often it fired, but firing every single turn turned out
// to be its own problem -- always-present, tempting chips distract the
// user from the actual export journey they're in the middle of, not help
// them along it. Back to a tool the model itself chooses to call, so it
// only shows up when it's genuinely the natural next step.
export function createSuggestNextStepsTool() {
  return tool({
    description: `Offer the user a few clickable next things to ask or do,
      shown as suggestion chips above their message box, not in your
      reply text. Call this only when a next step is genuinely natural --
      skipping it is the normal case, since a chip is tempting to click
      and one offered reflexively pulls the user sideways. Write 1 to 3
      short suggestions the way the user would say them (first person),
      e.g. "Find me buyer contacts for crayfish in Germany", not a
      question back at them. Specific to this conversation, never
      generic.`,
    inputSchema: z.object({
      suggestions: z
        .array(z.string())
        .min(1)
        .max(3)
        .describe(
          'Short, specific, first-person suggestions phrased as something the user might say next.'
        ),
    }),
    execute: async ({ suggestions }) => ({ suggestions }),
  });
}
