'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { HomeIcon, UploadIcon, FolderIcon, FlaskConicalIcon } from 'lucide-react';
import { AISparkle } from '@/components/ui/ai-sparkle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import type { CurrentUser } from '@/lib/utils/user-utils';
import { signOut } from '@/app/dashboard/actions';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { href: '/dashboard/mentor', label: 'AI Mentor', icon: AISparkle },
  { href: '/dashboard/resources', label: 'Resources', icon: FolderIcon },
  { href: '/dashboard/upgrade', label: 'Upgrade', icon: UploadIcon },
];

// /dev/rag-lab 404s itself in production (burns real embedding-API credits
// per click) — this link is hidden there too, so it's never a dead click.
const devNavItems =
  process.env.NODE_ENV === 'production'
    ? []
    : [{ href: '/dev/rag-lab', label: 'RAG Lab', icon: FlaskConicalIcon }];

function displayNameFor(user: CurrentUser) {
  return user.fullName?.trim() || user.email.split('@')[0];
}

function initialsFor(user: CurrentUser) {
  const name = displayNameFor(user);
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function AppSidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const displayName = displayNameFor(user);
  const initials = initialsFor(user);
  const { setOpen } = useSidebar();
  const isMentorRoute = pathname.startsWith('/dashboard/mentor');

  // The mentor page gets its own controls rail (mentor-controls-rail.tsx,
  // with its own toggle) competing for the same horizontal space this nav
  // sidebar wants -- icon-collapsing it on entry gives that rail room
  // without the user having to remember to do it themselves, same spirit
  // as collapsible="icon" below. Only auto-drives it on route change, so a
  // manual re-expand (the header trigger below, or Cmd/Ctrl+B) while still
  // on the mentor page isn't immediately fought.
  useEffect(() => {
    setOpen(!isMentorRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpen's own identity changes every time `open` does (it's useCallback'd on [setOpenProp, open] in ui/sidebar.tsx), so listing it here would re-fire this effect on every toggle and immediately snap any manual expand/collapse back to the route default. Only a route change should drive this.
  }, [isMentorRoute]);

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.href;
    // AISparkle isn't a lucide icon -- it fills from an explicit `color`
    // prop, not currentColor/stroke like lucide's icons do (see
    // ai-sparkle.tsx), so the text-primary-foreground trick below that
    // recolors every other nav icon via inherited CSS color has no effect
    // on it. It also sets its own width/height attributes (default 24),
    // where the lucide icons here are sized purely by SidebarMenuButton's
    // own [&_svg]:size-4 rule -- passing size explicitly keeps it from
    // ever depending on that attribute-vs-CSS precedence to match up.
    const isMentorLink = item.icon === AISparkle;
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton
          asChild
          size="lg"
          isActive={isActive}
          tooltip={item.label}
          // size="lg" has its own collapsed-state override
          // (group-data-[collapsible=icon]:p-0! in ui/sidebar.tsx's size
          // variants) that zeroes padding instead of the base p-2! --
          // with 0 padding in the fixed 32px collapsed box and the
          // default justify-start, the icon sits left-aligned with empty
          // space on its right instead of centered. Forcing justify-center
          // directly is what actually centers it, rather than depending on
          // padding/icon-size arithmetic lining up.
          className="relative group-data-[collapsible=icon]:justify-center"
        >
          <Link href={item.href}>
            {isActive && (
              <motion.div
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-md bg-primary shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            {/* The pill above is opaque brand green, not a light wash --
                text/icon need an explicit light color here rather than
                relying on SidebarMenuButton's own data-active text class
                (text-sidebar-accent-foreground, dark), which would be
                unreadable against it. */}
            {isMentorLink ? (
              <AISparkle
                size={16}
                color={isActive ? 'var(--primary-foreground)' : undefined}
                className="relative z-10"
              />
            ) : (
              <item.icon className={cn('relative z-10', isActive && 'text-primary-foreground')} />
            )}
            {/* Hidden rather than left to clip via the button's own
                overflow-hidden -- clipping still leaves the label
                occupying flex layout space (shrunk toward, but not
                exactly, zero), which nudges the icon left of center.
                Removing it from flow entirely lets the icon sit exactly
                centered in the collapsed box instead: size-8! (32px) minus
                p-2! padding (8px each side) leaves exactly 16px of content
                width, which is exactly the icon's own size-4 (16px) --
                with nothing else in flow, default left-alignment and dead
                center are the same thing here. */}
            <span
              className={cn(
                'relative z-10 group-data-[collapsible=icon]:hidden',
                isActive && 'text-primary-foreground'
              )}
            >
              {item.label}
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-3 px-4 py-4">
        <SidebarTrigger className="self-end group-data-[collapsible=icon]:self-center" />
        <Link
          href="/dashboard"
          className="block text-sm font-semibold leading-relaxed group-data-[collapsible=icon]:hidden"
        >
          The AI-Powered Mini Export
          <br />
          <span className="text-accent-gold">Dollar System</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-4 py-2">
        <SidebarGroup className="px-3">
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">{navItems.map(renderNavItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {devNavItems.length > 0 && (
          <>
            <SidebarSeparator className="mx-3 w-auto" />
            <SidebarGroup className="px-3">
              <SidebarGroupContent>
                <SidebarMenu className="gap-2">
                  {devNavItems.map(renderNavItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="px-4 py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Same size="lg" collapsed-padding/centering quirk as
                renderNavItem's buttons above -- same two-part fix. */}
            <SidebarMenuButton size="lg" className="group-data-[collapsible=icon]:justify-center">
              <Avatar className="size-6">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="truncate text-sm group-data-[collapsible=icon]:hidden">
                {displayName}
              </span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/account">Account</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
