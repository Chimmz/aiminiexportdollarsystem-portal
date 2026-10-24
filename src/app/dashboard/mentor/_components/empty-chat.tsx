import type { ReactNode } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { AISparkles } from "@/components/ui/ai-sparkle";
import { FadeIn } from "@/components/motion/fade-in";

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
    <div className="relative isolate flex h-full flex-col items-center justify-center gap-6 overflow-hidden px-8">
      {/* bg-radial (Tailwind's native radial gradient utility) on an
          inset-0 box -- NOT top-1/2 left-1/2 + -translate-1/2, which was
          tried briefly to shrink the glow's spread and broke it again
          (invisible). That centering trick needs the parent's h-full to
          resolve to a real pixel height for the 50% top/left offsets to
          mean anything; inset-0 has no such dependency (it's always just
          "match the positioned ancestor's box," regardless of how that
          box's height was arrived at) and is the version confirmed
          working. If the spread still needs narrowing later, do it via
          the gradient's own color-stop percentages, not the box's size
          or position.
          Needs BOTH `isolate` on the parent AND a negative z-index here,
          not either alone:
          - Without `isolate`, a negative z-index on this div isn't scoped
            locally -- it can escape to a much higher ancestor's stacking
            context and paint underneath an unrelated opaque ancestor
            background instead (made the gradient fully invisible).
          - Without the negative z-index, removing it (as this previously
            did) assumes DOM order alone decides paint order, but that's
            wrong for a `position: absolute` element specifically: per
            CSS's stacking order, ANY positioned descendant with
            z-index:auto paints above ALL non-positioned in-flow content,
            regardless of DOM order or z-index being unset. Since this div
            is absolute and its siblings (avatar, heading, prompt input)
            are plain non-positioned divs, it painted on top of them --
            the white prompt input box was never actually losing its
            white fill, the gradient was just layered over it. A negative
            z-index moves it into the stacking context's
            "negative z-index children" paint step, which comes before
            non-positioned content, not after. */}
      {/* Fades in on its own (no slide -- it's a backdrop, not content)
          and starts before everything below it, setting the mood the
          staggered content then cascades into. */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="pointer-events-none absolute inset-0 -z-10 bg-radial from-indigo-500/20 via-purple-500/10 to-pink-500/0"
      />

      {/* Eva's avatar portrait, not the bare sparkle icon -- `fill` +
          object-cover crops the portrait's actual (taller-than-square)
          aspect ratio into the circle without distorting it.
          Deliberately untransitioned -- it's the one fixed anchor the eye
          lands on first while everything else cascades in around it. */}
      <div className="relative size-24 shrink-0 overflow-hidden rounded-full">
        <Image src="/eva-avatar.png" alt="Eva" fill sizes="96px" className="object-cover" priority />
      </div>

      <FadeIn delay={0.15} className="space-y-1.5 text-center">
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
      </FadeIn>

      {/* promptInput and suggestions arrive one beat apart rather than as
          one block -- the input is the thing to act on, so it settles in
          first; the chips are a secondary, optional path and read better
          landing just after instead of simultaneously. */}
      <div className="w-full max-w-xl space-y-3">
        <FadeIn delay={0.3}>{promptInput}</FadeIn>
        <FadeIn delay={0.42}>{suggestions}</FadeIn>
      </div>
    </div>
  );
}
