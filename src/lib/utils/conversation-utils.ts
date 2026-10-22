import type { ModelMessage } from 'ai';

// Plain text out of the user/assistant turns in `messages` — a
// ModelMessage's content can be a string or an array of parts, and an
// assistant message specifically can mix text parts together with
// tool-call parts in the same message (e.g. if a tool was already called
// earlier in this same exchange), so this filters at the part level, not
// just the message level. role: 'tool' messages (tool results) are
// dropped entirely, same as role: 'system'.
//
// Shared by any tool factory that needs the conversation so far — see
// lib/ai/tools/answer-question-tool.ts and search-contacts-tool.ts.
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
