'use client';

import { useEffect, useState } from 'react';
import {
  Brain,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { UsageDonut } from '@/components/charts/usage-donut';
import { UsageLineChart } from '@/components/charts/usage-line-chart';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { ProfileFact } from '@/lib/utils/memory-utils';
import { statusLabel, type JourneyHighlightField } from '@/lib/utils/journey-utils';
import type { AccessStatus } from '@/lib/utils/user-utils';
import { useMentorChatState } from '@/contexts/mentor-context';

interface MentorUsage {
  history: { date: string; tokens: number }[];
  granularity: 'hour' | 'day';
  trialTokensUsed: number;
}

// The mentor page's controls rail -- sits left of the chat column, with
// its own toggle in its own top bar below (not inside the width-collapsing
// content wrapper -- otherwise the button would vanish along with
// everything else once collapsed, with no way back in). Open state is
// purely local now that nothing outside this component needs to read or
// drive it (contrast app-sidebar.tsx's nav sidebar, whose header trigger
// toggles its own shadcn-managed state directly). The nav sidebar still
// auto-collapses on arrival at /dashboard/mentor to make initial room for
// this rail (see app-sidebar.tsx's route effect) -- that's a one-way,
// one-time handoff, not an ongoing shared state. The displayed fact list
// starts from initialFacts (server-fetched in page.tsx, refreshed every
// turn via router.refresh() -- see mentor-chat-client.tsx), but manual
// add/delete/clear here still go straight through /api/mentor/memory and
// mutate local state directly/optimistically, same as before; chat
// clearing reaches back into MentorChatClient's useChat state via the
// onClearChat callback since this lives as its sibling, not inside it.

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
      {children}
    </p>
  );
}

interface MentorControlsRailProps {
  onClearChat: () => void;
  hasMessages: boolean;
  accessStatus: AccessStatus;
  initialFacts: ProfileFact[];
  initialJourneyFields: JourneyHighlightField[];
}

export function MentorControlsRail({
  onClearChat,
  hasMessages,
  accessStatus,
  initialFacts,
  initialJourneyFields,
}: MentorControlsRailProps) {
  // Below lg, the desktop aside (hidden lg:flex, below) never rendered at
  // all -- Memory, usage, and chat-clearing were simply unreachable on
  // mobile/tablet. isDesktop picks between that aside and a Sheet-based
  // drawer with its own floating trigger instead of CSS-hiding both at
  // once: the inner content below carries three state-controlled Dialogs
  // (clearChatOpen/clearMemoryOpen/factPendingDelete), and mounting that
  // same JSX twice would mean both copies' Dialogs open together off one
  // shared boolean, showing two stacked confirm dialogs. Same hydration
  // trade-off as useIsMobile's own already-shipped use in ui/sidebar.tsx:
  // this starts false on first paint (including desktop, briefly, until
  // the mount effect resolves it), not a new problem this introduces.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [open, setOpen] = useState(true);
  const [facts, setFacts] = useState<ProfileFact[] | null>(initialFacts);
  // SSR-seeded the same way facts/initialFacts is now (page.tsx), after
  // this used to have no seed at all and was only ever fetched once on
  // this component's own mount -- which meant a freshly-saved product or
  // country never showed up here without a full page reload, since
  // router.refresh() re-renders page.tsx but doesn't remount this
  // already-mounted client component, so that mount-only effect never
  // ran again. Read-only here regardless (see getProductAndCountryProgress's
  // own comment on why), so there's still no write path to wire up for
  // these two.
  const [journeyFields, setJourneyFields] =
    useState<JourneyHighlightField[]>(initialJourneyFields);
  // Tracks the last initialFacts/initialJourneyFields references actually
  // applied below, so a genuinely new one (page.tsx re-fetched, see
  // router.refresh() in mentor-chat-client.tsx) can be caught and applied
  // during render -- React's documented pattern for "reset state when a
  // prop changes" (https://react.dev/learn/you-might-not-need-an-effect),
  // which bails out of the extra render a useEffect version of this would
  // cost.
  const [prevInitialFacts, setPrevInitialFacts] = useState(initialFacts);
  if (initialFacts !== prevInitialFacts) {
    setPrevInitialFacts(initialFacts);
    setFacts(initialFacts);
  }
  const [prevInitialJourneyFields, setPrevInitialJourneyFields] =
    useState(initialJourneyFields);
  if (initialJourneyFields !== prevInitialJourneyFields) {
    setPrevInitialJourneyFields(initialJourneyFields);
    setJourneyFields(initialJourneyFields);
  }
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState('');
  const [newValue, setNewValue] = useState('');
  const [busyFactType, setBusyFactType] = useState<string | null>(null);
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const [clearMemoryOpen, setClearMemoryOpen] = useState(false);
  // The single fact a confirm dialog is currently open for, if any --
  // one shared dialog rather than one per fact (there can be many), the
  // same reasoning clearChatOpen/clearMemoryOpen above already apply to
  // their own single actions.
  const [factPendingDelete, setFactPendingDelete] = useState<ProfileFact | null>(null);
  const [usage, setUsage] = useState<MentorUsage | null>(null);
  const { usageVersion } = useMentorChatState();

  async function loadFacts() {
    try {
      const res = await fetch('/api/mentor/memory');
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { facts: ProfileFact[] };
      setFacts(data.facts);
    } catch (err) {
      console.error('[mentor] load memory failed:', err);
      setFacts([]);
    }
  }

  // Fetch on mount, then again every time usageVersion is bumped (see
  // mentor-context.tsx) -- route.ts pushes that signal right after a turn
  // actually records new token_usage, so this stays current within one
  // request/response round trip of real usage existing, rather than
  // guessing at a polling interval for a number that's otherwise static
  // between turns.
  useEffect(() => {
    fetch('/api/mentor/usage')
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data: MentorUsage) => setUsage(data))
      .catch((err) => {
        console.error('[mentor] load usage failed:', err);
        setUsage(null);
      });
  }, [usageVersion]);

  const handleDelete = async (factType: string) => {
    setBusyFactType(factType);
    const prev = facts;
    setFacts((f) => f?.filter((fact) => fact.factType !== factType) ?? null);
    try {
      const res = await fetch('/api/mentor/memory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factType }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (err) {
      console.error('[mentor] delete fact failed:', err);
      toast('Could not forget that one. Try again.');
      setFacts(prev ?? null);
    } finally {
      setBusyFactType(null);
    }
  };

  const handleClearAll = async () => {
    const prev = facts;
    setFacts([]);
    setClearMemoryOpen(false);
    try {
      const res = await fetch('/api/mentor/memory', { method: 'DELETE' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      toast('Memory cleared.');
    } catch (err) {
      console.error('[mentor] clear memory failed:', err);
      toast('Could not clear memory. Try again.');
      setFacts(prev ?? null);
    }
  };

  const handleAdd = async () => {
    const factType = newType.trim();
    const factValue = newValue.trim();
    if (!factType || !factValue) return;
    try {
      const res = await fetch('/api/mentor/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factType, factValue }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setNewType('');
      setNewValue('');
      setAdding(false);
      loadFacts();
    } catch (err) {
      console.error('[mentor] add fact failed:', err);
      toast('Could not save that. Try again.');
    }
  };

  // Everything the rail actually shows -- identical regardless of which
  // shell (the desktop aside below, or the mobile/tablet Sheet above it)
  // happens to be rendering it right now. A function, not a plain JSX
  // variable, so the two real differences between the shells (top
  // clearance, and width) can be passed in rather than baked in once.
  // Width: the aside needs a fixed w-80 (it's what its own collapse
  // animation widens/narrows between), but the Sheet's own panel is sized
  // independently below -- a fixed w-80 here too, with shrink-0 on top of
  // it, meant this content refused to shrink even when the Sheet's actual
  // available width came in under 320px on a narrow phone, overflowing
  // past the right edge. w-full here instead just fills whatever width
  // the Sheet actually gives it.
  const renderContent = (topPaddingClassName: string, widthClassName: string) => (
    <div
      className={cn(
        'flex h-full flex-col gap-5 overflow-y-auto px-5 pb-5',
        widthClassName,
        topPaddingClassName
      )}
    >
      <div>
          <h2 className="text-sm font-semibold text-foreground">Chat controls</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage this conversation and what Eva remembers about you.
          </p>
        </div>

        {/* First section in the rail -- a bit of "under the hood" dashboard
            feel for a page that's otherwise just a chat window. The donut
            is synchronous (straight off accessStatus, the same prop the
            dashboard home card's donut uses, no fetch needed) and only
            shown for a 'trial' user -- their lifetime trial-budget usage,
            never the rolling 3h rate-limit window, which isn't something
            any user (trial or paid) should see visualized here. The line
            chart is everyone's real 14-day history, fetched separately
            below since it's the one piece nothing else on this page
            already has. */}
        <div className="shrink-0 space-y-3">
          <SectionLabel>Usage</SectionLabel>
          {accessStatus.status === 'trial' && (
            <UsageDonut
              // usage?.trialTokensUsed is the freshly-refetched number (see
              // the usageVersion effect above) -- falls back to the
              // page-load prop only until that first fetch resolves, so
              // the donut never regresses to a stale value once it has a
              // real one.
              value={usage?.trialTokensUsed ?? accessStatus.trialTokensUsed}
              max={accessStatus.trialTokenBudget}
              label="of your free trial used"
            />
          )}
          {usage ? (
            <UsageLineChart data={usage.history} granularity={usage.granularity} />
          ) : (
            <div className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              Loading usage...
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <SectionLabel>Chat</SectionLabel>
          <Dialog open={clearChatOpen} onOpenChange={setClearChatOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                onClick={() => setClearChatOpen(true)}
                disabled={!hasMessages}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
              >
                <Trash2 className="size-4" />
                Clear chats
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear this chat?</DialogTitle>
                <DialogDescription>
                  This only clears what&rsquo;s on screen. Eva still remembers your
                  memories and progress.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setClearChatOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    onClearChat();
                    setClearChatOpen(false);
                  }}
                >
                  Clear chat
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Separator />

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Memory</SectionLabel>
            {facts && facts.length > 0 ? (
              <Dialog open={clearMemoryOpen} onOpenChange={setClearMemoryOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-muted-foreground hover:text-destructive"
                  >
                    Clear all
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Clear everything Eva remembers?</DialogTitle>
                    <DialogDescription>
                      This deletes all {facts.length} saved{' '}
                      {facts.length === 1 ? 'memory' : 'memories'}. It can&rsquo;t be
                      undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setClearMemoryOpen(false)}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={handleClearAll}>
                      Clear memory
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          {/* Read-only -- see getProductAndCountryProgress's own comment
              on why these two live in journey_setup_progress, not
              profile_facts, and why "deleting" one doesn't make sense
              the way it does for a loose fact. */}
          {journeyFields && journeyFields.length > 0 && (
            <>
              <ul className="space-y-1.5">
                {journeyFields.map((field) => (
                  <li
                    key={field.key}
                    className="rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <p className="text-xs font-medium text-foreground">
                      {field.key === 'product' ? 'Export product' : 'Target market'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {field.detail ??
                        (field.status === 'not_started'
                          ? 'Not decided yet'
                          : statusLabel(field.status))}
                    </p>
                  </li>
                ))}
              </ul>
              {/* Only separates this block from the facts list below it --
                  skip it when there's nothing there (no facts, see the
                  empty-state condition right below) to separate from. */}
              {facts && facts.length > 0 && <Separator />}
            </>
          )}

          {facts === null ? (
            <div className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              Loading memory...
            </div>
          ) : facts.length === 0 && (!journeyFields || journeyFields.length === 0) ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center">
              <Brain className="size-5 text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">
                Nothing saved yet — Eva fills this in as you chat.
              </p>
            </div>
          ) : facts.length > 0 ? (
            <ScrollArea className="-mx-1 max-h-72">
              <ul className="space-y-1.5 px-1">
                {facts.map((fact) => (
                  <li
                    key={fact.factType}
                    className="group flex items-start justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">
                        {fact.factType.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground">{fact.factValue}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFactPendingDelete(fact)}
                      disabled={busyFactType === fact.factType}
                      aria-label={`Forget ${fact.factType}`}
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive disabled:opacity-50"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          ) : null}

          <Dialog
            open={factPendingDelete !== null}
            onOpenChange={(open) => !open && setFactPendingDelete(null)}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Forget this?</DialogTitle>
                <DialogDescription>
                  Eva will stop remembering{' '}
                  <span className="font-medium text-foreground">
                    {factPendingDelete?.factValue}
                  </span>
                  . It can&rsquo;t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFactPendingDelete(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (factPendingDelete) handleDelete(factPendingDelete.factType);
                    setFactPendingDelete(null);
                  }}
                >
                  Forget it
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {adding ? (
            <div className="space-y-2 rounded-xl border border-border bg-background p-3">
              <Input
                placeholder="e.g. preferred_market"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="e.g. United States"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newType.trim() || !newValue.trim()}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 py-2.5 text-xs font-medium text-primary transition-colors hover:border-primary/60 hover:bg-primary/5"
            >
              <Plus className="size-3.5" />
              Add a memory
            </button>
          )}
        </div>
    </div>
  );

  if (!isDesktop) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? 'Close chat controls' : 'Open chat controls'}
          className="fixed top-10 right-6 z-50 rounded-full border border-border bg-sidebar text-primary shadow-md"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
        {/* [&>button]:hidden drops SheetContent's own built-in close (X)
            button -- same fix ui/sidebar.tsx's own mobile Sheet already
            uses for this exact conflict: that X sits at top-4 right-4,
            same corner the external trigger above occupies, so the two
            visibly overlapped. Dismiss via the trigger (now a toggle, not
            just open) or tapping the overlay instead. */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="right" className="w-[88vw] max-w-sm gap-0 p-0 [&>button]:hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>Chat controls</SheetTitle>
              <SheetDescription>
                Manage this conversation and what Eva remembers about you.
              </SheetDescription>
            </SheetHeader>
            {renderContent('pt-14', 'w-full')}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-hidden border-r border-border bg-background-subtle/40 transition-[width] duration-200 ease-linear',
        open ? 'w-80' : 'w-12'
      )}
    >
      {/* Its own top bar, outside the fixed-w-80 content wrapper below --
          staying full-width of whatever the aside currently is (80 or 12)
          rather than clipped along with the rest, so the toggle itself
          never disappears along with the content it's collapsing. */}
      <div
        className={cn(
          'flex shrink-0 items-center p-2',
          open ? 'justify-end' : 'justify-center'
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Collapse chat controls' : 'Expand chat controls'}
        >
          {open ? (
            <PanelLeftCloseIcon className="size-4" />
          ) : (
            <PanelLeftOpenIcon className="size-4" />
          )}
        </Button>
      </div>

      {renderContent('', 'w-80 shrink-0')}
    </aside>
  );
}
