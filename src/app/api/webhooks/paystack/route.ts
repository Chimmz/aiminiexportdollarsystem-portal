import { createServiceClient } from '@/lib/supabase/service';
import { creditPayment } from '@/lib/actions/payments-actions';
import {
  isPaystackLiveMode,
  verifyTransaction,
  verifyWebhookSignature,
} from '@/lib/payments/paystack';

// Registered as this app's single Paystack webhook URL (both test and
// live events land here — Paystack distinguishes them via the payload's
// own `data.domain`, not a separate URL). See CLAUDE.md for the
// in-portal-only scope: the sales site's own webhook (mini-export-web,
// not this repo) is unrelated and keeps writing leads/payments directly.
//
// Security, in the order each check runs:
//   1. Raw-body HMAC-SHA512 signature verification, timing-safe compared
//      — rejects anything not actually from Paystack before any of the
//      body's contents are even parsed.
//   2. `domain` match against which secret key this environment is
//      running (test vs. live) — stops a stray test-mode event from ever
//      being able to credit real paid access, or vice versa, once live
//      keys exist alongside test ones.
//   3. Re-verify server-side via Paystack's own /transaction/verify
//      endpoint rather than trusting this payload's amount/status —
//      creditPayment (payments-actions.ts) also re-checks the amount
//      against what the plan should cost.
//   4. Idempotent credit: creditPayment only writes once (`status =
//      'pending'` guard), since this and the callback-page path can both
//      fire for the same payment, and Paystack itself retries on timeout.
// Not implemented: an IP-allowlist of Paystack's published webhook
// source ranges. Signature verification alone is the actual security
// boundary Paystack recommends; an IP allowlist is defense-in-depth that
// can be added at the platform/edge level later without touching this
// handler.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature');

  const signatureValid = await verifyWebhookSignature(rawBody, signature);
  if (!signatureValid) {
    console.error('[paystack webhook] invalid or missing signature');
    return new Response('Invalid signature', { status: 401 });
  }

  let event: { event: string; data: { reference: string; domain: 'test' | 'live' } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const expectedDomain = isPaystackLiveMode() ? 'live' : 'test';
  if (event.data?.domain !== expectedDomain) {
    console.error('[paystack webhook] domain mismatch:', event.data?.domain);
    return new Response('Domain mismatch', { status: 400 });
  }

  if (event.event !== 'charge.success') {
    return new Response(null, { status: 200 });
  }

  const reference = event.data.reference;
  const supabase = createServiceClient();

  const { data: payment } = await supabase
    .from('payments')
    .select('id, user_id, plan_id, amount_kobo, status')
    .eq('paystack_reference', reference)
    .maybeSingle();

  if (!payment || !payment.user_id) {
    // Either an unknown reference, or a sales-site (lead-only) payment —
    // this app's webhook only credits in-portal, user-initiated purchases.
    // mini-export-web handles crediting its own.
    return new Response(null, { status: 200 });
  }

  await supabase
    .from('payments')
    .update({ raw_webhook_payload: event })
    .eq('id', payment.id);

  if (payment.status === 'success') {
    return new Response(null, { status: 200 });
  }

  try {
    const verified = await verifyTransaction(reference);
    if (verified.status === 'success') {
      await creditPayment({
        paymentId: payment.id,
        userId: payment.user_id,
        planId: payment.plan_id,
        expectedAmountKobo: payment.amount_kobo,
        verifiedAmountKobo: verified.amountKobo,
      });
    }
  } catch (err) {
    console.error('[paystack webhook] verify/credit failed:', err);
    // 200 anyway -- Paystack retries a non-2xx on a schedule we don't
    // control; the callback-page path can still credit this independently,
    // and a stuck 'pending' payment is visible/fixable from our own side.
  }

  return new Response(null, { status: 200 });
}
