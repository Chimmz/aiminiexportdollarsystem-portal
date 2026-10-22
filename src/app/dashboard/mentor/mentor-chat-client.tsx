'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, type ComponentProps } from 'react';
import type { ScrollElements } from 'use-stick-to-bottom';
import { useSearchParams } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { MessageFeedback } from '@/components/ai-elements/message-feedback';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Shimmer } from '@/components/ai-elements/shimmer';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import { MentorEmptyChat } from './empty';
import { ContactsCarousel } from '@/components/tools-ui/contacts-carousel';
import { ContactSearchPanel } from '@/components/tools-ui/contact-search-panel';
import { AnswerChunksPanel } from '@/components/tools-ui/answer-chunks-panel';
import { MemoryUpdatesPanel } from '@/components/tools-ui/memory-updates-panel';
import { PricingCalculatorPanel } from '@/components/tools-ui/pricing-calculator-panel';
import type { ContactCard } from '@/lib/utils/contacts-utils';
import type { RetrievedChunk } from '@/lib/utils/chunks-utils';
import { pickLoadingWord, starterPrompts } from './config';

// Module-level, not per-render — it has no dependency on component state,
// and useChat only needs a stable reference, not a fresh one every render.

// True once a message has anything actually worth rendering -- non-empty
// text, or a tool part that's reached output-available (a tool call still
// streaming its input, or awaiting its result, renders nothing on its
// own). Shared between the loading-indicator condition and filtering the
// message list below it, so the two stay in sync by construction.
function messageHasVisibleContent(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      (part.type === 'text' && part.text.trim().length > 0) ||
      ('state' in part && part.state === 'output-available')
  );
}

// Narrower than messageHasVisibleContent above -- true only once Eva has
// actually written words, not just rendered a tool result card. Gates the
// like/dislike row below each reply (see MessageFeedback) so it doesn't
// show up while she's still mid tool-call, before there's any reply yet
// to react to.
function messageHasText(message: UIMessage): boolean {
  return message.parts.some((part) => part.type === 'text' && part.text.trim().length > 0);
}

export function MentorChatClient() {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get('prompt');
  const hasAutoSubmittedRef = useRef(false);

  // Opening/closing a tool-call panel inside a message (e.g.
  // AnswerChunksPanel) resizes the scrollable conversation the same way
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

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/mentor/chat' }),
  });

  // Came here from a suggestion chip elsewhere (e.g. the dashboard home
  // card) via ?prompt= — auto-send it once on arrival.
  useEffect(() => {
    if (initialPrompt && !hasAutoSubmittedRef.current) {
      hasAutoSubmittedRef.current = true;
      sendMessage({ text: initialPrompt });
    }
  }, [initialPrompt, sendMessage]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text.trim()) return;
      sendMessage({ text: message.text });
    },
    [sendMessage]
  );

  const handleSuggestionClick = useCallback(
    (sugg: string) => sendMessage({ text: sugg }),
    [sendMessage]
  );

  const isEmpty = messages.length === 0;

  // Eva's own personalized suggestions for this conversation, read off
  // the most recent assistant turn that actually called suggestNextSteps
  // (see suggest-next-steps-tool.ts). Looked up from the most recent
  // assistant message, not necessarily the very last message overall, so
  // the chips from her last turn stay visible while the next reply is
  // still streaming in rather than disappearing and reappearing.
  const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').at(-1);
  const dynamicSuggestions = lastAssistantMessage?.parts.find(
    (part) => part.type === 'tool-suggestNextSteps' && part.state === 'output-available'
  ) as { output?: { suggestions: string[] } } | undefined;

  // `status` flips from "submitted" to "streaming" the moment ANY part of
  // the reply starts arriving, including a tool call's input streaming in
  // -- not necessarily visible text. That left a dead gap during a tool
  // call (e.g. answerQuestion taking a second or so): the shimmer loader
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

  // Re-picked whenever a new turn starts (message count changes), not on
  // every render -- stays fixed for the duration of one loading period
  // instead of flickering through different words while still submitted.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- messages.length is a deliberate re-roll trigger, not a value read inside
  const loadingWord = useMemo(() => pickLoadingWord(), [messages.length]);

  // Shared between the centered empty-state layout and the normal
  // bottom-pinned layout — same input either way.
  const promptInput = (
    <PromptInput onSubmit={handleSubmit}>
      <PromptInputBody>
        <PromptInputTextarea placeholder="Ask Eva anything about sourcing, pricing, or buyers..." />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools />
        <PromptInputSubmit status={status} />
      </PromptInputFooter>
    </PromptInput>
  );

  if (isEmpty) {
    const starterSuggestions = (
      <Suggestions>
        {starterPrompts.map((prompt) => (
          <Suggestion key={prompt} suggestion={prompt} onClick={handleSuggestionClick} />
        ))}
      </Suggestions>
    );
    return <MentorEmptyChat promptInput={promptInput} suggestions={starterSuggestions} />;
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
    <div className="flex h-full flex-col overflow-hidden px-8 pt-4 pb-6">
      <Conversation
        className="min-h-0 flex-1"
        targetScrollTop={(targetScrollTop, { scrollElement }: ScrollElements) =>
          suppressAutoScrollRef.current ? scrollElement.scrollTop : targetScrollTop
        }
      >
        <ConversationContent className="mb-16" scrollClassName="scrollbar-none">
          {visibleMessages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.parts.map((part, i) => {
                  const key = `${message.id}-${i}`;
                  switch (part.type) {
                    case 'text':
                      return <MessageResponse key={key}>{part.text}</MessageResponse>;
                    case 'tool-searchContacts': {
                      if (part.state !== 'output-available') return null;
                      const input = part.input as {
                        query: string;
                        locations: string[] | null;
                      };
                      const output = part.output as { contacts: ContactCard[]; note?: string };
                      return (
                        <Fragment key={key}>
                          <ContactSearchPanel
                            query={input.query}
                            locations={input.locations}
                            contacts={output.contacts}
                            note={output.note}
                            onToggle={handlePanelToggle}
                          />
                          <ContactsCarousel contacts={output.contacts} query={input.query} />
                        </Fragment>
                      );
                    }
                    case 'tool-answerQuestion': {
                      if (part.state !== 'output-available') return null;
                      const input = part.input as {
                        query: string;
                        keyword: string | null;
                      };
                      const output = part.output as {
                        chunks: RetrievedChunk[];
                        retrievedInMs?: number;
                      };
                      return (
                        <AnswerChunksPanel
                          key={key}
                          query={input.query}
                          keyword={input.keyword}
                          chunks={output.chunks}
                          retrievedInMs={output.retrievedInMs}
                          onToggle={handlePanelToggle}
                        />
                      );
                    }
                    case 'tool-manageMemory': {
                      if (part.state !== 'output-available') return null;
                      const input = part.input as {
                        operations: ComponentProps<typeof MemoryUpdatesPanel>['operations'];
                      };
                      const output = part.output as { ok: boolean };
                      return (
                        <MemoryUpdatesPanel
                          key={key}
                          operations={input.operations}
                          ok={output.ok}
                          onToggle={handlePanelToggle}
                        />
                      );
                    }
                    case 'tool-calculatePricing': {
                      if (part.state !== 'output-available') return null;
                      const output = part.output as {
                        product: string | null;
                        bankRate: number;
                        asOf: string;
                        isFallback: boolean;
                      };
                      return (
                        <PricingCalculatorPanel
                          key={key}
                          product={output.product}
                          bankRate={output.bankRate}
                          asOf={output.asOf}
                          isFallback={output.isFallback}
                          onSave={(message) => sendMessage({ text: message })}
                          onToggle={handlePanelToggle}
                        />
                      );
                    }
                    default:
                      return null;
                  }
                })}
              </MessageContent>
              {message.role === 'assistant' && messageHasText(message) ? (
                <MessageFeedback />
              ) : null}
            </Message>
          ))}
          {showLoadingIndicator ? (
            <Message from="assistant">
              <MessageContent>
                <span className="flex items-center gap-2 py-1">
                  <Shimmer as="span" duration={1.2} className="text-sm">
                    {`${loadingWord}...`}
                  </Shimmer>
                  <span className="inline-flex gap-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </span>
                </span>
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 space-y-3 pt-4">
        {chatSuggestions}
        {promptInput}
      </div>
    </div>
  );
}
