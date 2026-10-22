'use client';

import { useEffect, useState, type ComponentType } from 'react';
import {
  Brain,
  Eraser,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Plus,
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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { ProfileFact } from '@/lib/utils/memory-utils';

// The mentor page's controls rail -- sits left of the chat column, with
// its own toggle in its own top bar below (not inside the width-collapsing
// content wrapper -- otherwise the button would vanish along with
// everything else once collapsed, with no way back in). Open state is
// purely local now that nothing outside this component needs to read or
// drive it (contrast app-sidebar.tsx's nav sidebar, whose header trigger
// toggles its own shadcn-managed state directly). The nav sidebar still
// auto-collapses on arrival at /dashboard/mentor to make initial room for
// this rail (see app-sidebar.tsx's route effect) -- that's a one-way,
// one-time handoff, not an ongoing shared state. Reads and writes
// profile_facts directly through /api/mentor/memory; chat clearing
// reaches back into MentorChatClient's useChat state via the
// onClearChat callback since this lives as its sibling, not inside it.

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
      {children}
    </p>
  );
}

function RailAction({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full flex-col items-start gap-2 rounded-xl border border-border bg-background p-3.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

interface MentorControlsRailProps {
  onClearChat: () => void;
  hasMessages: boolean;
}

export function MentorControlsRail({
  onClearChat,
  hasMessages,
}: MentorControlsRailProps) {
  const [open, setOpen] = useState(true);
  const [facts, setFacts] = useState<ProfileFact[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState('');
  const [newValue, setNewValue] = useState('');
  const [busyFactType, setBusyFactType] = useState<string | null>(null);
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const [clearMemoryOpen, setClearMemoryOpen] = useState(false);

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

  useEffect(() => {
    // Standard fetch-on-mount — setFacts above only ever runs after an
    // awaited fetch, never synchronously inside this effect's own tick
    // (same pattern/reasoning as rag-lab-client.tsx's loadRuns/loadSources).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async, not synchronous; the rule can't see past the await
    loadFacts();
  }, []);

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

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col overflow-hidden border-r border-border bg-background-subtle40 transition-[width] duration-200 ease-linear lg:flex',
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

      <div className="flex h-full w-80 shrink-0 flex-col gap-5 overflow-y-auto px-5 pb-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Chat controls</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage this conversation and what Eva remembers about you.
          </p>
        </div>

        <div className="space-y-2">
          <SectionLabel>Chat</SectionLabel>
          <Dialog open={clearChatOpen} onOpenChange={setClearChatOpen}>
            <DialogTrigger asChild>
              <RailAction
                icon={Eraser}
                label="Clear chat"
                description="Start a fresh conversation with Eva."
                onClick={() => setClearChatOpen(true)}
                disabled={!hasMessages}
              />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear this chat?</DialogTitle>
                <DialogDescription>
                  This only clears what&rsquo;s on screen — Eva still remembers your facts
                  and progress below.
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
                      This deletes all {facts.length} saved fact
                      {facts.length === 1 ? '' : 's'}. It can&rsquo;t be undone.
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

          {facts === null ? (
            <div className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              Loading memory...
            </div>
          ) : facts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center">
              <Brain className="size-5 text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">
                Nothing saved yet — Eva fills this in as you chat.
              </p>
            </div>
          ) : (
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
                      onClick={() => handleDelete(fact.factType)}
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
          )}

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
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Plus className="size-3.5" />
              Add a fact
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
