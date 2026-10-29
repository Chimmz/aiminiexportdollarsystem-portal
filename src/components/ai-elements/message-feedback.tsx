'use client';

import { useState } from 'react';
import { CheckIcon, CopyIcon, HeartIcon, ThumbsDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageAction, MessageActions } from './message';

type Reaction = 'like' | 'dislike' | null;

// How long the copy button shows its "copied" checkmark before reverting.
const COPIED_RESET_MS = 1500;

// Local only, no API wired up yet for like/dislike -- just toggles which
// icon reads as selected. Clicking the selected one again clears it,
// clicking the other one replaces it. Each MessageFeedback instance lives
// directly under a <Message key={message.id}> in conversation-messages.tsx,
// so React keeps its state tied to that one message across re-renders for
// free, without this needing to know the message's id itself for that
// part -- `text` is passed in from there instead, since copy needs
// something this component has no way to derive on its own (the
// message's own text).
//
// Deliberately no green/red here -- a reaction reads as selected purely by
// its icon switching from outline to filled (fill-current, whatever the
// button's own neutral text color already is), not by changing color.
// Like uses a heart rather than a thumbs-up to read less like a generic
// upvote/downvote widget and more like genuine appreciation for an answer
// that actually helped.
export function MessageFeedback({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [reaction, setReaction] = useState<Reaction>(null);
  const [copied, setCopied] = useState(false);

  const toggle = (next: Exclude<Reaction, null>) => {
    setReaction((current) => (current === next ? null : next));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch (err) {
      console.error('[mentor] copy reply failed:', err);
    }
  };

  return (
    <MessageActions className={cn('-ml-1', className)}>
      <MessageAction tooltip={copied ? 'Copied' : 'Copy'} onClick={copy}>
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </MessageAction>
      <MessageAction tooltip="Good response" onClick={() => toggle('like')}>
        <HeartIcon className={cn('size-3.5', reaction === 'like' && 'fill-current')} />
      </MessageAction>
      <MessageAction tooltip="Bad response" onClick={() => toggle('dislike')}>
        <ThumbsDownIcon className={cn('size-3.5', reaction === 'dislike' && 'fill-current')} />
      </MessageAction>
    </MessageActions>
  );
}
