'use client';

import { Fragment } from 'react';
import type { AppMessage } from '@/app/api/mentor/chat/route';
import {
  Message,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  CopyMessageAction,
  MessageFeedback,
} from '@/components/ai-elements/message-feedback';
import { MessageErrorBoundary } from '@/components/ai-elements/message-error-boundary';
import { Container } from '@/components/layout/container';
import { ContactsCarousel } from '@/components/tools-ui/contacts-carousel';
import { ContactSearchPanel } from '@/components/tools-ui/contact-search-panel';
import { SearchKbPanel } from '@/components/tools-ui/search-kb-panel';
import { PricingCalculatorPanel } from '@/components/tools-ui/pricing-calculator-panel';
import { MediaGalleryPanel } from '@/components/tools-ui/media-gallery-panel';
import { VideoGalleryPanel } from '@/components/tools-ui/video-gallery-panel';
import { getMessageText } from '@/lib/utils/conversation-utils';
import type { SavedPriceQuote } from '@/lib/actions/pricing-actions';
import { formatMessageTime } from '@/lib/utils/time-utils';
import { cn } from '@/lib/utils';
import { EvaAvatar } from './eva-avatar';
import { AtomicLoader } from '@/components/ui/atomic-loader';

// Narrower than mentor-chat-client.tsx's own messageHasVisibleContent --
// true only once Eva has actually written words, not just rendered a tool
// result card. Gates the like/dislike row below each reply (see
// MessageFeedback) so it doesn't show up while she's still mid tool-call,
// before there's any reply yet to react to. Only used here, unlike
// messageHasVisibleContent (which the parent also needs for its own
// showLoadingIndicator/visibleMessages logic), so it lives here instead.
function messageHasText(message: AppMessage): boolean {
  return message.parts.some(
    (part) => part.type === 'text' && part.text.trim().length > 0
  );
}

// searchMedia's photos (and searchVideos' clips, same reasoning) are
// meant to support an explanation already given, never open the reply --
// config.ts's own system prompt tells the model to write that explanation
// before calling the tool, but this kept happening anyway (a tool-calling
// model's own eagerness to act wins out over the instruction often enough
// to be a real, repeated bug, not a one-off). Since parts otherwise render
// in literal generation order (see that instruction's own comment on
// why), fixing this in the prompt again would be fighting the same losing
// battle -- moving every tool-searchMedia/tool-searchVideos part to the
// end of a message's own parts, after everything else, guarantees they
// always render below the text regardless of what order the model
// actually produced them in.
//
// That reordering has a side effect worth fixing in the same pass: a
// message like [text, searchMedia call, more text] had its two text parts
// sitting on either side of the tool call -- moving media to the end
// leaves them directly adjacent, but they're still two separate parts,
// each its own <MessageResponse> block with its own margin, which read as
// an odd double gap right where the tool call used to be. Merging any run
// of now-adjacent text parts into one lets them flow as a single
// paragraph block instead, the same as if the model had just written it
// all in one go.
function normalizeParts(parts: AppMessage['parts']): AppMessage['parts'] {
  const media = parts.filter(
    (part) => part.type === 'tool-searchMedia' || part.type === 'tool-searchVideos'
  );
  const rest = parts.filter(
    (part) => part.type !== 'tool-searchMedia' && part.type !== 'tool-searchVideos'
  );

  const merged: AppMessage['parts'] = [];
  for (const part of rest) {
    const prev = merged[merged.length - 1];
    if (part.type === 'text' && prev?.type === 'text') {
      merged[merged.length - 1] = { ...prev, text: `${prev.text}\n\n${part.text}` };
    } else {
      merged.push(part);
    }
  }

  return [...merged, ...media];
}

interface ConversationMessagesProps {
  messages: AppMessage[];
  showLoadingIndicator: boolean;
  // Fires on a tool-call panel opening/closing (e.g. SearchKbPanel) -- see
  // mentor-chat-client.tsx's own handlePanelToggle for why it needs to
  // know about this at all (briefly suppressing Conversation's
  // stick-to-bottom pull so expanding a panel doesn't yank the view down).
  onPanelToggle: () => void;
  // PricingCalculatorPanel's Save button posts a plain summary message
  // back into the conversation -- kept as a callback rather than this
  // component importing useChat itself, so it stays decoupled from
  // exactly how the parent sends a message.
  onSendMessage: (text: string) => void;
  // Keyed by calculatePricing tool call id -- see page.tsx and
  // pricing-actions.ts's getPriceQuotesByUser. Looked up per
  // 'tool-calculatePricing' part below by that same id, so a message
  // whose calculator was already finished and saved renders that saved
  // result on reload instead of a blank calculator.
  savedPriceQuotes: Record<string, SavedPriceQuote>;
}

export function ConversationMessages({
  messages,
  showLoadingIndicator,
  onPanelToggle,
  onSendMessage,
  savedPriceQuotes,
}: ConversationMessagesProps) {
  return (
    <Container className="flex flex-col">
      {messages.map((message) => {
        const timestamp = message.metadata?.createdAt
          ? formatMessageTime(message.metadata.createdAt)
          : null;
        return (
          <MessageErrorBoundary key={message.id}>
            <div
              className={cn(
                'flex flex-col',
                message.role === 'user' && 'group relative justify-end pt-4 pb-6'
              )}
            >
              {message.role === 'user' && timestamp ? (
                <span className="absolute top-0 right-1 text-[10px] text-muted-foreground lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
                  {timestamp}
                </span>
              ) : null}
              {message.role === 'assistant' && <EvaAvatar className="mb-3" />}
              <Message from={message.role} className="min-w-0">
                <MessageContent>
                  {normalizeParts(message.parts).map((part, i) => {
                    const key = `${message.id}-${i}`;
                    switch (part.type) {
                      case 'text':
                        return <MessageResponse key={key}>{part.text}</MessageResponse>;
                      // No more manual `part.input as {...}` / `part.output as
                      // {...}` casts in any of these four -- AppMessage (see
                      // lib/ai/message.ts) runs every tool part through
                      // InferUITools, so narrowing on part.type then
                      // part.state above already gives input/output their
                      // real shape straight from each tool's own zod schema
                      // and execute return type.
                      case 'tool-searchContacts': {
                        if (part.state !== 'output-available') return null;
                        const { input, output } = part;
                        return (
                          <Fragment key={key}>
                            <ContactSearchPanel
                              query={input.query}
                              locations={input.locations}
                              contacts={output.contacts}
                              note={output.note}
                              onToggle={onPanelToggle}
                            />
                            <ContactsCarousel
                              contacts={output.contacts}
                              query={input.query}
                            />
                          </Fragment>
                        );
                      }

                      case 'tool-searchKb': {
                        if (part.state !== 'output-available') return null;
                        const { input, output } = part;
                        return (
                          <SearchKbPanel
                            key={key}
                            query={input.query}
                            keyword={input.keyword}
                            chunks={output.chunks}
                            retrievedInMs={output.retrievedInMs}
                            onToggle={onPanelToggle}
                          />
                        );
                      }

                      case 'tool-calculatePricing': {
                        if (part.state !== 'output-available') return null;
                        const { output } = part;
                        return (
                          <PricingCalculatorPanel
                            key={key}
                            toolCallId={part.toolCallId}
                            product={output.product}
                            bankRate={output.bankRate}
                            asOf={output.asOf}
                            isFallback={output.isFallback}
                            savedQuote={savedPriceQuotes[part.toolCallId] ?? null}
                            onSave={onSendMessage}
                            onToggle={onPanelToggle}
                          />
                        );
                      }

                      case 'tool-searchMedia': {
                        if (part.state !== 'output-available') return null;
                        return (
                          <MediaGalleryPanel key={key} images={part.output.images} />
                        );
                      }

                      case 'tool-searchVideos': {
                        if (part.state !== 'output-available') return null;
                        return (
                          <VideoGalleryPanel key={key} videos={part.output.videos} />
                        );
                      }
                      default:
                        return null;
                    }
                  })}
                </MessageContent>
                {message.role === 'assistant' && messageHasText(message) ? (
                  <MessageFeedback
                    messageId={message.id}
                    text={getMessageText(message)}
                    timestamp={timestamp ?? undefined}
                    initialReaction={message.metadata?.reaction ?? null}
                    initialNote={message.metadata?.reactionNote ?? null}
                  />
                ) : null}
              </Message>
              {/* Absolutely positioned just below the bubble's bottom-right
                corner (pb-5 on the wrapper above reserves the room), same
                hover behavior as the timestamp (always visible below lg,
                hover-only at lg and up, off the same outer `group`). A
                size and color step down from MessageFeedback's own row --
                it's the only action here, not one of three, and sits
                right under the bubble rather than needing to read as
                clearly as a row of icons does. */}
              {message.role === 'user' && messageHasText(message) ? (
                <MessageActions className="absolute right-1 bottom-0 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
                  <CopyMessageAction
                    text={getMessageText(message)}
                    size="icon-xs"
                    iconClassName="size-3"
                    className="text-muted-foreground"
                  />
                </MessageActions>
              ) : null}
            </div>
          </MessageErrorBoundary>
        );
      })}
      {showLoadingIndicator ? (
        <div className="flex gap-3">
          <EvaAvatar />
          <Message from="assistant" className="min-w-0">
            <MessageContent>
              <AtomicLoader className="my-2.5  " />
              {/* <AmoeboidLoader className="my-2.5 text-primary" /> */}
            </MessageContent>
          </Message>
        </div>
      ) : null}
    </Container>
  );
}
