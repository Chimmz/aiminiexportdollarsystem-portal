import { AppSidebar } from '@/components/dashboard/app-sidebar';
import { DashboardMain } from '@/components/dashboard/dashboard-main';
import { MobileSidebarTrigger } from '@/components/dashboard/mobile-sidebar-trigger';
import { MentorChatStateProvider } from '@/contexts/mentor-context';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { requireCurrentUser } from '@/lib/actions/user-actions';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireCurrentUser();

  return (
    // Default --sidebar-width is 16rem (see SIDEBAR_WIDTH in ui/sidebar.tsx)
    // — overridden here rather than edited in the shared component, which
    // other projects pull from unchanged. AppSidebar is variant="inset",
    // which is what makes SidebarInset below float as its own white
    // rounded card over the layout canvas (--page-canvas, globals.css)
    // instead of sitting flush beside the nav rail. The canvas color is
    // likewise forced here via inline style rather than a className --
    // SidebarProvider's wrapper only picks up --sidebar's color through
    // its own has-data-[variant=inset]:bg-sidebar rule, and a plain class
    // can't reliably out-rank that scoped one through tailwind-merge, so
    // an unconditional inline style is what actually wins. SidebarInset
    // itself is untouched, so the content card stays the site's normal
    // white. Its own header trigger (plus Cmd/Ctrl+B, see
    // SIDEBAR_KEYBOARD_SHORTCUT in ui/sidebar.tsx) is how the nav sidebar
    // itself expands/retracts.
    <MentorChatStateProvider>
      <SidebarProvider
        style={
          {
            '--sidebar-width': '15rem',
            backgroundColor: 'var(--page-canvas)',
          } as React.CSSProperties
        }
      >
        <AppSidebar user={user} />
        {/* The three overrides below all re-target md:peer-data-[variant=
            inset]:* classes the shared component already sets (rounded-xl,
            shadow-sm, m-2/ml-0) -- a differently-scoped className (e.g. a
            bare md:shadow-soft) can't reliably out-rank a variant-scoped one
            through tailwind-merge, since merge only dedupes an identical
            variant chain; matching the scope and forcing precedence with
            Tailwind's trailing `!` is what's actually deterministic. mt-4!
            only touches margin-top, so the extra gap shows at the card's top
            edge (more canvas visible there) without changing the left
            (already ml-0, flush against the rail), right, or bottom gaps. */}
        <SidebarInset className="md:peer-data-[variant=inset]:rounded-3xl! md:peer-data-[variant=inset]:shadow-none! md:peer-data-[variant=inset]:mt-4!">
          {/* Below md, AppSidebar's own SidebarHeader (and the
              SidebarTrigger living inside it) renders inside a Sheet that's
              closed by default -- with no trigger anywhere outside that
              Sheet, there was no way to ever open it on a real mobile
              device (only the Cmd/Ctrl+B shortcut worked). Fixed/floating,
              not an in-flow header bar, so it costs DashboardMain nothing --
              that component's mentor-route branch depends on owning the
              exact 100svh for its own internal scroll; an in-flow bar above
              it would eat into that and overflow the viewport on mobile. */}
          <MobileSidebarTrigger className="fixed top-10 left-3 z-50 rounded-full border border-border bg-sidebar text-primary shadow-md md:hidden" />
          {/* vh/svh resolves against the real viewport regardless of how
              ancestors are sized, rather than depending on flex-stretch
              sizing to count as "definite" through several nested flex
              levels, which browsers are inconsistent about. Pages taller
              than this overflow visibly and the window scrolls as normal;
              the mentor chat page uses the full, exact height for its own
              internal scroll instead. */}
          <DashboardMain>{children}</DashboardMain>
        </SidebarInset>
      </SidebarProvider>
    </MentorChatStateProvider>
  );
}
