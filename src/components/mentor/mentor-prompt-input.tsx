'use client';

import { useRef, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatStatus } from 'ai';
import { CornerDownLeftIcon, SquareIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// Built from scratch, not ai-elements' PromptInput -- that component wraps
// its textarea in a display:contents div (PromptInputBody) inside an
// InputGroup that only grows past its fixed h-9 via a has-[>textarea]
// selector. :has()'s > combinator matches real DOM structure, not the
// render tree, so display:contents on an intervening wrapper doesn't make
// it see through to the textarea -- InputGroup stayed stuck at h-9 with
// overflow-hidden, clipping the textarea's actual (taller,
// field-sizing-content-driven) height. It still rendered fine above the
// clip line, but clicks below that line landed on whatever was behind the
// box, not the textarea. This version is just a form, a plain Textarea
// (same field-sizing-content auto-grow, no ancestor fighting it), and a
// submit button -- nothing wraps anything's height.

interface MentorPromptInputProps {
  status: ChatStatus;
  placeholder?: string;
  onSubmit: (text: string) => void;
  className?: string;
  submitButtonClassName?: string;
}

export function MentorPromptInput({
  status,
  placeholder,
  onSubmit,
  className,
  submitButtonClassName,
}: MentorPromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isGenerating = status === 'submitted' || status === 'streaming';

  const submit = () => {
    const value = textareaRef.current?.value.trim();
    if (!value || isGenerating) return;
    onSubmit(value);
    if (textareaRef.current) textareaRef.current.value = '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  let icon = <CornerDownLeftIcon className="size-4" />;
  if (status === 'submitted') icon = <Spinner className="size-4" />;
  else if (status === 'streaming') icon = <SquareIcon className="size-4" />;
  else if (status === 'error') icon = <XIcon className="size-4" />;

  return (
    <form
      onSubmit={handleSubmit}
      // has-[textarea:focus-visible]:* replicates InputGroup's old
      // whole-box focus ring -- :has() here has no > combinator, so it
      // matches the textarea as any descendant, immune to the exact
      // display:contents mismatch that broke the old component.
      className={cn(
        'flex w-full items-center gap-2 rounded-md border border-input px-3 py-2 shadow-xs transition-[color,box-shadow] has-[textarea:focus-visible]:border-ring has-[textarea:focus-visible]:ring-3 has-[textarea:focus-visible]:ring-ring/50',
        className
      )}
    >
      {/* py-1.5 (not p-0) matters -- with zero vertical padding, a single
          line of text sits flush against the box's own top edge while
          min-h-9 still reserves the full 36px (min-height is always a
          floor, field-sizing-content or not), leaving the caret's full
          line-height box visually taller than, and misaligned with, the
          placeholder/typed text under it. A little breathing room lets the
          one line (and its caret) sit centered in that reserved height
          instead. No rows prop either -- it's one more intrinsic-height
          hint fighting field-sizing-content for no benefit here. */}
      <Textarea
        ref={textareaRef}
        name="message"
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        className="max-h-48 min-h-9 flex-1 resize-none border-0 bg-transparent px-0 py-1.5 shadow-none outline-none focus-visible:ring-0"
      />
      <Button
        type="submit"
        size="icon-sm"
        disabled={isGenerating}
        aria-label={isGenerating ? 'Sending' : 'Send message'}
        className={cn('shrink-0', submitButtonClassName)}
      >
        {icon}
      </Button>
    </form>
  );
}
