import { AppSidebar } from '@/components/dashboard/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { requireCurrentUser } from '@/lib/actions/user-actions';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireCurrentUser();

  // Header bar (with SidebarTrigger) hidden for now, trying it without —
  // Cmd/Ctrl+B still toggles the sidebar (see SIDEBAR_KEYBOARD_SHORTCUT in
  // ui/sidebar.tsx), so it's not the only way in if this sticks.
  return (
    // Default --sidebar-width is 16rem (see SIDEBAR_WIDTH in ui/sidebar.tsx)
    // — overridden here rather than edited in the shared component, which
    // other projects pull from unchanged.
    <SidebarProvider style={{ '--sidebar-width': '18rem' } as React.CSSProperties}>
      <AppSidebar user={user} />
      <SidebarInset>
        {/* vh/svh resolves against the real viewport regardless of how
            ancestors are sized, rather than depending on flex-stretch
            sizing to count as "definite" through several nested flex
            levels, which browsers are inconsistent about. Pages taller
            than this overflow visibly and the window scrolls as normal;
            the mentor chat page uses the full, exact height for its own
            internal scroll instead. */}
        <main className="mx-auto h-[100svh] w-full max-w-3xl">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
