import type { AppMessage } from '@/app/api/mentor/chat/route';

// True once a message has anything actually worth rendering -- non-empty
// text, or a tool part that's reached output-available (a tool call still
// streaming its input, or awaiting its result, renders nothing on its
// own). Used by mentor-chat-client.tsx for both its loading-indicator
// condition and filtering the message list below it, so the two stay in
// sync by construction.
export function messageHasVisibleContent(message: AppMessage): boolean {
  return message.parts.some(
    (part) =>
      (part.type === 'text' && part.text.trim().length > 0) ||
      ('state' in part && part.state === 'output-available')
  );
}

// A type predicate, not a plain boolean check -- Array.prototype.find
// only narrows its result past AppMessage['parts'][number] when the
// callback is actually typed as one, which is what lets
// mentor-chat-client.tsx's dynamicSuggestions.output be real
// suggestNextSteps output (via AppMessage's InferUITools, see
// lib/ai/message.ts) instead of needing its own manual cast.
type SuggestNextStepsResult = Extract<
  AppMessage['parts'][number],
  { type: 'tool-suggestNextSteps'; state: 'output-available' }
>;
export function isSuggestNextStepsResult(
  part: AppMessage['parts'][number]
): part is SuggestNextStepsResult {
  return part.type === 'tool-suggestNextSteps' && part.state === 'output-available';
}
