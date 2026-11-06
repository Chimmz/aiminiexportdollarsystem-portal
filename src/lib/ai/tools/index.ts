import type { ModelMessage } from 'ai';
import { createSearchKbTool } from './search-kb-tool';
import { createSearchContactsTool } from './search-contacts-tool';
import { createSuggestNextStepsTool } from './suggest-next-steps-tool';
import { createCalculatePricingTool } from './calculate-pricing-tool';
import { createMediaSearchTool } from './media-search-tool';
import { createSearchVideosTool } from './search-videos-tool';

// No manageMemory tool anymore -- memory is written deterministically
// after each turn instead (see lib/mentor/memory-extraction.ts), not by
// the main model deciding to call a tool for it. That was the only tool
// needing userId, so no tool here is user-scoped anymore.
export async function getTools(messages: ModelMessage[]) {
  return {
    searchKb: createSearchKbTool(messages),
    searchContacts: createSearchContactsTool(),
    suggestNextSteps: createSuggestNextStepsTool(),
    calculatePricing: createCalculatePricingTool(),
    searchMedia: createMediaSearchTool(),
    searchVideos: createSearchVideosTool(),
  };
}
