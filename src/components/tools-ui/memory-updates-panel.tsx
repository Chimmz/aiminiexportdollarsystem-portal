'use client';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import {
  BrainIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  CircleIcon,
} from 'lucide-react';
import { Fragment } from 'react';

// Mirrors the operation shapes manage-memory-tool.ts's zod schema accepts
// -- a local type, not an import from that file, since it lives under
// lib/ai/tools and pulls in createServiceClient (lib/supabase/service.ts)
// transitively through journey-utils.ts, which must never end up in a
// client bundle (see CLAUDE.md). The tool call's `input.operations` is
// already in this shape at runtime; this just names it for the component.
type StepStatus = 'not_started' | 'in_progress' | 'done';

type MemoryOperation =
  | {
      memoryType: 'profile_fact';
      action: 'add' | 'update' | 'delete';
      factType: string;
      factValue: string | null;
      confidence: number | null;
    }
  | {
      memoryType: 'setup_progress' | 'deal_progress';
      action: 'add' | 'update';
      stepKey: string;
      status: StepStatus;
      detail: string | null;
      newDeal?: boolean | null;
    };

// Step keys and fact types are both written as snake_case, scale-prefixed
// for step keys (see journey-utils.ts) -- stripped and spaced out for
// display rather than duplicating that file's canonical label text here.
const ACRONYMS: Record<string, string> = {
  fda: 'FDA',
  nxp: 'NXP',
  llc: 'LLC',
  cac: 'CAC',
};

function humanize(key: string): string {
  return key
    .replace(/^(small|large)_/, '')
    .split('_')
    .map((word) => ACRONYMS[word] ?? word)
    .join(' ');
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'done') return <CheckCircle2Icon className="size-3.5 shrink-0 text-primary" />;
  if (status === 'in_progress')
    return <CircleDashedIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  return <CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />;
}

function statusLabel(status: StepStatus): string {
  return { not_started: 'not started', in_progress: 'in progress', done: 'done' }[status];
}

function OperationLine({ op }: { op: MemoryOperation }) {
  if (op.memoryType === 'profile_fact') {
    const factLabel = humanize(op.factType);
    return (
      <div className="flex flex-col gap-0.5">
        <p className="text-foreground/80">
          {op.action === 'delete' ? (
            <>Forgot <span className="font-medium">{factLabel}</span></>
          ) : (
            <>
              <span className="font-medium">{factLabel}</span>: {op.factValue}
            </>
          )}
        </p>
      </div>
    );
  }

  const trackLabel = op.memoryType === 'setup_progress' ? 'Getting started' : 'This deal';
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex items-start gap-1.5 text-foreground/80">
        <StatusIcon status={op.status} />
        <span>
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
            {trackLabel}
          </span>{' '}
          <span className="font-medium">{humanize(op.stepKey)}</span> &rarr; {statusLabel(op.status)}
          {op.newDeal ? ' (new deal)' : ''}
        </span>
      </p>
      {op.detail ? <p className="pl-5 text-muted-foreground italic">{op.detail}</p> : null}
    </div>
  );
}

export function MemoryUpdatesPanel({
  operations,
  ok = true,
  onToggle,
}: {
  operations: MemoryOperation[];
  ok?: boolean;
  // Same purpose as SearchKbPanel's onToggle -- briefly suppresses the
  // conversation's stick-to-bottom scroll on open/close (see
  // mentor-chat-client.tsx).
  onToggle?: () => void;
}) {
  if (operations.length === 0) return null;

  return (
    <Collapsible className="not-prose mb-3 text-xs" onOpenChange={onToggle}>
      <CollapsibleTrigger className="group flex items-center gap-2 leading-none text-muted-foreground transition-colors hover:text-foreground">
        <BrainIcon className="size-3.5 shrink-0" />
        <span>
          {ok ? 'Updated memory' : 'Memory update failed'} · {operations.length}{' '}
          {operations.length === 1 ? 'change' : 'changes'}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3 flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-3 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        {operations.map((op, i) => (
          <Fragment key={i}>
            {i > 0 ? <Separator /> : null}
            <OperationLine op={op} />
          </Fragment>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
