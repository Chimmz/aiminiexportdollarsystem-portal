import { NextResponse } from 'next/server';
import { recordSalesSitePayment } from '@/lib/actions/leads-actions';
import { verifySalesSiteSecret } from '@/lib/utils/sales-site-auth';

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

  const result = await recordSalesSitePayment({
    email,
    name: body.name?.trim() || null,
    phone: body.phone?.trim() || null,
    gateway,
    paymentReference,
    amountKobo,
    // Default, not a fallback for a bad value -- mini-export-web only
    // ever sells NGN, and 'pdf-guide' is the one product it sells (see
    // migrations/0015) -- but both stay overridable for a future second
    // sales-site product without touching this route.
    currency: body.currency ?? 'NGN',
    planId: body.planId ?? 'pdf-guide',
  });

  if (result.status === 'error') {
    console.error('[sales-site webhook] record failed:', result.message);
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({
    status: result.status,
    leadId: result.leadId,
    paymentId: result.paymentId,
  });
}
