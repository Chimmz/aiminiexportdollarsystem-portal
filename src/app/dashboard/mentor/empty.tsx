import type { ReactNode } from "react";
import Image from "next/image";
import { AISparkles } from "@/components/ui/ai-sparkle";

// Same brand treatment as the "Chat with Eva" card on the dashboard home —
// see dashboard-home-client.tsx — so the icon and name rhyme wherever Eva
// shows up, not just there. Mirrors the constant in mentor-chat-client.tsx
// (its header uses the same colors); kept local here rather than shared
// since it's just a 3-color literal, not real logic.
const EVA_GRADIENT = ["#6366f1", "#a855f7", "#ec4899"];

interface MentorEmptyChatProps {
  firstName: string | null;
  promptInput: ReactNode;
  suggestions: ReactNode;
}

// The centered, pre-first-message layout for /dashboard/mentor — a hero
// greeting above the input instead of an empty scrolling thread. Swapped
// out for the normal top-header + conversation layout the moment a message
// is sent (see MentorChatClient's `isEmpty` branch).
export function MentorEmptyChat({ firstName, promptInput, suggestions }: MentorEmptyChatProps) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 overflow-hidden px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25 blur-3xl"
        style={{
          background: `radial-gradient(circle, ${EVA_GRADIENT[0]}, ${EVA_GRADIENT[1]}, ${EVA_GRADIENT[2]})`,
        }}
      />

      {/* Eva's avatar portrait, not the bare sparkle icon -- `fill` +
          object-cover crops the portrait's actual (taller-than-square)
          aspect ratio into the circle without distorting it. */}
      <div className="relative size-24 shrink-0 overflow-hidden rounded-full">
        <Image src="/eva-avatar.png" alt="Eva" fill sizes="96px" className="object-cover" priority />
      </div>

      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold">
          Hi{firstName ? (
            <>
              {' '}
              <span className="inline-block max-w-[10rem] truncate align-bottom">
                {firstName}
              </span>
            </>
          ) : null}
          , I&rsquo;m{" "}
          <span className="relative inline-block bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Eva
            {/* Decorative only -- bg-clip-text/text-transparent above only
                affects how the "Eva" text itself paints, not this sibling
                SVG, which fills from its own `gradient` prop instead. */}
            <AISparkles size={20} gradient={EVA_GRADIENT} className="absolute -top-1 -right-3" />
          </span>
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your export mentor. I&rsquo;ll guide you from here to your first sale, and keep you
          moving whenever you get stuck.
        </p>
      </div>

      <div className="w-full max-w-xl space-y-3">
        {promptInput}
        {suggestions}
      </div>
    </div>
  );
}
