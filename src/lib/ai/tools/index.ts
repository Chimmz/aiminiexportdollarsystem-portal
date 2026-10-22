import type { ModelMessage, ToolSet } from "ai";
import { createAnswerQuestionTool } from "./answer-question-tool";
import { createSearchContactsTool } from "./search-contacts-tool";
import { createManageMemoryTool } from "./manage-memory-tool";
import { createSuggestNextStepsTool } from "./suggest-next-steps-tool";
import { createGetExchangeRateTool } from "./get-exchange-rate-tool";
import { createCalculatePricingTool } from "./calculate-pricing-tool";

// Single place that assembles every tool Eva can call, keyed by the name
// the model calls them by. `messages` is threaded through to each tool
// factory so a tool can close over the conversation history if it needs
// it — see answer-question-tool.ts and search-contacts-tool.ts for how
// each one uses (or doesn't use) its copy. Async because
// createSearchContactsTool needs to await the known-countries list before
// it can build its schema. `userId` is null for a signed-out caller (see
// getCurrentUser in lib/utils/user-utils.ts) -- manageMemory is
// user-scoped, so it's left out of the tool set entirely rather than
// given a dangling or fake user id.
export async function getTools(
  messages: ModelMessage[],
  userId: string | null
): Promise<ToolSet> {
  const tools: ToolSet = {
    answerQuestion: createAnswerQuestionTool(messages),
    searchContacts: await createSearchContactsTool(messages),
    suggestNextSteps: createSuggestNextStepsTool(),
    getExchangeRate: createGetExchangeRateTool(),
    calculatePricing: createCalculatePricingTool(),
  };
  if (userId) {
    tools.manageMemory = createManageMemoryTool(userId);
  }
  return tools;
}
