import { NextResponse } from 'next/server';
import { recordCheckoutStarted } from '@/lib/actions/leads-actions';
import { verifySalesSiteSecret } from '@/lib/utils/sales-site-auth';

interface LeadCaptureBody {
  email: string;
  name?: string | null;
  phone?: string | null;
  reference?: string | null;
}

// Called server-to-server by mini-export-web the moment someone submits
// the checkout form, before they're redirected to pay -- the pre-payment
// half of the funnel. See the sibling route (../route.ts) for the
// payment-confirmation half, called after a charge is actually verified.
export async function POST(req: Request) {
  if (!verifySalesSiteSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: LeadCaptureBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const result = await recordCheckoutStarted({
    email: body.email,
    name: body.name?.trim() || null,
    phone: body.phone?.trim() || null,
    reference: body.reference?.trim() || null,
  });

  if (result.status === 'error') {
    console.error('[sales-site webhook] lead capture failed:', result.message);
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({ status: result.status, leadId: result.leadId });
}
