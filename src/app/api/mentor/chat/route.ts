import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type JSONValue,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import { chatModel } from '@/lib/ai/models';
import { getTools } from '@/lib/ai/tools';
import { getCurrentUserFirstName } from '@/lib/utils/user-utils';
import { getCurrentUser } from '@/lib/actions/user-actions';
import { getUserMemory } from '@/lib/actions/memory-actions';
import { summarizeContactsForModel, type ContactCard } from '@/lib/utils/contacts-utils';
import { buildSystemPrompt } from './config';

// Swaps a searchContacts tool result's real ContactCard[] (names, phones,
// emails, prices) out for a small summary before it's sent to the model
// on any step after the call -- see summarizeContactsForModel's own
// comment for why: telling the model not to repeat the contacts in text
// wasn't reliable enough on its own with a cheaper model, so this removes
// its ability to, instead of only asking it not to. Never touches the UI:
// mentor-chat-client.tsx reads the full cards straight off the
// tool-output-available stream event, which already fired before this
// ever runs.
function redactSearchContactsOutputs(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== 'tool') return message;
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type !== 'tool-result' || part.toolName !== 'searchContacts') return part;
        if (part.output.type !== 'json') return part;

        const value = part.output.value as { contacts?: unknown; [key: string]: unknown };
        if (!Array.isArray(value.contacts)) return part;

        const { contacts, ...rest } = value as { contacts: ContactCard[] };
        return {
          ...part,
          output: {
            ...part.output,
            value: { ...rest, contacts: summarizeContactsForModel(contacts) } as unknown as JSONValue,
          },
        };
      }),
    };
  });
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  if (!messages?.length) {
    return new Response('messages is required', { status: 400 });
  }

  const [modelMessages, user] = await Promise.all([
    convertToModelMessages(messages),
    getCurrentUser(),
  ]);
  const userId = user?.id ?? null;
  const userFirstName = getCurrentUserFirstName(user);

  // Both depend on userId resolved above, so neither can join the
  // Promise.all above -- getKnownCountries() underneath getTools is
  // process-cached after the first call, so this adds no real latency
  // past a cold start.
  const [userMemory, tools] = await Promise.all([
    userId ? getUserMemory(userId) : Promise.resolve(null),
    getTools(modelMessages, userId),
  ]);

  const result = streamText({
    model: chatModel,
    instructions: buildSystemPrompt(userFirstName, userMemory),
    messages: modelMessages,
    tools,
    // Default is isStepCount(1) — the model would call the tool and the
    // loop would stop right there, never reading the tool's result back to
    // actually answer. 6 gives headroom for a retrieval/contacts tool call,
    // a manageMemory call, a suggestNextSteps call, and the final answer,
    // without risking a runaway loop.
    stopWhen: stepCountIs(6),
    prepareStep: ({ messages: stepMessages }) => ({
      messages: redactSearchContactsOutputs(stepMessages),
    }),
    onError: ({ error }) => {
      console.error('[mentor] streamText error:', error);
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
