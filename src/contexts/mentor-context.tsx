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
// memoryVersion: bumped by MentorChatClient's useChat onData handler
// whenever route.ts's stream carries a 'frontend-action': 'refresh-sidebar'
// data part (written only when manageMemory actually saved something mid-
// turn -- see that file's comment) -- read by MentorControlsRail so it
// refetches its memory list right away instead of only on mount.
//
// usageVersion: same push mechanism, but for 'refresh-usage' -- written
// whenever a turn actually recorded token usage (i.e. almost every turn,
// unlike the conditional memory one). Read by MentorControlsRail to
// refetch both halves of its Usage section (the line chart's history and
// the trial donut's lifetime total) the moment new usage exists, rather
// than polling on a timer for a number that only ever changes right after
// a turn completes.
//
// No other route needs either, and MentorChatClient is the only writer of
// both, so a single context beats threading props through
// dashboard/layout.tsx for values only one of its many child routes ever
// sets.
interface MentorChatStateValue {
  hasMessages: boolean;
  setHasMessages: (value: boolean) => void;
  memoryVersion: number;
  bumpMemoryVersion: () => void;
  usageVersion: number;
  bumpUsageVersion: () => void;
}

const MentorChatStateContext = createContext<MentorChatStateValue | null>(null);

export function MentorChatStateProvider({ children }: { children: ReactNode }) {
  const [hasMessages, setHasMessages] = useState(false);
  const [memoryVersion, setMemoryVersion] = useState(0);
  const [usageVersion, setUsageVersion] = useState(0);
  const bumpMemoryVersion = useCallback(() => setMemoryVersion((v) => v + 1), []);
  const bumpUsageVersion = useCallback(() => setUsageVersion((v) => v + 1), []);
  return (
    <MentorChatStateContext.Provider
      value={{
        hasMessages,
        setHasMessages,
        memoryVersion,
        bumpMemoryVersion,
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
      memoryVersion: 0,
      bumpMemoryVersion: () => {},
      usageVersion: 0,
      bumpUsageVersion: () => {},
    }
  );
}
