'use client';

import { useState } from 'react';
import { CheckIcon, CopyIcon, HeartIcon, ThumbsDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageAction, MessageActions } from './message';

type Reaction = 'like' | 'dislike' | null;

// Best-effort, same reasoning as the rest of the mentor chat's own
// fire-and-forget pushes (e.g. extractAndUpdateMemory) -- a failed save
// here should never block the reaction from reading as set in the UI,
// since this is purely a signal for later human review, not something
// the chat's own correctness depends on. Logged, not surfaced as a toast
// -- a failed like/dislike save isn't worth interrupting someone's
// conversation over.
async function saveReaction(
  messageId: string,
  reaction: Reaction,
  note: string | null
): Promise<void> {
  try {
    const res = await fetch(`/api/mentor/messages/${messageId}/reaction`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction, note }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    console.error('[mentor] save message reaction failed:', err);
  }
}

// How long the copy button shows its "copied" checkmark before reverting.
const COPIED_RESET_MS = 1500;

// Shared by both MessageFeedback (assistant replies, alongside like/
// dislike/timestamp -- default size/color, unchanged) and
// conversation-messages.tsx's own usage under a user message (smaller,
// lighter, since it's the only action there and sits right under a
// right-aligned bubble rather than in a row of three icons) -- same
// copy-with-a-checkmark-revert behavior either side, factored out once
// instead of duplicated.
export function CopyMessageAction({
  text,
  size = 'icon-sm',
  iconClassName = 'size-3.5',
  className,
}: {
  text: string;
  size?: React.ComponentProps<typeof MessageAction>['size'];
  iconClassName?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch (err) {
      console.error('[mentor] copy message failed:', err);
    }
  };

  return (
    <MessageAction
      tooltip={copied ? 'Copied' : 'Copy'}
      onClick={copy}
      size={size}
      className={className}
    >
      {copied ? <CheckIcon className={iconClassName} /> : <CopyIcon className={iconClassName} />}
    </MessageAction>
  );
}

// Persists via PATCH /api/mentor/messages/[id]/reaction (optimistic,
// rolled back on failure) -- clicking the selected icon again clears it,
// clicking the other one replaces it. Each MessageFeedback instance lives
// directly under a <Message key={message.id}> in conversation-messages.tsx,
// so React keeps its state tied to that one message across re-renders for
// free; `initialReaction`/`initialNote` seed it from whatever's already
// persisted (conversation-messages.tsx reads them off message.metadata,
// populated by getMentorMessages for history, absent for a message
// created live in this session -- see AppMessage's own comment). `text` is
// passed in separately from the message itself, since copy needs
// something this component has no way to derive on its own.
//
// Deliberately no green/red here -- a reaction reads as selected purely by
// its icon switching from outline to filled (fill-current, whatever the
// button's own neutral text color already is), not by changing color.
// Like uses a heart rather than a thumbs-up to read less like a generic
// upvote/downvote widget and more like genuine appreciation for an answer
// that actually helped.
//
// The optional note only ever follows a fresh dislike, never a like --
// liking something needs no explanation. Picking dislike saves
// immediately either way; the note field that appears right after is
// purely a bonus the person can skip, not something blocking the save.
export function MessageFeedback({
  messageId,
  text,
  timestamp,
  className,
  initialReaction = null,
  initialNote = null,
}: {
  messageId: string;
  text: string;
  // Already formatted (see lib/utils/time-utils.ts) -- this component has
  // no reason to know about that format itself, just where to put it.
  // Trailing in the same row as the icons, not its own separate line --
  // Eva's own choice of placement for the assistant side, since only the
  // user side's placement (absolute, top-right of the bubble) was
  // actually specified.
  timestamp?: string;
  className?: string;
  initialReaction?: Reaction;
  initialNote?: string | null;
}) {
  const [reaction, setReaction] = useState<Reaction>(initialReaction);
  const [note, setNote] = useState(initialNote ?? '');
  // Only ever opens right after picking dislike fresh -- never on load
  // (even if a note was already saved before) and never for like, so a
  // once-written note doesn't keep reopening a field on every visit.
  const [noteOpen, setNoteOpen] = useState(false);

  const toggle = (next: Exclude<Reaction, null>) => {
    const resolved = reaction === next ? null : next;
    setReaction(resolved);
    if (resolved === 'dislike') {
      setNoteOpen(true);
    } else {
      setNoteOpen(false);
      setNote('');
    }
    saveReaction(messageId, resolved, resolved === 'dislike' ? note.trim() || null : null);
  };

  const submitNote = () => {
    setNoteOpen(false);
    saveReaction(messageId, 'dislike', note.trim() || null);
  };

  return (
    <div className={className}>
      <MessageActions className="-ml-1">
        <CopyMessageAction text={text} />
        <MessageAction tooltip="Good response" onClick={() => toggle('like')}>
          <HeartIcon className={cn('size-3.5', reaction === 'like' && 'fill-current')} />
        </MessageAction>
        <MessageAction tooltip="Bad response" onClick={() => toggle('dislike')}>
          <ThumbsDownIcon className={cn('size-3.5', reaction === 'dislike' && 'fill-current')} />
        </MessageAction>
        {timestamp ? (
          // Always visible below lg (hover doesn't really work on touch),
          // hover-only at lg and up. <Message> (this component's own
          // parent) already carries the `group` class, so group-hover
          // here responds to hovering the message as a whole, not just
          // this icon row.
          <span className="ml-1 text-[10px] text-muted-foreground lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
            {timestamp}
          </span>
        ) : null}
      </MessageActions>

      {noteOpen ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <Textarea
            autoFocus
            placeholder="What was wrong? (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-14 text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
              Skip
            </Button>
            <Button size="sm" onClick={submitNote}>
              Submit
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
