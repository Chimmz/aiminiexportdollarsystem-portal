'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScrollElements } from 'use-stick-to-bottom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { toast } from 'sonner';
import type { AppMessage } from '@/app/api/mentor/chat/route';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Container } from '@/components/layout/container';
import { MentorPromptInput } from '@/components/mentor/mentor-prompt-input';
import { AccessLimitBar } from '@/components/mentor/access-limit-bar';
import { ConversationMessages } from './conversation-messages';
import { MentorEmptyChat } from './empty-chat';
import { MentorControlsRail } from '@/components/dashboard/mentor-controls-rail';
import { useMentorChatState } from '@/contexts/mentor-context';
import { verifyAndActivatePayment } from '@/lib/actions/payments-actions';
import { ACCESS_EXPIRED_MESSAGE } from '@/lib/utils/access-messages';
import { paymentSuccessCopy } from '@/lib/utils/plan-utils';
import type { AccessStatus } from '@/lib/utils/user-utils';
import { starterPrompts } from '../config';
import { isSuggestNextStepsResult, messageHasVisibleContent } from '../_utils';

// Where a message blocked by the access-limit bar (402, see onError below)
// is stashed so it can be resent after an upgrade. A Paystack checkout is
// a real navigation away to another domain and back, which wipes useChat's
// in-memory state entirely -- and a message blocked before streamText ever
// ran never made it into the persisted mentor_messages table either (see
// route.ts's onFinish), so there's nothing server-side to recover it from.
// sessionStorage survives that round trip within the same tab/session
// without leaking into an unrelated later one.
const PENDING_RESEND_KEY = 'mentor:pendingMessageAfterUpgrade';

function stashPendingResend(text: string) {
  try {
    sessionStorage.setItem(PENDING_RESEND_KEY, text);
  } catch {
    // Private browsing / storage disabled -- the resend is a convenience,
    // not a guarantee; silently skip rather than break the error flow.
  }
}

function takePendingResend(): string | null {
  try {
    const text = sessionStorage.getItem(PENDING_RESEND_KEY);
    if (text) sessionStorage.removeItem(PENDING_RESEND_KEY);
    return text;
  } catch {
    return null;
  }
}

export function MentorChatClient({
  firstName,
  initialMessages,
  accessStatus,
}: {
  firstName: string | null;
  initialMessages: AppMessage[];
  accessStatus: AccessStatus;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get('prompt');
  const hasAutoSubmittedRef = useRef(false);
  // The exact text of whatever sendMessage was last asked to send, kept in
  // a ref (not read off `messages` state) so onError below always sees the
  // real value regardless of render timing -- see its own comment for why
  // this matters specifically for the 402 case.
  const lastSentTextRef = useRef<string | null>(null);

  // Opening/closing a tool-call panel inside a message (e.g.
  // SearchKbPanel) resizes the scrollable conversation the same way
  // new streamed text does, and Conversation (use-stick-to-bottom) can't
  // tell the two apart -- it just sees the content grow and, if already at
  // the bottom, auto-scrolls to keep the (now lower) bottom pinned, which
  // reads as "the chat jumped to the bottom" right when the user expanded
  // something they wanted to read. suppressAutoScrollRef briefly tells
  // Conversation's targetScrollTop below to leave the scroll position
  // alone for toggles like that, without touching the library itself.
  const suppressAutoScrollRef = useRef(false);

  const handlePanelToggle = useCallback(() => {
    suppressAutoScrollRef.current = true;
    window.setTimeout(() => {
      suppressAutoScrollRef.current = false;
    }, 400);
  }, []);

  // Seeded from the server-resolved accessStatus so an already-expired
  // user sees this the moment the page loads, before ever trying to send
  // a message -- not just reactively after a blocked request errors (the
  // onError case below, which is the only way to learn about the
  // trial-token-budget-exhausted case specifically, since that one isn't
  // derivable from accessStatus alone on the server side here).
  const [accessLimitMessage, setAccessLimitMessage] = useState<string | null>(
    accessStatus.status === 'expired' ? ACCESS_EXPIRED_MESSAGE : null
  );

  const { setHasMessages, bumpMemoryVersion, bumpUsageVersion } = useMentorChatState();

  const { messages, sendMessage, regenerate, status, setMessages } = useChat<AppMessage>({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/mentor/chat',
      prepareSendMessagesRequest: (req) => ({
        body: {
          message: req.messages[req.messages.length - 1], // Send only recent msgs
        },
      }),
    }),
    // route.ts writes 'refresh-sidebar' only when manageMemory actually
    // saved something mid-turn, and 'refresh-usage' whenever the turn
    // recorded real token usage (see that file's comment) -- bump the
    // matching shared counter MentorControlsRail watches so it refetches,
    // rather than reaching into the rail's state directly (it's a tree
    // sibling, not a descendant -- see mentor-context.tsx).
    onData: (dataPart) => {
      if (dataPart.type !== 'data-frontend-action') return;
      if (dataPart.data === 'refresh-sidebar') bumpMemoryVersion();
      if (dataPart.data === 'refresh-usage') bumpUsageVersion();
    },
    // checkMentorChatLimits (route.ts's _utils.ts) returns a plain-text
    // body on a blocked request (trial budget used up, rate-limited, or
    // expired access) -- the AI SDK's own createUIApiCallError reads a
    // non-OK response's body as-is into error.message when there's no
    // JSON envelope to unwrap (it also attaches the response's own status
    // as error.statusCode), so this is already the exact human sentence
    // to show, no parsing needed.
    //
    // 402 (budget exhausted or expired) is the persistent access-limit
    // bar, not a toast -- it doesn't go away on its own, so neither should
    // the reminder. 429 (temporary rate limit) stays a toast -- it clears
    // itself once the rolling window ages out, which a sticky bar would
    // overstate.
    //
    // statusCode undefined (not just some other number) means the request
    // never got an HTTP response at all -- offline, DNS failure, CORS, a
    // dropped connection mid-flight (createUIApiCallError only ever sets
    // statusCode from a real Response, see its own source) -- same as a
    // genuine 5xx from the route itself: both mean "this reply never
    // happened," not "you're not allowed to." Those get a friendly message
    // instead of the raw fetch error text ("Failed to fetch" means nothing
    // to a user) plus a Retry action wired to regenerate(), which re-sends
    // the exact same turn rather than requiring them to retype it -- safe
    // here because the failure happened without ever leaving the page, so
    // the user message is still sitting right there in `messages` for
    // regenerate() to resend from.
    onError: (error) => {
      const statusCode = 'statusCode' in error ? error.statusCode : undefined;

      if (statusCode === 402) {
        setAccessLimitMessage(error.message);
        if (lastSentTextRef.current) stashPendingResend(lastSentTextRef.current);
        return;
      }

      if (statusCode === 429) {
        toast(error.message);
        return;
      }

      toast(
        statusCode == null
          ? "Couldn't reach the server. Check your connection and try again."
          : 'Something went wrong sending that. Try again.',
        { action: { label: 'Retry', onClick: () => regenerate() } }
      );
    },
  });

  // Handed down to MentorControlsRail, which lives as this component's
  // sibling (see the two returns below) rather than a descendant -- the
  // rail has no reason to know useChat exists beyond this one callback.
  // Clears local state immediately (so the UI responds right away) and
  // the persisted history in the background -- without the DELETE call,
  // reloading the page would bring the old messages straight back, since
  // page.tsx re-seeds useChat from that same table.
  const handleClearChat = useCallback(() => {
    setMessages([]);
    fetch('/api/mentor/chat', { method: 'DELETE' }).catch((err) => {
      console.error('[mentor] clear persisted chat failed:', err);
    });
  }, [setMessages]);

  // Came here from a suggestion chip elsewhere (e.g. the dashboard home
  // card) via ?prompt= — auto-send it once on arrival.
  useEffect(() => {
    if (initialPrompt && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true;
      lastSentTextRef.current = initialPrompt;
      sendMessage({ text: initialPrompt });
    }
  }, [initialPrompt, sendMessage]);

  const handleSubmit = useCallback(
    (text: string) => {
      lastSentTextRef.current = text;
      sendMessage({ text });
    },
    [sendMessage]
  );

  const handleSuggestionClick = useCallback(
    (sugg: string) => {
      lastSentTextRef.current = sugg;
      sendMessage({ text: sugg });
    },
    [sendMessage]
  );

  // Arrival handling for the post-upgrade return trip:
  //
  // 1. A `reference` in the URL means checkout was started from this
  //    page's own access-limit bar (?from=mentor -- see
  //    access-limit-bar.tsx/payments-actions.ts's returnTo) and Paystack
  //    just redirected straight back here instead of the generic Upgrade
  //    callback page. Verify it ourselves (idempotent against the webhook,
  //    see verifyAndActivatePayment's own comment) so access unblocks the
  //    moment this page loads, show the same celebratory copy the
  //    callback page would have, then strip the query params so a refresh
  //    doesn't re-verify or re-show the toast.
  // 2. Either way -- that path, or arriving here after clicking "Continue
  //    with Eva" on the generic callback page -- if a message got stashed
  //    by onError's 402 branch above and access is no longer blocked,
  //    resend it automatically instead of leaving the user to retype
  //    something they already wrote once.
  const hasHandledArrivalRef = useRef(false);
  useEffect(() => {
    if (hasHandledArrivalRef.current) return;
    hasHandledArrivalRef.current = true;

    function resendIfPending() {
      const pending = takePendingResend();
      if (!pending) return;
      setAccessLimitMessage(null);
      toast('Resending your message...');
      sendMessage({ text: pending });
    }

    const reference = searchParams.get('reference') ?? searchParams.get('trxref');
    if (!reference) {
      // Mirrors checkMentorChatLimits' own blocked condition (see
      // _utils.ts) using the data already in accessStatus, so this only
      // fires when a message would actually be allowed through now.
      const isBlocked =
        accessStatus.status === 'expired' ||
        (accessStatus.status === 'trial' &&
          accessStatus.trialTokensUsed >= accessStatus.trialTokenBudget);
      if (!isBlocked) resendIfPending();
      return;
    }

    verifyAndActivatePayment(reference).then((result) => {
      router.replace('/dashboard/mentor');
      if (result.status === 'success') {
        const copy = paymentSuccessCopy(result.planId, result.endsAt);
        toast.success(copy.heading, { description: copy.body });
        router.refresh();
        resendIfPending();
      } else if (result.status === 'pending') {
        toast(
          "Still confirming your payment. We'll credit it automatically once it clears."
        );
      } else {
        toast("We couldn't confirm that payment. Try again from the Upgrade page.");
      }
    });
  }, [searchParams, accessStatus, router, sendMessage]);

  const isEmpty = messages.length === 0;

  // Lets AppSidebar (a sibling in the tree, not a descendant -- it lives
  // in dashboard/layout.tsx, above this page's own children slot) react
  // to whether this conversation has messages, so it can collapse to
  // icon-only once chatting starts and expand back once it's empty again.
  // See mentor-context.tsx for why this needs a context at all.
  useEffect(() => {
    setHasMessages(!isEmpty);
  }, [isEmpty, setHasMessages]);

  // Eva's own personalized suggestions for this conversation, read off
  // the most recent assistant turn that actually called suggestNextSteps
  // (see suggest-next-steps-tool.ts). Looked up from the most recent
  // assistant message, not necessarily the very last message overall, so
  // the chips from her last turn stay visible while the next reply is
  // still streaming in rather than disappearing and reappearing.
  const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').at(-1);
  const dynamicSuggestions = lastAssistantMessage?.parts.find(isSuggestNextStepsResult);

  // `status` flips from "submitted" to "streaming" the moment ANY part of
  // the reply starts arriving, including a tool call's input streaming in
  // -- not necessarily visible text. That left a dead gap during a tool
  // call (e.g. searchKb taking a second or so): the shimmer loader
  // disappeared the instant streaming began, but nothing replaced it until
  // the tool finished and either a result card or real text showed up.
  // Keep the loader up through that gap by also checking whether the last
  // message actually has anything on screen yet (non-empty text, or a tool
  // part that's reached output-available), not just the raw status.
  const lastMessage = messages.at(-1);
  const lastMessageHasVisibleContent = lastMessage
    ? messageHasVisibleContent(lastMessage)
    : false;
  const showLoadingIndicator =
    status === 'submitted' ||
    (status === 'streaming' &&
      (lastMessage?.role !== 'assistant' || !lastMessageHasVisibleContent));

  // While the loader above is standing in for the current reply, skip
  // rendering that same (still contentless) assistant message bubble from
  // the list below it -- otherwise an empty bubble stacks right on top of
  // the loader, adding a blank gap between them.
  const visibleMessages =
    showLoadingIndicator &&
    lastMessage?.role === 'assistant' &&
    !lastMessageHasVisibleContent
      ? messages.slice(0, -1)
      : messages;

  // Shared between the centered empty-state layout and the normal
  // bottom-pinned layout -- built from scratch (mentor-prompt-input.tsx),
  // not ai-elements' PromptInput; see that file for why. White's a
  // confirmed correct background-color here (verified via computed
  // styles), but on the empty-state hero the radial gradient behind it
  // (empty.tsx) has already faded close to white by the time it reaches
  // the input lower on the screen, so a flat white fill with no shadow
  // reads as no box at all -- just its border. A standing shadow gives it
  // real definition regardless of how closely the fill matches whatever's
  // behind it.
  const promptInput = (
    <div className="relative">
      {accessLimitMessage && <AccessLimitBar message={accessLimitMessage} />}
      <MentorPromptInput
        status={status}
        placeholder="Ask Eva anything about sourcing, pricing, or buyers..."
        onSubmit={handleSubmit}
        className={isEmpty ? 'bg-white! shadow-md' : 'bg-gray-50'}
      />
    </div>
  );

  if (isEmpty) {
    const starterSuggestions = (
      <Suggestions>
        {starterPrompts.map((prompt) => (
          <Suggestion
            key={prompt}
            suggestion={prompt}
            onClick={handleSuggestionClick}
            size="xs"
            className="px-3 font-normal"
          />
        ))}
      </Suggestions>
    );
    // No controls rail here -- there's no chat yet to clear and nothing
    // saved to memory worth surfacing controls for; it only earns its
    // place once a conversation actually exists (see the return below).
    return (
      <MentorEmptyChat
        firstName={firstName}
        promptInput={promptInput}
        suggestions={starterSuggestions}
      />
    );
  }

  // Once the conversation is underway, the generic starter prompts are
  // gone for good — the chip row shows only Eva's own suggestions for
  // this specific turn, and shows nothing at all on a turn where she had
  // nothing specific worth suggesting.
  const chatSuggestions = dynamicSuggestions?.output?.suggestions?.length ? (
    <Suggestions>
      {dynamicSuggestions.output.suggestions.map((suggestion) => (
        <Suggestion
          key={suggestion}
          suggestion={suggestion}
          onClick={handleSuggestionClick}
        />
      ))}
    </Suggestions>
  ) : null;

  return (
    <div className="flex h-full">
      <MentorControlsRail
        onClearChat={handleClearChat}
        hasMessages={messages.length > 0}
        accessStatus={accessStatus}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pt-4 pb-6">
        <Conversation
          className="min-h-0 flex-1"
          targetScrollTop={(targetScrollTop, { scrollElement }: ScrollElements) =>
            suppressAutoScrollRef.current ? scrollElement.scrollTop : targetScrollTop
          }
        >
          <ConversationContent
            className="mb-16 flex flex-col"
            scrollClassName="scrollbar-none"
          >
            <ConversationMessages
              messages={visibleMessages}
              showLoadingIndicator={showLoadingIndicator}
              onPanelToggle={handlePanelToggle}
              onSendMessage={(text) => sendMessage({ text })}
            />
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <Container className="shrink-0 space-y-3 pt-4">
          {chatSuggestions}
          {promptInput}
        </Container>
      </div>
    </div>
  );
}
