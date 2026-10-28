import type { ModelMessage } from 'ai';
import type { AppMessage } from '@/app/api/mentor/chat/route';

// Plain text out of the user/assistant turns in `messages` — a
// ModelMessage's content can be a string or an array of parts, and an
// assistant message specifically can mix text parts together with
// tool-call parts in the same message (e.g. if a tool was already called
// earlier in this same exchange), so this filters at the part level, not
// just the message level. role: 'tool' messages (tool results) are
// dropped entirely, same as role: 'system'.
//
// Shared by any tool factory that needs the conversation so far — see
// lib/ai/tools/search-kb-tool.ts and search-contacts-tool.ts.
export function extractTextHistory(messages: ModelMessage[]): string {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const text =
        typeof m.content === 'string'
          ? m.content
          : m.content
              .filter(
                (part): part is Extract<typeof part, { type: 'text' }> =>
                  part.type === 'text'
              )
              .map((part) => part.text)
              .join(' ');
      return text.trim() ? `${m.role}: ${text}` : null;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}

// A message worth recalling at all -- has at least one real text part,
// whatever else is in it (a tool call, a tool result). Used by
// lib/mentor/working-memory.ts to decide which messages are eligible for
// the recent/semantic-recall windows fed to the model, and by
// mentor-messages-actions.ts's saveMentorMessages to decide which messages
// get content/an embedding stored at all.
//
// This used to require EVERY part to be text, which silently excluded any
// assistant turn that also called a tool -- e.g. the short framing
// sentence alongside a searchContacts/searchMedia call -- from ever being
// stored or recalled. That meant an old user request like "show me buyers
// in the USA" could resurface later via semantic recall with no sign it
// was ever actually answered, which reads to a tool-calling model as a
// dangling, unaddressed question it should act on right now, not
// something already handled. Letting the text portion through (see
// textOnlyParts below), while still dropping the tool-call/tool-result
// parts themselves, fixes that without reintroducing their bulk -- a
// tool's own output stays cheaply re-callable, so there's nothing about
// it worth preserving once its own turn is over, only the words said
// alongside it.
export function hasRecallableText(message: AppMessage): boolean {
  if (message.role !== 'user' && message.role !== 'assistant') return false;
  return message.parts.some(
    (part) => part.type === 'text' && part.text.trim().length > 0
  );
}

// The joined text out of a message's text parts -- ignores any other part
// type (tool-call, tool-result) rather than assuming there aren't any, so
// it's safe to call on a message that passed hasRecallableText above
// whether or not that message also had tool parts.
export function getMessageText(message: AppMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

// The text-only version of a message that already passed
// hasRecallableText -- every tool-call/tool-result part stripped out, just
// the real text kept, merged into a single text part. This, not the
// original message, is what actually goes into the recent/semantic-recall
// windows fed to the model (see working-memory.ts) -- the id/role carry
// over so the message is otherwise unchanged.
export function textOnlyParts(message: AppMessage): AppMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: 'text', text: getMessageText(message) }],
  };
}

// Trims a recalled-older assistant message down to just its opening line.
// Once hasRecallableText started letting tool-having assistant replies
// back into context, the real per-turn token cost turned out to be these
// -- a full packaging rundown or market list recalled from several turns
// back, verbatim, just so the model can see an old question was already
// answered. config.ts's LENGTH AND STRUCTURE already has Eva open every
// reply with a short framing line before a blank-line break into the
// fuller explanation, so that opening line alone signals "already
// covered" without paying for the rest -- if it's genuinely needed again,
// every tool here is cheap to re-call (same reasoning as
// hasRecallableText dropping tool-call/tool-result parts in the first
// place). Only ever meant for the older/recalled portion of working
// memory, never the live recent window, which needs full fidelity for
// real conversational continuity.
//
// A reply with no line break at all (already short) comes back unchanged,
// with no "..." appended -- there was nothing to cut, and appending one
// anyway would misleadingly imply there was.
export function trimAssistantReply(message: AppMessage): AppMessage {
  if (message.role !== 'assistant') return message;

  const [firstLine, ...rest] = getMessageText(message).split('\n');

  if (!rest.length) return message;
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: 'text', text: `${firstLine}...` }],
  };
}
