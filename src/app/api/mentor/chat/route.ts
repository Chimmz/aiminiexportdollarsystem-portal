import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { chatModel } from '@/lib/ai/models';
import { getTools } from '@/lib/ai/tools';
import { getCurrentUserFirstName, getCurrentUserId } from '@/lib/dal';
import { getJourneyProgress } from '@/lib/journey';
import { buildSystemPrompt } from './config';

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  if (!messages?.length) {
    return new Response('messages is required', { status: 400 });
  }

  const [modelMessages, userFirstName, userId] = await Promise.all([
    convertToModelMessages(messages),
    getCurrentUserFirstName(),
    getCurrentUserId(),
  ]);
  // Both depend on values resolved above (modelMessages / userId), so
  // neither can join the Promise.all above -- getKnownCountries()
  // underneath getTools is process-cached after the first call, so this
  // adds no real latency past a cold start.
  const [journeyProgress, tools] = await Promise.all([
    userId ? getJourneyProgress(userId) : Promise.resolve(null),
    getTools(modelMessages, userId),
  ]);

  const result = streamText({
    model: chatModel,
    instructions: buildSystemPrompt(userFirstName, journeyProgress),
    messages: modelMessages,
    tools,
    // Default is isStepCount(1) — the model would call the tool and the
    // loop would stop right there, never reading the tool's result back to
    // actually answer. 4 gives headroom for a tool call + a retry + the
    // final answer, without risking a runaway loop.
    stopWhen: stepCountIs(4),
    onError: ({ error }) => {
      console.error('[mentor] streamText error:', error);
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
