'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// Two pieces of MentorChatClient's own state (useChat, deep inside
// dashboard/layout.tsx's `children` slot) that tree siblings -- not
// descendants -- of that slot need to see:
//
// hasMessages: whether the active conversation has any messages yet, read
// by the global nav sidebar (AppSidebar) so it can auto-collapse to
// icon-only once a conversation starts and auto-expand again back on the
// empty-state hero.
//
// usageVersion: bumped by MentorChatClient's useChat onData handler
// whenever route.ts's stream carries a 'frontend-action': 'refresh-usage'
// data part -- written whenever a turn actually recorded token usage
// (i.e. almost every turn). Read by MentorControlsRail to refetch both
// halves of its Usage section (the line chart's history and the trial
// donut's lifetime total) the moment new usage exists, rather than
// polling on a timer for a number that only ever changes right after a
// turn completes. Memory has no equivalent version here anymore -- its
// refresh goes through router.refresh() re-running page.tsx's own
// server-side fetch instead (see mentor-chat-client.tsx and
// mentor-controls-rail.tsx), since a push-through-the-stream signal has
// nowhere to come from once the save itself moved into route.ts's
// onFinish (no `writer` there).
//
// No other route needs this, and MentorChatClient is the only writer of
// it, so a single context beats threading a prop through
// dashboard/layout.tsx for a value only one of its many child routes ever
// sets.
interface MentorChatStateValue {
  hasMessages: boolean;
  setHasMessages: (value: boolean) => void;
  usageVersion: number;
  bumpUsageVersion: () => void;
}

const MentorChatStateContext = createContext<MentorChatStateValue | null>(null);

export function MentorChatStateProvider({ children }: { children: ReactNode }) {
  const [hasMessages, setHasMessages] = useState(false);
  const [usageVersion, setUsageVersion] = useState(0);
  const bumpUsageVersion = useCallback(() => setUsageVersion((v) => v + 1), []);
  return (
    <MentorChatStateContext.Provider
      value={{
        hasMessages,
        setHasMessages,
        usageVersion,
        bumpUsageVersion,
      }}
    >
      {children}
    </MentorChatStateContext.Provider>
  );
}

// Safe to call from any route, not just the mentor one -- returns the
// defaults (false/0, no-op setters) on routes that never set them, rather
// than throwing, so AppSidebar and MentorControlsRail (both rendered --
// or in the rail's case, mountable -- outside the mentor route too) don't
// need their own is-this-the-mentor-route check just to read this safely.
export function useMentorChatState(): MentorChatStateValue {
  const ctx = useContext(MentorChatStateContext);
  return (
    ctx ?? {
      hasMessages: false,
      setHasMessages: () => {},
      usageVersion: 0,
      bumpUsageVersion: () => {},
    }
  );
}
