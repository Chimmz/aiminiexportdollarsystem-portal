'use client';

import { usePathname } from 'next/navigation';
import { Container } from '@/components/layout/container';

// Every dashboard page reads comfortably at a centered, capped width --
// except the mentor page, which now carves its own width into a chat
// column + an always-visible controls rail (mentor-controls-rail.tsx) and
// needs the full card to itself. A Server Component layout can't branch on
// the route itself, so this one-purpose client wrapper exists just to read
// the pathname and pick a width -- see dashboard/layout.tsx.
//
// /dashboard/resources and /dashboard/upgrade (exact match -- not its
// /callback child, which still wants the automatic wrap) now wrap their
// own content in Container directly instead of relying on this automatic
// one, so they're excluded here too -- otherwise they'd end up nested
// inside two Containers.
const SELF_WRAPPED_ROUTES = ['/dashboard/resources', '/dashboard/upgrade'];

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMentor = pathname?.startsWith('/dashboard/mentor') ?? false;
  const isSelfWrapped = pathname ? SELF_WRAPPED_ROUTES.includes(pathname) : false;

  return (
    // overflow-y-auto is the actual fix here -- without it, content taller
    // than 100svh doesn't get clipped by this fixed-height box, it just
    // paints past it (CSS overflow:visible is the default), spilling out
    // past SidebarInset's rounded bottom edge onto the bare page canvas
    // below. That's what made every section below the fold look like its
    // own separately-floating white card instead of one continuous
    // scrollable panel. Harmless on the mentor route too -- its own
    // internal layout already fits exactly within 100svh, so this never
    // actually needs to scroll there.
    //
    // The width cap lives on Container (an inner wrapper), not this
    // scrolling div itself -- putting it here too would narrow the
    // scrollable box down to just that centered column, so a
    // wheel/trackpad scroll only did anything with the cursor directly
    // over the content. This outer div stays full width (the whole
    // SidebarInset panel), so scrolling works anywhere in the panel,
    // including the empty margins left/right of the centered column; only
    // the content inside is capped and centered.
    <div className="h-[100svh] w-full overflow-y-auto">
      {isMentor || isSelfWrapped ? children : <Container>{children}</Container>}
    </div>
  );
}
