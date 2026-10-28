'use client';

import { BrainIcon } from 'lucide-react';

// Mirrors the operation shapes manage-memory-tool.ts's zod schema accepts
// -- a local type, not an import from that file, since it lives under
// lib/ai/tools and pulls in createServiceClient (lib/supabase/service.ts)
// transitively through journey-utils.ts, which must never end up in a
// client bundle (see CLAUDE.md). The tool call's `input.operations` is
// already in this shape at runtime; this just names it for the component.
type MemoryOperation =
  | {
      memoryType: 'profile_fact';
      action: 'add' | 'update' | 'delete';
    }
  | {
      memoryType: 'setup_progress' | 'deal_progress';
      action: 'add' | 'update';
    };

// Deliberately no expand-to-see-detail here (used to be a Collapsible
// listing every op's factType/value or step/status) -- showing Eva's
// internal bookkeeping line by line read as more mysterious than
// reassuring: a hidden, click-to-reveal box about "what got saved on me"
// invites suspicion rather than trust. A single, always-visible status
// line is plainer and answers the only thing that actually matters here
// -- did something get remembered or not.
export function MemoryUpdatesPanel({
  operations,
  ok = true,
}: {
  operations: MemoryOperation[];
  ok?: boolean;
}) {
  if (operations.length === 0) return null;

  if (!ok) {
    return (
      <p className="not-prose mb-3 flex items-center gap-2 text-xs leading-none text-muted-foreground">
        <BrainIcon className="size-3.5 shrink-0" />
        Memory update failed
      </p>
    );
  }

  const addedCount = operations.filter((op) => op.action === 'add').length;
  const updatedCount = operations.filter((op) => op.action === 'update').length;
  const forgottenCount = operations.filter((op) => op.action === 'delete').length;

  const parts = [
    addedCount > 0 && `Added ${addedCount} ${addedCount === 1 ? 'memory' : 'memories'}`,
    updatedCount > 0 && `Updated ${updatedCount} ${updatedCount === 1 ? 'memory' : 'memories'}`,
    forgottenCount > 0 && `Forgot ${forgottenCount} ${forgottenCount === 1 ? 'memory' : 'memories'}`,
  ].filter(Boolean);

  return (
    <p className="not-prose mb-3 flex items-center gap-2 text-xs leading-none text-muted-foreground">
      <BrainIcon className="size-3.5 shrink-0" />
      {parts.join(' · ')}
    </p>
  );
}
