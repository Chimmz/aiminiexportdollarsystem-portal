import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type InferUITools,
  type UIMessage,
} from 'ai';
import { chatModel } from '@/lib/ai/models';
import { getTools } from '@/lib/ai/tools';
import { getCurrentUserFirstName } from '@/lib/utils/user-utils';
import { getCurrentUser } from '@/lib/actions/user-actions';
import { getUserMemory } from '@/lib/actions/memory-actions';
import {
  clearMentorMessages,
  getMentorMessages,
  saveMentorMessages,
} from '@/lib/actions/mentor-messages-actions';
import { recordTokenUsage } from '@/lib/actions/token-usage-actions';
import { activateUserOnFirstMessage } from '@/lib/actions/access-actions';
import { getFxRates } from '@/lib/actions/fx-actions';
import { buildSystemPrompt } from './config';
import { checkMentorChatLimits, redactSearchContactsOutputs } from './_utils';
import { buildWorkingMemoryMessages } from '@/lib/mentor/working-memory';
import { WORKING_MEMORY_LIMITS } from '@/lib/mentor/limits';

// Matt Pocock's InferUITools trick: map getTools()'s own inferred return
// type into each tool's { input, output } shape, so every tool part
// (part.type 'tool-searchKb', 'tool-manageMemory', etc.) is precisely
// typed end to end -- here and in every mentor chat UI file below --
// instead of the manual `part.input as {...}` / `part.output as {...}`
// casts ConversationMessages used to need for each one.
type AppTools = InferUITools<Awaited<ReturnType<typeof getTools>>>;

// The one UI message type used throughout the mentor chat -- this route's
// streamText response, useChat in mentor-chat-client.tsx, and the parts
// switch in conversation-messages.tsx all import it from here rather than
// using the generic UIMessage. No message metadata (first type param)
// yet, hence `never`.
//
// 'frontend-action': a signal-only data part with no visual rendering of
// its own (ConversationMessages never matches it in its parts switch).
// 'refresh-sidebar' is written whenever manageMemory actually saved
// something mid-turn; 'refresh-usage' is written whenever this turn
// recorded real token usage (i.e. almost every turn, unlike the
// conditional memory one). mentor-chat-client.tsx's useChat onData
// watches for both and tells the chat-controls rail -- a tree sibling,
// not a descendant, see mentor-context.tsx -- to refetch memory/usage
// right away instead of only loading them once on mount.
export type AppMessage = UIMessage<
  never,
  { 'frontend-action': 'refresh-sidebar' | 'refresh-usage' },
  AppTools
>;

export async function POST(req: Request) {
  // The client (mentor-chat-client.tsx's prepareSendMessagesRequest) sends
  // only the single newest message now, not the whole conversation --
  // same "client sends the delta, server reconstructs the rest from
  // storage" pattern saveMentorMessages/onFinish already use on the write
  // side, now applied to the read side too (mirrors Matt Pocock's own
  // `[...(chat?.messages ?? []), body.message]`).
  const { message } = (await req.json()) as { message: AppMessage };

  if (!message) {
    return new Response('message is required', { status: 400 });
  }

  const [user, fxRates] = await Promise.all([getCurrentUser(), getFxRates()]);

  if (!user) return new Response('Not signed in', { status: 401 });

  const userFirstName = getCurrentUserFirstName(user);

  // Blocks outright before the model is ever called -- a trial user over
  // their lifetime token budget, anyone over the rolling-window abuse
  // rate limit, or an expired paid period. See _utils.ts's
  // checkMentorChatLimits for why these are two independent checks, not
  // one. Persisted history is fetched in the same round trip, since it
  // depends on nothing checkMentorChatLimits produces.
  const [conversationHistory, limitCheck] = await Promise.all([
    getMentorMessages(user.id),
    checkMentorChatLimits(user.id),
  ]);

  if (limitCheck.response) return limitCheck.response;

  const tier = limitCheck.tier;

  // The reconstructed full conversation: everything already persisted for
  // this user, plus the one new message the client just sent. Every
  // `messages` reference below (working memory, originalMessages, onFinish's
  // slice) still means exactly what it meant back when the client itself
  // sent the whole array -- only where the array comes from changed.
  const messages: AppMessage[] = [...conversationHistory, message];

  // Working memory (lib/mentor/working-memory.ts): trims that reconstructed
  // conversation down to its recent window plus whatever older messages are
  // actually semantically relevant right now, sized by plan tier -- see
  // WORKING_MEMORY_LIMITS' own comment in limits.ts for the reasoning on
  // the numbers themselves.
  const workingMemoryMessages = await buildWorkingMemoryMessages(
    user.id,
    WORKING_MEMORY_LIMITS[tier === 'active' ? 'active' : 'trial'],
    messages
  );
  const modelMessages = await convertToModelMessages(workingMemoryMessages);

  // getKnownCountries() underneath getTools is process-cached after the
  // first call, so this adds no real latency past a cold start.
  // activateUserOnFirstMessage only does anything the very first time
  // (user.activatedAt is the guard) -- see access-actions.ts for the full
  // chaining algorithm it runs then.
  const [userMemory, tools] = await Promise.all([
    getUserMemory(user.id),
    getTools(modelMessages, user.id),
    user.activatedAt ? Promise.resolve() : activateUserOnFirstMessage(user.id),
  ]);

  // True for exactly one request ever, per user: activateUserOnFirstMessage
  // above only sets users.activated_at once it's still null going into
  // this request, so this read (from the user object fetched before that
  // write happens) is a clean "is this literally their first message ever"
  // signal -- false again from their very next message onward, forever.
  const isFirstEverMessage = !user.activatedAt;

  const systemPrompt = buildSystemPrompt(
    userFirstName,
    userMemory,
    fxRates,
    isFirstEverMessage
  );

  const result = streamText({
    model: chatModel,
    instructions: systemPrompt,
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
    // createUIMessageStream (not a bare toUIMessageStream) for two things
    // on top of the normal stream conversion: `originalMessages` puts the
    // response in "persistence mode" (a stable id for the new assistant
    // message), and `execute`'s `writer` lets this write the
    // 'frontend-action' data part below -- toUIMessageStream's own result
    // is merged into it rather than returned directly.
    stream: createUIMessageStream<AppMessage>({
      originalMessages: messages,
      async execute({ writer }) {
        writer.merge(toUIMessageStream({ stream: result.stream }));

        // result.steps/result.usage both resolve once the full (possibly
        // multi-step) run finishes, independent of the merge above --
        // streamText tees its internal stream per-access (see
        // DefaultStreamTextResult.stream/steps/usage in
        // ai/src/generate-text/stream-text.ts), so reading them again
        // here doesn't race or double-consume the one toUIMessageStream
        // is reading. usage is already summed across every step of this
        // turn (a tool call, its result, and the final reply can each be
        // their own step under stopWhen above), not just the last one --
        // that's the real number checkMentorChatLimits' budget/rate-limit
        // math is counting against, not an estimate.
        const [steps, usage] = await Promise.all([result.steps, result.usage]);

        // Tell the chat-controls rail to refetch its memory list (via the
        // data part below) only when manageMemory actually ran this turn,
        // not on every single reply.
        const memoryToolWasCalled = steps.some((step) =>
          step.toolCalls.some((call) => call?.toolName === 'manageMemory')
        );
        if (memoryToolWasCalled) {
          writer.write({ type: 'data-frontend-action', data: 'refresh-sidebar' });
        }

        // Visibility into what each turn actually costs, broken down by
        // step -- a multi-step tool-calling loop resends the full system
        // prompt + tool schemas once per step, so this is how to see
        // where a turn's token cost is actually going. usage (the turn
        // total) is the sum of every step's own usage below.
        console.log('[mentor] token usage:', {
          userId: user.id,
          stepCount: steps.length,
          steps: steps.map((step) => ({
            toolCalls: step.toolCalls.map((call) => call?.toolName),
            inputTokens: step.usage.inputTokens,
            cacheReadTokens: step.usage.inputTokenDetails?.cacheReadTokens,
            outputTokens: step.usage.outputTokens,
          })),
          totalInputTokens: usage.inputTokens,
          totalOutputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        });

        if (usage.totalTokens) {
          try {
            await recordTokenUsage(user.id, usage.totalTokens);
            writer.write({ type: 'data-frontend-action', data: 'refresh-usage' });
          } catch (err) {
            console.error('[mentor] record token usage failed:', err);
          }
        }
      },
      onFinish: async ({ messages: finalMessages }) => {
        // `messages` (the request body) already includes the user's new
        // message -- it just hasn't been written to the messages table
        // yet, since persistence only happens here, once a reply actually
        // completes. finalMessages is that same array plus Eva's response,
        // so everything from index messages.length - 1 onward is exactly
        // the turn this request produced.
        const newMessages = finalMessages.slice(messages.length - 1);
        try {
          await saveMentorMessages(user.id, newMessages);
        } catch (err) {
          console.error('[mentor] persist messages failed:', err);
        }
      },
    }),
  });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return new Response('Not signed in', { status: 401 });
  }

  try {
    await clearMentorMessages(user.id);
  } catch (err) {
    console.error('[mentor] clear persisted messages failed:', err);
    return new Response('Failed to clear chat', { status: 500 });
  }

  return new Response(null, { status: 204 });
}
