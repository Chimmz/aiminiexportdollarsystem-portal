import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Jost/League Spartan/SUSE (next/font/google, subsets: ["latin"] only --
// see layout.tsx) don't include the Naira sign (₦, U+20A6), outside the
// Latin block. Rendered inline with Latin-subset text, the browser falls
// back to a different font just for that glyph, and its metrics don't
// line up with the custom font -- it visually smears into whatever comes
// next. Isolating ₦ in its own span with an explicit system font stack
// (which does have the glyph, with correct metrics) avoids that entirely.
//
// That fallback font's baseline/cap-height still doesn't exactly match
// the custom font's, so default baseline alignment leaves the glyph
// looking slightly off relative to digits next to it -- align-middle
// centers it against the surrounding text instead.
const SYSTEM_FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

export function NairaSign({ className }: { className?: string }) {
  return (
    <span
      className={cn('align-middle leading-none', className)}
      style={{ fontFamily: SYSTEM_FONT_STACK }}
    >
      ₦
    </span>
  );
}

// vertical-align (what NairaSign relies on above) is a no-op on flex
// items, so a ₦ + amount pair rendered as two children of a flex row
// (e.g. a result chip) doesn't get the fix -- each becomes its own
// anonymous flex item, centered as a box, but the two fonts' differing
// ascent/descent still makes the glyph look off against the digits. Wrap
// the pair in its own nested flex row instead wherever ₦ sits next to a
// live amount inside a flex container; use NairaSign alone (as a prefix
// adornment, say) when nothing needs pairing with it.
export function NairaAmount({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0.5 leading-none">
      <NairaSign />
      {children}
    </span>
  );
}

// Splits a larger pre-formatted string ("₦9,500", "about ₦7,667 a month")
// on every ₦ and wraps each occurrence in NairaSign -- for a label that's
// more than just the bare glyph. Use NairaSign directly instead when ₦ is
// the whole thing, e.g. as an input prefix.
export function formatNaira(text: string): ReactNode[] {
  return text
    .split('₦')
    .flatMap((part, i) => (i === 0 ? [part] : [<NairaSign key={`naira-${i}`} />, part]));
}
