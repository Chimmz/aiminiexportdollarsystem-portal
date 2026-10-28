// Token-based usage limits, enforced in /api/mentor/chat via its _utils.ts's
// checkMentorChatLimits -- real provider-reported tokens (streamText's
// result.usage), never an estimate, metered through the token_usage
// ledger table (supabase/migrations/0012_token_usage.sql). Pulled out of
// chat/config.ts (which also owns the giant system-prompt string) into
// their own file because the usage charts (dashboard home's trial donut,
// the mentor controls rail's usage section) need these same numbers from
// client components, and importing config.ts there would drag the whole
// prompt-building module along with them.

// A trial user's total lifetime allowance. Never resets -- that's what
// makes it a free trial rather than a recurring allowance. The mentor
// route's system prompt + tool schemas + growing history costs several
// thousand tokens per turn on their own (the system prompt alone is sent
// fresh every single turn), which is what the old trial_messages_limit
// (10 messages, dropped from `users` in migrations/0014) was
// approximating by message count instead -- 300k gives real room for a
// trial to actually show someone what Eva's like before they hit it.
export const TRIAL_TOKEN_BUDGET = 300_000;

// RATE_LIMIT_WINDOW_HOURS / RATE_LIMIT_TOKENS_*: a separate, rolling-window
// abuse limit that applies to trial AND paid users alike -- protects the
// AI Gateway bill from being hammered regardless of plan status, the same
// way Claude/ChatGPT rate-limit paying subscribers too. Unlike the trial
// budget, this one does reset: once the oldest usage inside the window
// ages out, the ceiling lifts again. Paid gets a higher ceiling than
// trial -- trial users have no revenue backing their usage, so it's
// reasonable to hold them to a tighter line while still protecting the
// gateway from everyone.
export const RATE_LIMIT_WINDOW_HOURS = 3;
export const RATE_LIMIT_TOKENS_TRIAL = 900_000;
export const RATE_LIMIT_TOKENS_PAID = 900_000;

// Working memory (lib/mentor/working-memory.ts): instead of sending a
// user's entire message history to the model every turn, we keep the most
// recent `recentMessages` text-only messages verbatim and semantically
// search the rest for `rerankedMessages` more that are actually relevant
// to what's being asked right now. `olderPoolLimit` bounds how far back
// that search even looks -- the most recent `olderPoolLimit` qualifying
// messages before the recent window, not a user's entire lifetime
// history. That's deliberate, not a performance workaround: this is
// meant to behave like working memory (what's relevant to the
// conversation right now), not a second long-term memory system --
// recalling something from months ago is exactly what the separate
// profile_facts table (see manageMemory/MEMORY in config.ts) already
// exists to carry forward on purpose, permanently. A fixed cap here
// rather than one that grows with total history size keeps the number
// predictable to reason about while these figures are still being tuned.
// 'active' covers paid users; 'expired' never reaches this (blocked
// earlier in checkMentorChatLimits), so it has no entry.
export const WORKING_MEMORY_LIMITS = {
  trial: { recentMessagesLimit: 3, olderPoolLimit: 15, rerankedMessagesLimit: 5 },
  active: { recentMessagesLimit: 5, olderPoolLimit: 20, rerankedMessagesLimit: 5 },
} as const;
