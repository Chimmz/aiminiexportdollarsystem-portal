import { AppSidebar } from '@/components/dashboard/app-sidebar';
import { DashboardMain } from '@/components/dashboard/dashboard-main';
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
  );
}
