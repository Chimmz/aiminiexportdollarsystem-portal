import { NextResponse } from 'next/server';
import { recordSalesSitePayment } from '@/lib/actions/leads-actions';
import { verifySalesSiteSecret } from '@/lib/utils/sales-site-auth';
import { sendPdfGuideReceiptEmail, sendUpgradeReceiptEmail } from '@/lib/actions/email-actions';
import { getPlanById } from '@/lib/actions/plans-actions';
import { formatPlanPrice } from '@/lib/utils/plan-utils';

// Called server-to-server by mini-export-web, right after IT has verified
// a charge with whichever gateway took it (Flutterwave today, Paystack
// possibly later) -- this app never talks to either gateway's API for a
// sales-site purchase, by design (see CLAUDE.md: that's intentionally the
// one thing left out of this codebase). A request without a valid shared
// secret, or with the wrong value, is rejected before any of the body is
// even read. See the sibling /lead route for the pre-payment half of this
// same funnel.
interface SalesSitePaymentBody {
  email: string;
  name?: string | null;
  phone?: string | null;
  gateway: 'paystack' | 'flutterwave';
  paymentReference: string;
  amountKobo: number;
  currency?: string;
  planId?: string;
}

export async function POST(req: Request) {
  if (!verifySalesSiteSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: SalesSitePaymentBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, gateway, paymentReference, amountKobo } = body;

  if (!email || !gateway || !paymentReference || !Number.isFinite(amountKobo)) {
    return NextResponse.json(
      { error: 'email, gateway, paymentReference and amountKobo are required' },
      { status: 400 }
    );
  }
  if (gateway !== 'paystack' && gateway !== 'flutterwave') {
    return NextResponse.json({ error: 'Unknown gateway' }, { status: 400 });
  }

  // Default, not a fallback for a bad value -- mini-export-web only ever
  // sells NGN, and 'pdf-guide' is the one product it sells (see
  // migrations/0015) -- but both stay overridable for a future second
  // sales-site product without touching this route.
  const planId = body.planId ?? 'pdf-guide';

  const result = await recordSalesSitePayment({
    email,
    name: body.name?.trim() || null,
    phone: body.phone?.trim() || null,
    gateway,
    paymentReference,
    amountKobo,
    currency: body.currency ?? 'NGN',
    planId,
  });

  if (result.status === 'error') {
    console.error('[sales-site webhook] record failed:', result.message);
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  // Best-effort, and only on a FRESH record -- 'duplicate' means some
  // earlier call (a retry, or the gateway re-firing its own event)
  // already got here first and would already have sent this, so sending
  // again here would double the receipt in the buyer's inbox. A send
  // failure must never turn into a 500 back to mini-export-web; the
  // payment itself is already recorded either way.
  //
  // Which template fires is driven by the plan's own grants_ai_access
  // flag, not a hardcoded planId === 'pdf-guide' check -- a buyer who
  // upgrades to an AI plan right on the sales site (a lead, not a user
  // yet -- see convert-lead.ts) gets the same upgrade-receipt copy an
  // in-portal purchase does, just pointed at /sign-in first instead of
  // straight at the mentor, and with accessUntilFormatted always null
  // here since no access_period exists yet -- that only gets created
  // once this lead actually signs in.
  if (result.status === 'recorded') {
    try {
      const siteOrigin =
        process.env.NEXT_PUBLIC_SITE_URL ?? 'https://account.aipoweredminiexportdollarsystem.online';
      const plan = await getPlanById(planId);
      const firstName = body.name?.trim().split(' ')[0] || 'there';
      const paidAtFormatted = new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      if (plan?.grantsAiAccess) {
        await sendUpgradeReceiptEmail({
          to: email,
          firstName,
          planLabel: plan.label,
          amountPaid: formatPlanPrice(amountKobo),
          paymentReference,
          paidAtFormatted,
          accessUntilFormatted: null,
          ctaUrl: `${siteOrigin}/sign-in?next=${encodeURIComponent('/dashboard/mentor')}`,
          ctaLabel: 'Sign in to access your mentor',
          requiresSignIn: true,
        });
      } else {
        await sendPdfGuideReceiptEmail({
          to: email,
          firstName,
          amountPaid: formatPlanPrice(amountKobo),
          paymentReference,
          paidAtFormatted,
          signInUrl: `${siteOrigin}/sign-in`,
        });
      }
    } catch (err) {
      console.error('[sales-site webhook] receipt email failed:', err);
    }
  }

  return NextResponse.json({
    status: result.status,
    leadId: result.leadId,
    paymentId: result.paymentId,
  });
}
