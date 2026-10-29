import type { ModelMessage } from 'ai';
import { createSearchKbTool } from './search-kb-tool';
import { createSearchContactsTool } from './search-contacts-tool';
import { createManageMemoryTool } from './manage-memory-tool';
import { createCalculatePricingTool } from './calculate-pricing-tool';
import { createMediaSearchTool } from './media-search-tool';

// suggestNextSteps used to be a tool here -- it's now a deterministic,
// code-triggered call (lib/mentor/next-steps.ts) run after every reply
// instead of something the main model decides whether to call. See that
// file's own comment for why.
export async function getTools(messages: ModelMessage[], userId: string | null) {
  return {
    searchKb: createSearchKbTool(messages),
    searchContacts: createSearchContactsTool(messages),
    calculatePricing: createCalculatePricingTool(),
    searchMedia: createMediaSearchTool(),
    ...(userId ? { manageMemory: createManageMemoryTool(userId) } : {}),
  };
}
