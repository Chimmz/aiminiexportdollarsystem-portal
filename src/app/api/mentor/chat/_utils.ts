import type { JSONValue, ModelMessage } from 'ai';
import { summarizeContactsForModel, type ContactCard } from '@/lib/utils/contacts-utils';
import { getUserAccessTier } from '@/lib/actions/user-actions';
import {
  getLifetimeTokenUsage,
  getRollingWindowTokenUsage,
} from '@/lib/actions/token-usage-actions';
import {
  RATE_LIMIT_TOKENS_PAID,
  RATE_LIMIT_TOKENS_TRIAL,
  RATE_LIMIT_WINDOW_HOURS,
  TRIAL_TOKEN_BUDGET,
} from './config';

// Swaps a searchContacts tool result's real ContactCard[] (names, phones,
// emails, prices) out for a small summary before it's sent to the model
// on any step after the call -- see summarizeContactsForModel's own
// comment for why: telling the model not to repeat the contacts in text
// wasn't reliable enough on its own with a cheaper model, so this removes
// its ability to, instead of only asking it not to. Never touches the UI:
// mentor-chat-client.tsx reads the full cards straight off the
// tool-output-available stream event, which already fired before this
// ever runs.
export function redactSearchContactsOutputs(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== 'tool') return message;
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type !== 'tool-result' || part.toolName !== 'searchContacts')
          return part;
        if (part.output.type !== 'json') return part;

        const value = part.output.value as { contacts?: unknown; [key: string]: unknown };
        if (!Array.isArray(value.contacts)) return part;

        const { contacts, ...rest } = value as { contacts: ContactCard[] };
        return {
          ...part,
          output: {
            ...part.output,
            value: {
              ...rest,
              contacts: summarizeContactsForModel(contacts),
            } as unknown as JSONValue,
          },
        };
      }),
    };
  });
}

// "a few minutes" / "N minutes" / "N hours" -- deliberately this coarse,
// never an exact countdown. The point is to tell someone roughly when to
// come back, not to expose the underlying token mechanics (see
// TRIAL_TOKEN_BUDGET's own comment on why the actual numbers stay
// hidden).
function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return 'a few minutes';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

// The gate route.ts runs before ever calling streamText -- two
// independent checks, not one (see config.ts's TRIAL_TOKEN_BUDGET/
// RATE_LIMIT_* comments for why they're separate):
//
// 1. A trial user's lifetime token budget, which never resets -- once
//    it's gone, upgrading is the only way to keep chatting.
// 2. A rolling-window abuse rate limit, which applies to trial AND paid
//    users alike and does reset once the oldest usage inside the window
//    ages out.
//
// An 'expired' user (trial budget exhausted in a previous request, or a
// paid access period that's lapsed) is blocked outright, before either
// check runs -- there's nothing to rate-limit for someone who shouldn't
// be chatting at all. Returns null when the request should proceed.
export async function checkMentorChatLimits(userId: string): Promise<Response | null> {
  const tier = await getUserAccessTier(userId);

  if (tier === 'expired') {
    return new Response('Your access has expired. Upgrade to keep chatting with Eva.', {
      status: 402,
    });
  }

  const [lifetimeTokens, rateLimit] = await Promise.all([
    tier === 'trial' ? getLifetimeTokenUsage(userId) : Promise.resolve(0),
    getRollingWindowTokenUsage(userId, RATE_LIMIT_WINDOW_HOURS),
  ]);

  if (tier === 'trial' && lifetimeTokens >= TRIAL_TOKEN_BUDGET) {
    return new Response(
      "You've used up your free trial with Eva. Upgrade to keep the conversation going.",
      { status: 402 }
    );
  }

  const rateLimitCeiling =
    tier === 'active' ? RATE_LIMIT_TOKENS_PAID : RATE_LIMIT_TOKENS_TRIAL;

  if (rateLimit.tokens >= rateLimitCeiling) {
    const retryAfterSeconds = rateLimit.resetAt
      ? Math.max(0, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))
      : RATE_LIMIT_WINDOW_HOURS * 60 * 60;

    return new Response(
      `You're sending messages faster than Eva can keep up with right now. Try again in ${formatRetryAfter(retryAfterSeconds)}.`,
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
    );
  }

  return null;
}
