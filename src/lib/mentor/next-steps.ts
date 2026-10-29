import { generateText, Output, type ModelMessage } from 'ai';
import { z } from 'zod';
import { queryRewriteModel } from '@/lib/ai/models';
import { extractTextHistory } from '@/lib/utils/conversation-utils';

// Suggestion chips used to be a tool (suggestNextSteps) the main model
// decided whether to call -- config.ts told it to "call it on almost
// every turn," but it stayed unreliable in practice, the same way
// searchKb/searchMedia did on a broad-feeling question: a cheap model
// juggling several possible tool calls at once doesn't reliably remember
// a low-stakes one on top of the higher-stakes ones. This moves it off
// that agentic decision entirely -- route.ts calls this deterministically
// after every reply that has real text, the same pattern
// search-contacts-tool.ts's regroundQueryFromHistory already uses for a
// different fallback (a focused, single-purpose model call triggered by
// code, not left to the main model's judgment).
//
// This prompt carries its own condensed slice of config.ts's grounding --
// product context (earning foreign currency is the whole point, so lean
// toward strong-currency markets by default) and a scoping instruction
// (follow the conversation's current topic, don't resurface an older one
// still sitting in the transcript) -- rather than inheriting either from
// the main system prompt, which this call never sees. Without that, a
// conversation about cassava flour produced suggestions mixing in
// "crayfish" from several turns back and defaulting to "buyers in
// Africa," neither of which the main model would do, since it actually
// has ANSWERING WITHIN SCOPE and PRODUCT CONTEXT to work from.
const NextStepsSchema = z.object({
  suggestions: z
    .array(z.string())
    .max(3)
    .describe(
      'Short, specific, first-person suggestions phrased as something the user might say next. Empty only for genuine small talk with nothing specific in it yet.'
    ),
});

// modelMessages is the same working-memory-trimmed conversation the main
// model just answered from (see route.ts) -- finalReplyText is Eva's own
// just-finished reply, not yet part of that array (it only exists once
// the main streamText call is done), so it's appended to the transcript
// here instead of being another round trip to fetch it.
export async function generateNextSteps(
  modelMessages: ModelMessage[],
  finalReplyText: string
): Promise<string[]> {
  if (!finalReplyText.trim()) return [];

  const conversation =
    `${extractTextHistory(modelMessages)}\nassistant: ${finalReplyText}`.trim();

  try {
    const { output } = await generateText({
      model: queryRewriteModel,
      output: Output.object({ schema: NextStepsSchema }),
      prompt: `You're generating suggestion chips for "Eva," an export mentor chat app -- short, clickable next things the user might say, shown above their message box, not in Eva's own reply text.

What this platform is: a course and AI mentor teaching ordinary Nigerians to earn foreign currency through mini-export -- selling small quantities of Nigerian products to buyers abroad. Earning dollars/foreign currency is the whole point, so when a suggestion involves a market or buyer location and the conversation hasn't already named one, lean toward strong-currency markets (the USA, Europe, the UK, Canada), not a default to "Africa" generally -- that undercuts the entire premise of the course.

Stay grounded in what this conversation is actually about right now, especially its most recent turn. If the conversation has moved on to a different product or topic than something mentioned earlier, follow where it actually is now -- don't resurface an older product or topic just because it's still visible further up the transcript below.

What Eva can actually look up, so a suggestion never asks for something she has no way to deliver: real training-material guidance (sourcing, pricing, processing, packaging, shipping, documentation), real compiled buyer/supplier/logistics contacts, real reference photos of packaging, and a calculator for the user's own pricing numbers. Never suggest market trend analysis, price trend history, demand forecasts, statistics, survey data, or anything else that reads as market research or analytics -- Eva has no source for that and nothing here produces it. "Look up pricing trends for yam flour in the US" is exactly the kind of suggestion to never write.

Conversation so far, oldest first, ending with Eva's reply just now:
${conversation}

Write 1 to 3 short suggestions the way the user would actually say them to Eva (first person, as if they're speaking), e.g. "Find me buyer contacts for crayfish in Germany" -- never a question aimed back at them like "Would you like contacts?". Ground each one in this specific conversation, never generic. Whenever Eva's reply just named something concrete enough to actually look up -- a market, a country, a product, a sourcing option -- include the natural next lookup that would trigger another tool, e.g. "Show me buyers in the USA" right after she recommended the USA as a market.

Return an empty list only for genuine plain small talk with nothing specific in it yet (a greeting, a one-line acknowledgment) -- otherwise always return at least one suggestion.`,
    });
    return output.suggestions.slice(0, 3);
  } catch (err) {
    console.error('[mentor] generate next steps failed:', err);
    return [];
  }
}
