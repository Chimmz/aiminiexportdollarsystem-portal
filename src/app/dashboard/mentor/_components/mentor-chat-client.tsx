'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScrollElements, StickToBottomContext } from 'use-stick-to-bottom';
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
import {
  verifyAndActivatePayment,
  verifyAndActivateFlutterwavePayment,
  type VerifyPaymentResult,
} from '@/lib/actions/payments-actions';
import { ACCESS_EXPIRED_MESSAGE } from '@/lib/utils/access-messages';
import { paymentSuccessCopy } from '@/lib/utils/plan-utils';
import type { AccessStatus } from '@/lib/utils/user-utils';
import type { SavedPriceQuote } from '@/lib/actions/pricing-actions';
import type { ProfileFact } from '@/lib/utils/memory-utils';
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
  savedPriceQuotes,
  initialFacts,
}: {
  firstName: string | null;
  initialMessages: AppMessage[];
  accessStatus: AccessStatus;
  // Keyed by calculatePricing tool call id -- see page.tsx and
  // pricing-actions.ts's getPriceQuotesByUser. Only ever set once, from
  // the server, on page load -- a quote saved live mid-session doesn't
  // need to flow back in here, since PricingCalculatorPanel's own local
  // `saved` state already reflects that without a reload.
  savedPriceQuotes: Record<string, SavedPriceQuote>;
  // Passed straight through to MentorControlsRail -- this component has
  // no use for it itself beyond that. Refreshed on every turn via
  // useChat's onFinish below calling router.refresh(), which re-runs
  // page.tsx and sends a new value down, not just on page load.
  initialFacts: ProfileFact[];
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

  // Gives this component (an ANCESTOR of <Conversation>, which owns the
  // actual scrollable element internally) a way to reach that element
  // from outside it -- use-stick-to-bottom's own escape hatch for exactly
  // this (StickToBottomProps.contextRef), rather than lifting the whole
  // instance up here, which would also require re-threading
  // targetScrollTop's config (see that prop below) into the lifted
  // instance instead of leaving it as a prop on <Conversation>.
  const stickToBottomContextRef = useRef<StickToBottomContext | null>(null);

  // The chat column (<Conversation>, flex-1) sits beside
  // MentorControlsRail (a sibling, not a descendant) -- a wheel scroll
  // over empty space next to a too-narrow conversation column has nothing
  // of its own to scroll, so it silently did nothing instead of scrolling
  // the conversation, same class of "dead zone" as the dashboard page's
  // own content being narrower than its scrollable container. Forwarded
  // here rather than fixed at the layout level, since the rail and the
  // conversation are genuinely two different scrollable things, not one
  // container that's merely too narrow.
  //
  // The whole rail is excluded, not just the Memory section's own nested
  // ScrollArea -- the rail's own outer wrapper
  // (mentor-controls-rail.tsx's `overflow-y-auto` div) is a real,
  // independently scrollable container once its content (usage charts,
  // journey fields, memory list, add-fact form) overflows, not a plain
  // non-scrolling sibling the way it was when this handler was first
  // written. `[data-slot="scroll-area-viewport"]` alone only ever caught
  // nested Radix ScrollArea instances, not that outer plain div, so a
  // wheel scroll anywhere over the rail outside that one nested list was
  // being hijacked into scrolling the conversation instead of the rail
  // itself. `aside` is the rail's own root element
  // (mentor-controls-rail.tsx) -- excluding by that tag, not a specific
  // internal class, so this stays correct regardless of how the rail's
  // internals change later.
  const handleWheelOutsideConversation = useCallback((e: React.WheelEvent) => {
    const scrollEl = stickToBottomContextRef.current?.scrollRef.current;
    if (!scrollEl) return;
    const target = e.target as HTMLElement;
    if (scrollEl.contains(target)) return;
    if (target.closest('aside')) return;
    scrollEl.scrollTop += e.deltaY;
  }, []);

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

  const { setHasMessages, bumpUsageVersion } = useMentorChatState();

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
    // route.ts writes 'refresh-usage' whenever the turn recorded real
    // token usage (see that file's comment) -- bump the shared counter
    // MentorControlsRail watches so it refetches, rather than reaching
    // into the rail's state directly (it's a tree sibling, not a
    // descendant -- see mentor-context.tsx). Memory has no equivalent
    // data part -- see onFinish below instead.
    onData: (dataPart) => {
      if (dataPart.type !== 'data-frontend-action') return;
      if (dataPart.data === 'refresh-usage') bumpUsageVersion();
      // Matt Pocock's course uses a push-based data part for this (its
      // own name, 'refresh-sidebar' -- not a label that ever meant
      // anything here), fired the moment memory is actually saved
      // rather than waiting for the whole turn to finish. Left commented
      // out, not wired up, because it has nothing to fire on in this
      // codebase: extractAndUpdateMemory runs in route.ts's onFinish,
      // which has no `writer` to push a data part through mid-stream --
      // only `execute` has that, and moving extraction back there was
      // explicitly ruled out. If the onFinish-only router.refresh() below
      // ever proves too slow or unreliable in practice, doing this for
      // real means adding a new data part to AppMessage's frontend-action
      // union AND writing it from `execute` (e.g. right after
      // persistence, as a second pass) -- not just uncommenting a line.
      // if (dataPart.data === 'memory-saved') router.refresh();
    },
    // The deterministic memory extraction (lib/mentor/memory-extraction.ts)
    // runs server-side in route.ts's onFinish, which has no `writer` to
    // push a signal back through mid-stream -- so instead of a data part,
    // this just re-runs page.tsx's server-side data fetch once the whole
    // reply is in, which re-fetches this user's profile facts and sends a
    // fresh `initialFacts` prop down to MentorControlsRail. Unconditional
    // (not only when something was actually saved) since there's no cheap
    // way to know that client-side anymore -- a router.refresh() that
    // finds nothing changed is harmless, just a wasted round trip.
    onFinish: () => {
      router.refresh();
    },

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

  // Every outgoing user message's own createdAt, set client-side here --
  // the only place a user message actually gets sent, across every entry
  // point below (typed, a suggestion chip, a stashed resend, the pricing
  // calculator's save). See route.ts's AppMessage comment for why the
  // timestamp lives in message metadata (lib/utils/time-utils.ts reads it
  // back out for display).
  const sendUserMessage = useCallback(
    (text: string) =>
      sendMessage({ text, metadata: { createdAt: new Date().toISOString() } }),
    [sendMessage]
  );

  // Came here from a suggestion chip elsewhere (e.g. the dashboard home
  // card) via ?prompt= — auto-send it once on arrival.
  useEffect(() => {
    if (initialPrompt && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true;
      lastSentTextRef.current = initialPrompt;
      sendUserMessage(initialPrompt);
    }
  }, [initialPrompt, sendUserMessage]);

  const handleSubmit = useCallback(
    (text: string) => {
      lastSentTextRef.current = text;
      sendUserMessage(text);
    },
    [sendUserMessage]
  );

  // Eva's own personalized suggestions for this conversation, read off
  // the most recent assistant turn that actually called suggestNextSteps
  // (see suggest-next-steps-tool.ts). Looked up from the most recent
  // assistant message, not necessarily the very last message overall, so
  // the chips from her last turn stay visible while the next reply is
  // still streaming in rather than disappearing and reappearing.
  // Computed up here (not down with the other derived values below)
  // because handleSuggestionClick needs lastAssistantMessage's id too.
  const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').at(-1);
  const dynamicSuggestions = lastAssistantMessage?.parts.find(isSuggestNextStepsResult);
  const lastAssistantMessageId = lastAssistantMessage?.id ?? null;

  // Two guards against a chip click being actioned twice, for two
  // different reasons. suggestionClickedForIdRef is the real double-click
  // guard -- a ref read and written only inside the handler below, never
  // during render (React refs can't drive rendering), so even a second
  // click landing before React has re-rendered at all still sees it was
  // already set and bails out immediately. dismissedMessageId is state,
  // set inside that same handler, purely so the chip row can hide itself
  // right away -- it tracks which assistant message's suggestions were
  // clicked, not a plain boolean, so a later turn's new chips become
  // clickable again on their own (dismissedMessageId simply won't match
  // the new message's id) without a separate reset effect anywhere.
  const suggestionClickedForIdRef = useRef<string | null>(null);
  const [dismissedMessageId, setDismissedMessageId] = useState<string | null>(null);

  // Not wrapped in useCallback -- it closes over lastAssistantMessageId,
  // which changes every turn, so a hand-written dependency array here is
  // exactly the kind of thing the React Compiler already auto-memoizes
  // (and couldn't reconcile with a manual one of its own).
  function handleSuggestionClick(sugg: string) {
    if (suggestionClickedForIdRef.current === lastAssistantMessageId) return;
    suggestionClickedForIdRef.current = lastAssistantMessageId;
    setDismissedMessageId(lastAssistantMessageId);
    lastSentTextRef.current = sugg;
    sendUserMessage(sugg);
  }
  // The lastAssistantMessageId !== null guard matters -- without it, the
  // initial "no assistant message yet, dismissedMessageId still null"
  // state would compare null === null and read as already dismissed.
  const suggestionsDismissed =
    lastAssistantMessageId !== null && dismissedMessageId === lastAssistantMessageId;

  // Arrival handling for the post-upgrade return trip:
  //
  // 1. A `reference` (Paystack) or `transaction_id` (Flutterwave) in the
  //    URL means checkout was started from this page's own access-limit
  //    bar (?from=mentor -- see access-limit-bar.tsx/payments-actions.ts's
  //    returnTo) and the gateway just redirected straight back here
  //    instead of the generic Upgrade callback page. Verify it ourselves
  //    (idempotent against the webhook for Paystack; the only credit path
  //    at all for Flutterwave, see verifyAndActivateFlutterwavePayment's
  //    own comment) so access unblocks the moment this page loads, show
  //    the same celebratory copy the callback page would have, then strip
  //    the query params so a refresh doesn't re-verify or re-show the
  //    toast. Flutterwave is the active gateway (initiateFlutterwavePlan
  //    Purchase), but Paystack's own reference/trxref shape is still
  //    handled -- never deleted, see that function's own comment.
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
      sendUserMessage(pending);
    }

    function handleVerifyResult(result: VerifyPaymentResult) {
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
    }

    const transactionId = searchParams.get('transaction_id');
    const txRef = searchParams.get('tx_ref');
    const reference = searchParams.get('reference') ?? searchParams.get('trxref');

    if (transactionId && txRef) {
      if (searchParams.get('status') === 'cancelled') {
        router.replace('/dashboard/mentor');
        return;
      }
      verifyAndActivateFlutterwavePayment(txRef, transactionId).then(handleVerifyResult);
      return;
    }

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

    verifyAndActivatePayment(reference).then(handleVerifyResult);
  }, [searchParams, accessStatus, router, sendUserMessage]);

  const isEmpty = messages.length === 0;

  // Lets AppSidebar (a sibling in the tree, not a descendant -- it lives
  // in dashboard/layout.tsx, above this page's own children slot) react
  // to whether this conversation has messages, so it can collapse to
  // icon-only once chatting starts and expand back once it's empty again.
  // See mentor-context.tsx for why this needs a context at all.
  useEffect(() => {
    setHasMessages(!isEmpty);
  }, [isEmpty, setHasMessages]);

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
        placeholder="Ask Eva anything..."
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
  // nothing specific worth suggesting. !suggestionsDismissed hides the
  // row the instant one of its own chips gets clicked, rather than
  // leaving it clickable (and re-sendable) for however long it takes
  // Eva's next reply to actually arrive.
  const chatSuggestions =
    !suggestionsDismissed && dynamicSuggestions?.output?.suggestions?.length ? (
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
    <div className="flex h-full" onWheel={handleWheelOutsideConversation}>
      <MentorControlsRail
        onClearChat={handleClearChat}
        hasMessages={messages.length > 0}
        accessStatus={accessStatus}
        initialFacts={initialFacts}
      />
      {/* No horizontal padding on this column itself -- that would inset
          Conversation's own scrollable box (and so its native scrollbar)
          away from the panel's true right edge, same issue the dashboard
          page had. The px-8 that used to live here instead moves to
          ConversationContent (inside the scrollable box, so it only
          indents the message content, not the scrollbar) and to the
          wrapper around Container below (which needs its own copy now
          that it can no longer inherit it from here). */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden pt-4 pb-6">
        <Conversation
          className="min-h-0 flex-1"
          contextRef={stickToBottomContextRef}
          targetScrollTop={(targetScrollTop, { scrollElement }: ScrollElements) =>
            suppressAutoScrollRef.current ? scrollElement.scrollTop : targetScrollTop
          }
        >
          <ConversationContent className="mb-16 flex flex-col pl-4 pr-6 sm:px-8">
            <ConversationMessages
              messages={visibleMessages}
              showLoadingIndicator={showLoadingIndicator}
              onPanelToggle={handlePanelToggle}
              onSendMessage={sendUserMessage}
              savedPriceQuotes={savedPriceQuotes}
            />
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="pl-4 pr-6 sm:px-8">
          <Container className="shrink-0 space-y-3 pt-4">
            {chatSuggestions}
            {promptInput}
          </Container>
        </div>
      </div>
    </div>
  );
}
