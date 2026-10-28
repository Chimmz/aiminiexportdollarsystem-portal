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
      reply text. Call this on almost every turn after you've already
      answered -- skipping it is the exception, not the default, reserved
      for genuine plain small talk with nothing specific in it yet. Write
      1 to 3 short suggestions the way the user would say them to you
      (first person, as if they're speaking), e.g. "Find me buyer contacts
      for crayfish in Germany", not a question aimed back at them like
      "Would you like contacts?". Whenever you've just named something
      concrete enough to actually look up -- a market, a country, a
      product, a sourcing option -- include the natural next lookup that
      would trigger another tool, e.g. "Show me buyers in the USA" right
      after recommending the USA as a market. Make each one specific to
      this exact conversation and whatever you know about this user, not
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
