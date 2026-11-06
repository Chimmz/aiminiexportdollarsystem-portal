import {
  formatFullExportJourneyProgressForPrompt,
  type FullExportJourneyProgress,
} from './journey-utils';

// Eva's memory, as a user-facing umbrella over three underlying stores:
// loose profile facts and the export journey (getting-started steps, plus
// every deal and its own progress -- journey-utils.ts). The actual
// reads/writes live in lib/actions/memory-actions.ts and
// lib/actions/journey-actions.ts -- this file is just the shared shapes
// and the pure prompt formatting over them.

export interface ProfileFact {
  factType: string;
  factValue: string;
  confidence: number | null;
  source: 'chat_extracted' | 'user_provided';
}

export interface UserMemory {
  facts: ProfileFact[];
  exportJourneyProgress: FullExportJourneyProgress;
}

// True only when literally nothing has ever been recorded for this user --
// no loose facts, no getting-started step even started, no deal past or
// present. Used by route.ts (alongside "no prior persisted messages") to
// decide isFirstEverMessage, instead of users.activated_at -- activation
// is a billing-access concept (see access-actions.ts) that can already be
// set from an earlier conversation that was since cleared, which made it
// a false signal for "is this genuinely their first message ever," not a
// true one.
export function hasNoMemory(memory: UserMemory): boolean {
  if (memory.facts.length > 0) return false;
  const { setup, activeDeals, pastDeals } = memory.exportJourneyProgress;
  if (activeDeals.length > 0 || pastDeals.length > 0) return false;
  return Object.values(setup).every((step) => step.status === 'not_started');
}

// Dynamic, per-user text injected at the very end of the system prompt
// (see config.ts) -- same caching reason userFirstName sits there:
// anything that varies per request breaks prompt caching for everything
// after it, so it goes last.
export function formatMemoryForPrompt(memory: UserMemory): string {
  const factLines =
    memory.facts.length > 0
      ? memory.facts.map((f) => `- ${f.factType}: ${f.factValue}`).join('\n')
      : '(none recorded yet)';

  return `Facts learned about this user:\n${factLines}\n\n${formatFullExportJourneyProgressForPrompt(memory.exportJourneyProgress)}`;
}
