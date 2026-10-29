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
// mentor-chat-client.tsx's dynamicSuggestions.data be real { suggestions }
// instead of needing its own manual cast. 'data-next-steps' is written by
// route.ts's generateNextSteps call (lib/mentor/next-steps.ts), not a
// tool result -- see that file for why this moved off the tool-call path.
type NextStepsResult = Extract<AppMessage['parts'][number], { type: 'data-next-steps' }>;
export function isNextStepsResult(part: AppMessage['parts'][number]): part is NextStepsResult {
  return part.type === 'data-next-steps';
}
