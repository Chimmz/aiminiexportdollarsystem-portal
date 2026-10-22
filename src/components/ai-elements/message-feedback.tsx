'use client';

import { useState } from 'react';
import { ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageAction, MessageActions } from './message';

type Reaction = 'like' | 'dislike' | null;

// Local only, no API wired up yet -- just toggles which icon reads as
// selected. Clicking the selected one again clears it, clicking the
// other one replaces it. Each MessageFeedback instance lives directly
// under a <Message key={message.id}> in mentor-chat-client.tsx, so React
// keeps its state tied to that one message across re-renders for free,
// without this needing to know the message's id itself.
export function MessageFeedback({ className }: { className?: string }) {
  const [reaction, setReaction] = useState<Reaction>(null);

  const toggle = (next: Exclude<Reaction, null>) => {
    setReaction((current) => (current === next ? null : next));
  };

  return (
    <MessageActions className={cn('-ml-1', className)}>
      <MessageAction
        tooltip="Good response"
        onClick={() => toggle('like')}
        className={reaction === 'like' ? 'text-primary' : undefined}
      >
        <ThumbsUpIcon className={cn('size-3.5', reaction === 'like' && 'fill-primary')} />
      </MessageAction>
      <MessageAction
        tooltip="Bad response"
        onClick={() => toggle('dislike')}
        className={reaction === 'dislike' ? 'text-destructive' : undefined}
      >
        <ThumbsDownIcon className={cn('size-3.5', reaction === 'dislike' && 'fill-destructive')} />
      </MessageAction>
    </MessageActions>
  );
}
