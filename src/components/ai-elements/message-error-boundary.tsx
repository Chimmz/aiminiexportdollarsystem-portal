'use client';

import { Component, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

// A render crash in one persisted message's tool-part (a malformed or
// legacy-shaped output from old DB data -- the same failure mode the
// contact-type rename already hit once, see contact-search-panel.tsx's
// `if (!meta) return null` guard) previously took the ENTIRE conversation
// down with it: React unmounts everything above the nearest error
// boundary on an uncaught render error, and nothing in this app had one,
// so one bad message blanked every message. conversation-messages.tsx
// wraps each message in this, keyed by message.id, so a crash degrades to
// a small inline notice for that one message instead.
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class MessageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[mentor] message render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-1 mb-3 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" />
          This message couldn&rsquo;t be displayed.
        </div>
      );
    }
    return this.props.children;
  }
}
