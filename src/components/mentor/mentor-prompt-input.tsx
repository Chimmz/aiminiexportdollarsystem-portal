'use client';

import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
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
  // A full pill (rounded-full) looks fine on a short, single-line box, but
  // elongates oddly once Shift+Enter grows it taller -- rounded-2xl reads
  // as "still rounded" without the pill's exaggerated curve on a taller
  // rectangle. Tracked via a plain onChange flag (does the value contain a
  // literal newline), not textarea height -- that's a more literal match
  // for "just rounded once a new line's been entered" and doesn't need a
  // ResizeObserver for something this simple.
  const [hasNewline, setHasNewline] = useState(false);

  const submit = () => {
    const value = textareaRef.current?.value.trim();
    if (!value || isGenerating) return;
    onSubmit(value);
    if (textareaRef.current) textareaRef.current.value = '';
    setHasNewline(false);
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

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setHasNewline(e.target.value.includes('\n'));
  };

  let icon = <CornerDownLeftIcon className="size-4" />;
  if (status === 'submitted') icon = <Spinner className="size-4" />;
  else if (status === 'streaming') icon = <SquareIcon className="size-4" />;
  else if (status === 'error') icon = <XIcon className="size-4" />;

  return (
    <form
      onSubmit={handleSubmit}
      // has-[textarea:focus-visible]:border-* replicates InputGroup's old
      // whole-box focus indicator -- :has() here has no > combinator, so
      // it matches the textarea as any descendant, immune to the exact
      // display:contents mismatch that broke the old component. Just a
      // darker border on focus, no ring/glow -- the ring-3 + ring-ring/50
      // this used to carry read as a thick green outline, more emphasis
      // than a chat input needs.
      // transition-[border-color,border-radius] (not transition-colors or
      // a bare "color") so both the focus border and the pill<->rounded-2xl
      // shape swap on a new line animate smoothly instead of snapping --
      // "color" alone is the CSS text-color property, not border-color, so
      // the focus border was never actually covered by the previous list.
      // items-end once there's a newline, so the button anchors to the
      // last line as the box grows upward (the usual chat-input look);
      // items-center for the common single-line case, where end-aligning
      // would just look like the button and text don't agree on a
      // baseline.
      className={cn(
        'flex w-full gap-2 border border-input px-4 py-2 transition-[border-color,border-radius] duration-200 ease-out has-[textarea:focus-visible]:border-gray-500',
        hasNewline ? 'items-end rounded-2xl' : 'items-center rounded-full',
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
        onChange={handleChange}
        // rounded-none matters here -- the base Textarea component ships
        // its own rounded-md, which this never used to override. Left
        // alone, the textarea has its own small corner radius sitting
        // inside the pill-shaped (rounded-full/rounded-2xl) form around
        // it -- a real, independent box shape, not just a visual
        // coincidence, most visible at the right edge where it meets the
        // gap before the submit button.
        // transition-[height] animates field-sizing-content's own height
        // changes (supported in current Chromium/Safari; browsers that
        // don't honor it just resize instantly, same as before -- no
        // functional loss either way) so growing to a new line eases
        // rather than snaps.
        className="max-h-48 min-h-9 flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-1.5 shadow-none outline-none transition-[height] duration-150 ease-out focus-visible:ring-0"
      />
      <Button
        type="submit"
        size="icon-sm"
        disabled={isGenerating}
        aria-label={isGenerating ? 'Sending' : 'Send message'}
        className={cn('shrink-0 rounded-full', submitButtonClassName)}
      >
        {icon}
      </Button>
    </form>
  );
}
