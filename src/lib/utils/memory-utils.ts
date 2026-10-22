import { formatJourneyProgressForPrompt, type JourneyProgress } from './journey-utils';

// Eva's memory, as a user-facing umbrella over three underlying stores:
// loose profile facts and the two fixed-step progress trackers
// (journey-utils.ts). The actual reads/writes live in
// lib/actions/memory-actions.ts and lib/actions/journey-actions.ts -- this
// file is just the shared shapes and the pure prompt formatting over them.

export interface ProfileFact {
  factType: string;
  factValue: string;
  confidence: number | null;
  source: 'chat_extracted' | 'user_provided';
}

export interface UserMemory {
  facts: ProfileFact[];
  journey: JourneyProgress;
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

  return `Facts learned about this user:\n${factLines}\n\n${formatJourneyProgressForPrompt(memory.journey)}`;
}
