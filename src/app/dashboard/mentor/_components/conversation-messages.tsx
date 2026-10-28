'use client';

import { Fragment } from 'react';
import type { AppMessage } from '@/app/api/mentor/chat/route';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { MessageFeedback } from '@/components/ai-elements/message-feedback';
import { AtomicLoader } from '@/components/ui/atomic-loader';
import { Container } from '@/components/layout/container';
import { ContactsCarousel } from '@/components/tools-ui/contacts-carousel';
import { ContactSearchPanel } from '@/components/tools-ui/contact-search-panel';
import { SearchKbPanel } from '@/components/tools-ui/search-kb-panel';
import { MemoryUpdatesPanel } from '@/components/tools-ui/memory-updates-panel';
import { PricingCalculatorPanel } from '@/components/tools-ui/pricing-calculator-panel';
import { MediaGalleryPanel } from '@/components/tools-ui/media-gallery-panel';
import { cn } from '@/lib/utils';
import { EvaAvatar } from './eva-avatar';

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
}

export function ConversationMessages({
  messages,
  showLoadingIndicator,
  onPanelToggle,
  onSendMessage,
}: ConversationMessagesProps) {
  return (
    <Container className="flex flex-col gap-6">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn('flex flex-col', message.role === 'user' && 'justify-end')}
        >
          {message.role === 'assistant' && <EvaAvatar className="mb-3" />}
          <Message from={message.role} className="min-w-0">
            <MessageContent>
              {message.parts.map((part, i) => {
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

                  case 'tool-manageMemory': {
                    if (part.state !== 'output-available') return null;
                    const { input, output } = part;
                    return (
                      <MemoryUpdatesPanel
                        key={key}
                        operations={input.operations}
                        ok={output.ok}
                      />
                    );
                  }

                  case 'tool-calculatePricing': {
                    if (part.state !== 'output-available') return null;
                    const { output } = part;
                    return (
                      <PricingCalculatorPanel
                        key={key}
                        product={output.product}
                        bankRate={output.bankRate}
                        asOf={output.asOf}
                        isFallback={output.isFallback}
                        onSave={onSendMessage}
                        onToggle={onPanelToggle}
                      />
                    );
                  }

                  case 'tool-searchMedia': {
                    if (part.state !== 'output-available') return null;
                    return <MediaGalleryPanel key={key} images={part.output.images} />;
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
        </div>
      ))}
      {showLoadingIndicator ? (
        <div className="flex gap-3">
          <EvaAvatar />
          <Message from="assistant" className="min-w-0">
            <MessageContent>
              <AtomicLoader className="my-2.5 text-muted-foreground" />
            </MessageContent>
          </Message>
        </div>
      ) : null}
    </Container>
  );
}
