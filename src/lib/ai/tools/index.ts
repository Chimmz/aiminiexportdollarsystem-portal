import type { ModelMessage } from 'ai';
import { createSearchKbTool } from './search-kb-tool';
import { createSearchContactsTool } from './search-contacts-tool';
import { createManageMemoryTool } from './manage-memory-tool';
import { createSuggestNextStepsTool } from './suggest-next-steps-tool';
import { createCalculatePricingTool } from './calculate-pricing-tool';
import { createMediaSearchTool } from './media-search-tool';

export async function getTools(messages: ModelMessage[], userId: string | null) {
  return {
    searchKb: createSearchKbTool(messages),
    searchContacts: createSearchContactsTool(messages),
    suggestNextSteps: createSuggestNextStepsTool(),
    calculatePricing: createCalculatePricingTool(),
    searchMedia: createMediaSearchTool(),
    ...(userId ? { manageMemory: createManageMemoryTool(userId) } : {}),
  };
}
