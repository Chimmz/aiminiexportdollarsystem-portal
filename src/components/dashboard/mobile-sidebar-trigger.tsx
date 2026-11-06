'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';

// SidebarTrigger (ui/sidebar.tsx) hardcodes PanelLeftIcon as a literal JSX
// child, not read off its spread props -- there's no way to swap its icon
// without editing that shared file. This is a plain button calling the
// same toggleSidebar() directly instead, just with a real hamburger icon
// for this floating mobile-only trigger (see dashboard/layout.tsx).
export function MobileSidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleSidebar}
      aria-label="Toggle sidebar"
      className={className}
    >
      <Menu className="size-4" />
    </Button>
  );
}
