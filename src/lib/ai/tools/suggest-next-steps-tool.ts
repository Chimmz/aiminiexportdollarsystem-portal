import { tool } from 'ai';
import { z } from 'zod';

// Purely a structured output channel, not a real action -- nothing to
// persist or look up, so execute just echoes the input back as the
// result. See mentor-chat-client.tsx for how the UI reads this part to
// render the suggestion chips above the prompt box, and config.ts's
// "LEADING THE CONVERSATION FORWARD" section for when Eva is told to
// call it.
export function createSuggestNextStepsTool() {
  return tool({
    description: `Offer the user a few clickable next things to ask or
      do, shown as suggestion chips above their message box, not in your
      reply text. Call this on most turns after you've already answered,
      with 1 to 3 short suggestions written the way the user would say
      them to you (first person, as if they're speaking), e.g. "Find me
      buyer contacts for crayfish in Germany", not a question aimed back
      at them like "Would you like contacts?". Make each one specific to
      this exact conversation and whatever you know about this user, not
      generic. Skip calling this on a turn with nothing specific worth
      suggesting, such as plain small talk.`,
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
