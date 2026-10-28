// Plan id -> human label and the post-payment celebration copy built from
// it. Shared between the Upgrade callback page and the mentor page's
// post-payment toast (mentor-chat-client.tsx) so the two surfaces that can
// both show "you just paid" copy never drift into describing the same
// plan two different ways. Deliberately not the same source as upgrade-
// page-client.tsx's own `tiers` array -- that one carries pricing/layout
// data too and already exists independently; this is a small, separate
// duplication of just the label strings, same shape as the pre-existing
// price-duplication already noted in migrations/0015.
const PLAN_LABELS: Record<string, string> = {
  '30-day': '30 days',
  '3-month': '3 months',
  '6-month': '6 months',
};

export function getPlanLabel(planId: string): string {
  return PLAN_LABELS[planId] ?? 'your plan';
}

function formatAccessUntil(endsAtIso: string): string {
  return new Date(endsAtIso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// `endsAt` is null when this payment activated an unactivated user (see
// createAccessPeriodForPayment) -- their period only starts counting once
// they actually open the mentor, so there's no concrete end date yet to
// show. Still a reward, just phrased without a date.
//
// Two deliberately distinct clauses, not one run-on sentence: the first
// confirms exactly what just happened (what they bought), the second is
// the actual benefit, tied back to what Eva's whole job on this platform
// is -- getting them to their first real export and keeping them from
// getting stuck along the way (see config.ts's PRODUCT CONTEXT) -- not a
// generic "no limits" usage-mechanics pitch. The point of this moment is
// that they're still on track toward the thing they actually came here
// for, not that they bought more quota.
export function paymentSuccessCopy(
  planId: string,
  endsAt: string | null
): { heading: string; body: string } {
  const label = getPlanLabel(planId);
  const whenClause = endsAt
    ? `covered through ${formatAccessUntil(endsAt)}`
    : 'starting the moment you open the mentor';
  return {
    heading: "You're upgraded",
    body: `You've unlocked ${label} of full access to Eva, ${whenClause}. You're still right on track toward your first export, and whenever you hit a snag along the way, she's here to get you unstuck, not leave you guessing.`,
  };
}
