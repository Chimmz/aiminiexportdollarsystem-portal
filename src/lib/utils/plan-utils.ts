import type { AccessStatus } from './user-utils';

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

// Names the plan plainly ("3-month plan") instead of a generic "Active
// plan" badge -- currentPlanId is already the exact plans.id text (see
// requireCurrentUser), never 'pdf-guide' since that product never grants
// an access_period, so no special-casing is needed on that branch. On the
// trial branch, recentPaymentPlanId tells apart someone who's bought
// nothing at all from someone who bought the guide but hasn't upgraded to
// an AI plan yet -- the latter reads as "Free plan" rather than "Free
// trial". Shared by the dashboard home card and the Account page's Plan
// & billing badge so the two never describe the same status two
// different ways.
export function planBadgeLabel(accessStatus: AccessStatus): string {
  if (accessStatus.status === 'active' && accessStatus.currentPlanId) {
    return `${accessStatus.currentPlanId} plan`;
  }
  if (accessStatus.status === 'expired') return 'Access expired';
  if (accessStatus.recentPaymentPlanId === 'pdf-guide') return 'Free plan';
  return 'Free trial';
}

// The AI-access tiers shown on the Upgrade page, shaped from plans-actions
// getActivePlans() -- camelCased here rather than passing the raw DB row
// shape down into a client component.
export interface PlanTier {
  id: string;
  label: string;
  priceKobo: number;
  durationDays: number;
  isRecommended: boolean;
}

// "₦9,500" -- upgrade-page-client.tsx was duplicating this as a literal
// string per tier before; computing it from price_kobo is what makes a
// DB-side price change (or a new tier) show up without a code change.
export function formatPlanPrice(priceKobo: number): string {
  const naira = priceKobo / 100;
  return `₦${naira.toLocaleString('en-US')}`;
}

// "about ₦7,667 a month" for anything longer than 30 days, null for the
// 30-day tier itself (nothing to average over) -- same condition the
// hardcoded tiers array used to encode per-row (perMonth: null vs set),
// now derived instead of duplicated.
export function planPerMonthLabel(priceKobo: number, durationDays: number): string | null {
  const months = durationDays / 30;
  if (months <= 1) return null;
  const perMonthNaira = Math.round(priceKobo / 100 / months);
  return `about ₦${perMonthNaira.toLocaleString('en-US')} a month`;
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
