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
import { hasNoMemory } from '@/lib/utils/memory-utils';
import {
  clearMentorMessages,
  getMentorMessages,
  saveMentorMessages,
} from '@/lib/actions/mentor-messages-actions';
import { getMessageText } from '@/lib/utils/conversation-utils';
import { extractAndUpdateMemory } from '@/lib/mentor/memory-extraction';
import { recordTokenUsage } from '@/lib/actions/token-usage-actions';
import { activateUserOnFirstMessage } from '@/lib/actions/access-actions';
import { getFxRates } from '@/lib/actions/fx-actions';
import { buildSystemPrompt } from './config';
import { checkMentorChatLimits, redactSearchContactsOutputs } from './_utils';
import { buildWorkingMemoryMessages } from '@/lib/mentor/working-memory';
import { WORKING_MEMORY_LIMITS } from '@/lib/mentor/limits';

// Matt Pocock's InferUITools trick: map getTools()'s own inferred return
// type into each tool's { input, output } shape, so every tool part
// (part.type 'tool-searchKb', 'tool-searchContacts', etc.) is precisely
// typed end to end -- here and in every mentor chat UI file below --
// instead of the manual `part.input as {...}` / `part.output as {...}`
// casts ConversationMessages used to need for each one.
type AppTools = InferUITools<Awaited<ReturnType<typeof getTools>>>;

// The one UI message type used throughout the mentor chat -- this route's
// streamText response, useChat in mentor-chat-client.tsx, and the parts
// switch in conversation-messages.tsx all import it from here rather than
// using the generic UIMessage.
//
// Metadata (first type param): createdAt, for the chat's per-message
// timestamp (lib/utils/time-utils.ts). Persisted messages get it from the
// messages table's own created_at (mentor-messages-actions.ts's
// getMentorMessages); a message created live in this session gets it from
// mentor-chat-client.tsx's own sendMessage calls (the user's side) or this
// route's messageMetadata callback below (Eva's side, set at the 'start'
// stream event, not 'finish' -- close enough to when she actually started
// answering, not when she happened to finish). reaction/reactionNote are
// optional and only ever populated by getMentorMessages reading them back
// off the DB (see migrations/0029_message_reaction.sql) -- a message
// created live in this session has neither yet, since the like/dislike
// row (MessageFeedback) only ever appears once a reply is actually
// rendered, after which it starts persisting its own state directly via
// PATCH /api/mentor/messages/[id]/reaction, independent of this route.
//
// 'frontend-action': a signal-only data part with no visual rendering of
// its own (ConversationMessages never matches it in its parts switch).
// 'refresh-usage' is written whenever this turn recorded real token
// usage (i.e. almost every turn). mentor-chat-client.tsx's useChat onData
// watches for it and tells the chat-controls rail -- a tree sibling, not
// a descendant, see mentor-context.tsx -- to refetch usage right away
// instead of only loading it once on mount. Memory has no equivalent
// push anymore -- extractAndUpdateMemory runs in onFinish below, which
// has no `writer` to push through, so the client instead just calls
// router.refresh() after every turn (see mentor-chat-client.tsx) to pull
// fresh server-rendered facts back down, same idea, different mechanism.
export type AppMessage = UIMessage<
  { createdAt: string; reaction?: 'like' | 'dislike' | null; reactionNote?: string | null },
  { 'frontend-action': 'refresh-usage' },
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
  // this user, plus the one new message the client just sent.
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
  // chaining algorithm it runs then. userMemory here is this turn's
  // starting state -- nothing else writes to it mid-turn anymore (no
  // memory tool exists for the main model to call), so it's exactly what
  // extractAndUpdateMemory below needs as "what's already known" once the
  // turn finishes.
  const [userMemory, tools] = await Promise.all([
    getUserMemory(user.id),
    getTools(modelMessages),
    user.activatedAt ? Promise.resolve() : activateUserOnFirstMessage(user.id),
  ]);

  // Genuinely "first message ever," not just "first message since
  // activated_at was last set" -- users.activated_at is a billing-access
  // concept (see access-actions.ts), and this is a test/dev account that
  // gets reactivated across cleared conversations, which made it a false
  // signal here. The real thing this gates (FIRST MESSAGE EVER in
  // config.ts -- mirroring their opener, the one-time PDF guide check-in)
  // actually means "no prior conversation, and nothing remembered about
  // them yet" -- conversationHistory and userMemory above already answer
  // exactly that, directly.
  const isFirstEverMessage = conversationHistory.length === 0 && hasNoMemory(userMemory);

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
    // a suggestNextSteps call, and the final answer, without risking a
    // runaway loop.
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
        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            messageMetadata: ({ part }) =>
              part.type === 'start' ? { createdAt: new Date().toISOString() } : undefined,
          })
        );

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
        const [userMsg, ...assistantMsgs] = newMessages;

        // Both happen once per turn, off the same newMessages -- persist
        // first, then the deterministic memory extraction (see
        // lib/mentor/memory-extraction.ts for why this replaced the old
        // manageMemory tool entirely). userMemory is this turn's starting
        // state, from before the model ran -- nothing else writes to it
        // mid-turn, so it's exactly what "what's already known" should
        // mean here. newMessages[0] is the user's message, the rest
        // (normally just one) is Eva's reply.
        try {
          await saveMentorMessages(user.id, newMessages);
          await extractAndUpdateMemory(user.id, userMemory, {
            userText: userMsg ? getMessageText(userMsg) : '',
            assistantText: assistantMsgs.map((m) => getMessageText(m)).join('\n'),
          });
        } catch (err) {
          console.error(
            '[mentor] onFinish failed (persist messages or memory extraction):',
            err
          );
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
