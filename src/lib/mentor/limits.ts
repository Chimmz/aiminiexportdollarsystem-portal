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
// approximating by message count instead.
// Bumped back up to 500k for now (originally 300k, then 200k, briefly
// reverted to 200k before this).
export const TRIAL_TOKEN_BUDGET = 500_000;

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

// A second, much longer-window ceiling for paid users only -- the 3-hour
// rate limit above catches a short burst, but on its own it only bounds
// usage to 900k every 3 hours, which is far too loose to mean anything
// over a full month (it'd allow ~7.2M tokens/day if someone maxed it
// around the clock). This is deliberately NOT sized off any plan's price
// or margin -- that would turn every tier into a tight, Synthesia-style
// credits allowance, which is the wrong shape for a chat product and
// would make typical, bursty real usage (a long study session, then
// days of quiet) feel capped. Instead this is sized generously enough
// that no real student studying a finite course should ever sustain
// enough daily volume to hit it for a full rolling month straight --
// ~385 turns/30 days at the ~13k-tokens/turn this app actually sees in
// practice. It exists purely to catch genuine outliers (non-malicious
// hammering, or a runaway client bug), not to meter typical usage.
// Margin comes from the blended average across the whole paying base
// (the same way every "unlimited" AI chat subscription actually prices
// itself), not from capping each individual user to break-even.
export const USAGE_CEILING_WINDOW_HOURS = 24 * 30;
export const USAGE_CEILING_TOKENS_PAID = 5_000_000;

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
// profile_facts table (see lib/mentor/memory-extraction.ts and MEMORY in
// config.ts) already exists to carry forward on purpose, permanently. A fixed cap here
// rather than one that grows with total history size keeps the number
// predictable to reason about while these figures are still being tuned.
// 'active' covers paid users; 'expired' never reaches this (blocked
// earlier in checkMentorChatLimits), so it has no entry.
export const WORKING_MEMORY_LIMITS = {
  trial: { recentMessagesLimit: 3, olderPoolLimit: 15, rerankedMessagesLimit: 5 },
  active: { recentMessagesLimit: 5, olderPoolLimit: 20, rerankedMessagesLimit: 5 },
} as const;

// profile_facts (memory-actions.ts's getUserMemory) carries every fact
// forward permanently -- it's still the one true long-term store, unlike
// the bounded working-memory window above. But "permanently stored" and
// "resent in full every single turn, forever" turned out to be two
// different things: a long-tenured user's fact list only grows, so their
// per-turn prompt cost was silently growing with it. This caps the same
// way WORKING_MEMORY_LIMITS caps message history -- semantically recalled
// against the current turn (match_profile_facts, migrations/0032), not
// just the most recent -- while 'intake' and 'user_provided' facts are
// exempt and always included in full, since those were deliberately
// given, not incidentally extracted, and should never silently vanish.
export const PROFILE_FACTS_RECALL_LIMIT = 15;
