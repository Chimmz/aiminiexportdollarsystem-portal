import Image from 'next/image';
import { cn } from '@/lib/utils';

// Eva's avatar next to her own messages -- same portrait as the
// empty-state hero (empty-chat.tsx), just small and round here, the way a
// chat app puts the other party's avatar beside their bubbles. Never
// shown next to the user's own messages, which stay avatar-less and
// right-aligned as before.
export function EvaAvatar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative mt-0.5 size-7 shrink-0 overflow-hidden rounded-full',
        className
      )}
    >
      <Image src="/eva-avatar.png" alt="Eva" fill sizes="28px" className="object-cover" />
    </div>
  );
}
