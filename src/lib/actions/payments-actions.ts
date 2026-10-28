'use server';

import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { getCurrentUser } from '@/lib/actions/user-actions';
import { createAccessPeriodForPayment } from '@/lib/actions/access-actions';
import { initializeTransaction, verifyTransaction } from '@/lib/payments/paystack';

// The in-portal counterpart to convert-lead.ts's sales-site flow: an
// already-signed-in member buying/renewing a plan from the dashboard
// Upgrade page, with no lead involved (see
// supabase/migrations/0013_member_initiated_payments.sql).

// Derived from the actual incoming request rather than read straight off
// NEXT_PUBLIC_SITE_URL -- Next.js only loads .env.production during a
// production build/start (NODE_ENV=production), never during `next dev`,
// but it's easy to end up with it anyway: a local production build
// (`pnpm build && pnpm start`) picks up .env.production's live-domain
// value, or a shell that already has NEXT_PUBLIC_SITE_URL exported
// overrides any .env file regardless of mode. Reading the request's own
// Host header instead means the callback_url Paystack gets always matches
// wherever this request actually came from -- localhost, an ngrok tunnel,
// or the real production domain -- with NEXT_PUBLIC_SITE_URL only as a
// last-resort fallback for the rare case neither header is present.
async function getSiteOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host');
  if (host) {
    const protocol =
      requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${protocol}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

// Called from upgrade-page-client.tsx's "Get <plan>" buttons. Creates a
// `pending` payments row up front (so the webhook/callback has something
// to find by reference even if the buyer never comes back from Paystack's
// checkout page) and returns the URL to redirect the browser to.
//
// returnTo: 'mentor' when this checkout was started from the access-limit
// bar on /dashboard/mentor (see access-limit-bar.tsx's ?from=mentor and
// upgrade-page-client.tsx, which reads it back off the URL) -- Paystack's
// callback_url then points straight at the mentor page instead of the
// generic Upgrade callback page, so mentor-chat-client.tsx can verify the
// payment itself, show the success toast in place, and resend whatever
// message got blocked by the access-limit bar, all without an extra click
// through an intermediate confirmation screen.
export async function initiatePlanPurchase(
  planId: string,
  returnTo?: 'mentor'
): Promise<{ authorizationUrl: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not signed in.' };

  const supabase = createServiceClient();

  const { data: plan } = await supabase
    .from('plans')
    .select('id, price_kobo, is_active')
    .eq('id', planId)
    .maybeSingle();
  if (!plan || !plan.is_active) return { error: 'That plan is not available.' };

  // Prefixed and random, not sequential — this is the value a tampered
  // callback URL could otherwise be used to probe (see
  // verifyAndActivatePayment's ownership check below for the other half
  // of that defense).
  const reference = `portal_${randomUUID()}`;

  const { data: payment, error: insertError } = await supabase
    .from('payments')
    .insert({
      user_id: user.id,
      plan_id: plan.id,
      paystack_reference: reference,
      amount_kobo: plan.price_kobo,
      status: 'pending',
    })
    .select('id')
    .single();
  if (insertError || !payment) {
    return { error: 'Could not start checkout. Try again.' };
  }

  try {
    const siteOrigin = await getSiteOrigin();
    const callbackPath =
      returnTo === 'mentor' ? '/dashboard/mentor' : '/dashboard/upgrade/callback';
    const { authorizationUrl } = await initializeTransaction({
      email: user.email,
      amountKobo: plan.price_kobo,
      reference,
      callbackUrl: `${siteOrigin}${callbackPath}`,
      metadata: { plan_id: plan.id, user_id: user.id },
    });
    return { authorizationUrl };
  } catch (err) {
    console.error('[payments] initialize transaction failed:', err);
    await supabase.from('payments').update({ status: 'failed' }).eq('id', payment.id);
    return { error: 'Could not start checkout. Try again.' };
  }
}

export type VerifyPaymentResult =
  | { status: 'success'; planId: string; endsAt: string | null }
  | { status: 'pending' | 'failed' | 'not_found' };

// The resulting access_periods row's ends_at for this payment, or null
// when it was created unactivated (a first-ever purchase before this user
// had ever sent a mentor message -- see createAccessPeriodForPayment) and
// so has no concrete end date yet. Only ever one row per payment_id.
async function getAccessPeriodEndsAt(paymentId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('access_periods')
    .select('ends_at')
    .eq('payment_id', paymentId)
    .maybeSingle();
  return data?.ends_at ?? null;
}

// Called from the Upgrade callback page, and from mentor-chat-client.tsx
// when checkout was started from the mentor page itself (see
// initiatePlanPurchase's returnTo), right after Paystack redirects the
// buyer's browser back. The webhook (route.ts under
// /api/webhooks/paystack) is the primary, reliable path — this is the
// faster, user-facing path that lets the caller show a result immediately
// instead of "check back in a moment," and both are written to be safely
// idempotent against each other (see creditPayment below).
export async function verifyAndActivatePayment(
  reference: string
): Promise<VerifyPaymentResult> {
  const user = await getCurrentUser();
  if (!user) return { status: 'not_found' };

  const supabase = createServiceClient();
  const { data: payment } = await supabase
    .from('payments')
    .select('id, user_id, plan_id, amount_kobo, status')
    .eq('paystack_reference', reference)
    .maybeSingle();

  // Ownership check: a tampered callback URL (someone else's reference)
  // must never let this caller read or credit a payment that isn't theirs.
  if (!payment || payment.user_id !== user.id) return { status: 'not_found' };
  if (payment.status === 'success') {
    const endsAt = await getAccessPeriodEndsAt(payment.id);
    return { status: 'success', planId: payment.plan_id, endsAt };
  }
  if (payment.status !== 'pending') return { status: 'failed' };

  let verified;
  try {
    verified = await verifyTransaction(reference);
  } catch (err) {
    console.error('[payments] verify transaction failed:', err);
    return { status: 'pending' };
  }

  if (verified.status !== 'success') return { status: 'failed' };

  const credited = await creditPayment({
    paymentId: payment.id,
    userId: payment.user_id,
    planId: payment.plan_id,
    expectedAmountKobo: payment.amount_kobo,
    verifiedAmountKobo: verified.amountKobo,
  });
  if (!credited) return { status: 'failed' };

  const endsAt = await getAccessPeriodEndsAt(payment.id);
  return { status: 'success', planId: payment.plan_id, endsAt };
}

// Shared by the callback path above and the webhook route — whichever one
// gets there first does the crediting; the other finds status already
// `success` and no-ops. Re-checks `status = 'pending'` right before the
// write (not just on read) so two near-simultaneous callers can't both
// pass the earlier check and double-credit.
export async function creditPayment(params: {
  paymentId: string;
  userId: string;
  planId: string;
  expectedAmountKobo: number;
  verifiedAmountKobo: number;
}): Promise<boolean> {
  if (params.verifiedAmountKobo !== params.expectedAmountKobo) {
    console.error('[payments] amount mismatch, refusing to credit:', params);
    return false;
  }

  const supabase = createServiceClient();

  const { data: plan } = await supabase
    .from('plans')
    .select('duration_days')
    .eq('id', params.planId)
    .single();
  if (!plan) return false;

  const { data: claimed } = await supabase
    .from('payments')
    .update({ status: 'success', paid_at: new Date().toISOString() })
    .eq('id', params.paymentId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (!claimed) return true; // already credited by the other path — not an error

  await createAccessPeriodForPayment({
    userId: params.userId,
    paymentId: params.paymentId,
    durationDays: plan.duration_days,
  });
  return true;
}
