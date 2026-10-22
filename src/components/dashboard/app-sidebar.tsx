'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { HomeIcon, UploadIcon, FolderIcon, FlaskConicalIcon } from 'lucide-react';
import { AISparkle } from '@/components/ui/ai-sparkle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.href;
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton
          asChild
          size="lg"
          isActive={isActive}
          tooltip={item.label}
          className="relative"
        >
          <Link href={item.href}>
            {isActive && (
              <motion.div
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-md bg-gradient-to-br from-primary/12 to-primary/5"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <item.icon className="relative z-10" />
            <span className="relative z-10">{item.label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6">
        <Link href="/dashboard" className="block text-sm font-semibold leading-relaxed">
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
            <SidebarMenuButton size="lg">
              <Avatar className="size-6">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="truncate text-sm">{displayName}</span>
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
