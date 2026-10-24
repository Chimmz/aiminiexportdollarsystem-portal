'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ScrollElements } from 'use-stick-to-bottom';
import { useSearchParams } from 'next/navigation';
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
import { ConversationMessages } from './conversation-messages';
import { MentorEmptyChat } from './empty-chat';
import { MentorControlsRail } from '@/components/dashboard/mentor-controls-rail';
import { useMentorChatState } from '@/contexts/mentor-context';
import { starterPrompts } from '../config';
import { isSuggestNextStepsResult, messageHasVisibleContent } from '../_utils';

export function MentorChatClient({
  firstName,
  initialMessages,
}: {
  firstName: string | null;
  initialMessages: AppMessage[];
}) {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get('prompt');
  const hasAutoSubmittedRef = useRef(false);

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

  const { setHasMessages, bumpMemoryVersion } = useMentorChatState();
  const { messages, sendMessage, status, setMessages } = useChat<AppMessage>({
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/mentor/chat' }),
    // route.ts only ever writes this data part when manageMemory actually
    // saved something mid-turn (see its own comment) -- bump the shared
    // counter MentorControlsRail watches so it refetches, rather than
    // reaching into the rail's state directly (it's a tree sibling, not a
    // descendant -- see mentor-context.tsx).
    onData: (dataPart) => {
      if (dataPart.type === 'data-frontend-action' && dataPart.data === 'refresh-sidebar') {
        bumpMemoryVersion();
      }
    },
    // checkMentorChatLimits (route.ts's _utils.ts) returns a plain-text
    // body on a blocked request (trial budget used up, rate-limited, or
    // expired access) -- the AI SDK's own createUIApiCallError reads a
    // non-OK response's body as-is into error.message when there's no
    // JSON envelope to unwrap, so this is already the exact human
    // sentence to show, no parsing needed.
    onError: (error) => {
      toast(error.message);
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
      sendMessage({ text: initialPrompt });
    }
  }, [initialPrompt, sendMessage]);

  const handleSubmit = useCallback(
    (text: string) => {
      sendMessage({ text });
    },
    [sendMessage]
  );

  const handleSuggestionClick = useCallback(
    (sugg: string) => sendMessage({ text: sugg }),
    [sendMessage]
  );

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
    <MentorPromptInput
      status={status}
      placeholder="Ask Eva anything about sourcing, pricing, or buyers..."
      onSubmit={handleSubmit}
      className={isEmpty ? 'bg-white! shadow-md' : 'bg-gray-50'}
    />
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
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pt-4 pb-6">
        <Conversation
          className="min-h-0 flex-1"
          targetScrollTop={(targetScrollTop, { scrollElement }: ScrollElements) =>
            suppressAutoScrollRef.current ? scrollElement.scrollTop : targetScrollTop
          }
        >
          <ConversationContent className="mb-16" scrollClassName="scrollbar-none">
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
