'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// Every dashboard page reads comfortably at a centered, capped width --
// except the mentor page, which now carves its own width into a chat
// column + an always-visible controls rail (mentor-controls-rail.tsx) and
// needs the full card to itself. A Server Component layout can't branch on
// the route itself, so this one-purpose client wrapper exists just to read
// the pathname and pick a width -- see dashboard/layout.tsx.
export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMentor = pathname?.startsWith('/dashboard/mentor') ?? false;

  return (
    <div className={cn('h-[100svh] w-full', !isMentor && 'mx-auto max-w-3xl')}>{children}</div>
  );
}
