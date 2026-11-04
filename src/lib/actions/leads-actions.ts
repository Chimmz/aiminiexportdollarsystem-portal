import { createServiceClient } from '@/lib/supabase/service';

// Writes made on behalf of the separate mini-export-web sales site, via
// its one server-to-server call (see /api/webhooks/sales-site). That site
// never talks to this DB directly -- see CLAUDE.md -- so this is the only
// place a leads/payments row for a sales-site purchase gets created.
// convert-lead.ts is the other half: it links these rows to a real user
// once that email signs in here.

export interface CheckoutStartedInput {
  email: string;
  name: string | null;
  phone: string | null;
  reference: string | null;
}

export type RecordCheckoutStartedResult =
  | { status: 'recorded'; leadId: string }
  | { status: 'error'; message: string };

// Ranks funnel_stage so a lead can only ever move forward through it --
// a returning customer re-opening the checkout modal after already
// paying (or signing in) must never get bumped back down to
// 'checkout_started'.
const FUNNEL_RANK: Record<string, number> = {
  email_captured: 0,
  checkout_started: 1,
  payment_failed: 1,
  abandoned: 1,
  paid: 2,
  converted: 3,
};

// Called the moment someone submits the sales-site checkout form and is
// about to be redirected to a payment gateway -- before we know whether
// they'll actually complete the charge. This is what lets a drop-off
// exist as a lead stuck at 'checkout_started' (with the gateway
// reference that attempt used) instead of not existing at all until
// payment succeeds. name/phone/reference are overwritten on each call,
// not just filled in when missing, since the person is actively retyping
// the form right now -- that's the freshest data available, unlike
// recordSalesSitePayment's findOrCreateLead below, which only fills in
// gaps left by an earlier abandoned attempt.
export async function recordCheckoutStarted(
  input: CheckoutStartedInput
): Promise<RecordCheckoutStartedResult> {
  const supabase = createServiceClient();
  const { email, name, phone, reference } = input;

  const { data: existing } = await supabase
    .from('leads')
    .select('id, funnel_stage')
    .ilike('email', email)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, string | null> = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (reference) updates.last_checkout_reference = reference;
    if ((FUNNEL_RANK[existing.funnel_stage] ?? 0) < FUNNEL_RANK.checkout_started) {
      updates.funnel_stage = 'checkout_started';
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from('leads').update(updates).eq('id', existing.id);
    }
    return { status: 'recorded', leadId: existing.id };
  }

  const { data: created, error } = await supabase
    .from('leads')
    .insert({ email, name, phone, last_checkout_reference: reference, funnel_stage: 'checkout_started' })
    .select('id')
    .single();

  if (created) return { status: 'recorded', leadId: created.id };

  // Lost a create race to a concurrent call for the same email -- same
  // fallback findOrCreateLead uses below.
  const { data: retry } = await supabase
    .from('leads')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (retry) return { status: 'recorded', leadId: retry.id };

  return { status: 'error', message: error?.message ?? 'Could not record lead' };
}

export interface SalesSitePaymentInput {
  email: string;
  name: string | null;
  phone: string | null;
  gateway: 'paystack' | 'flutterwave';
  paymentReference: string;
  amountKobo: number;
  currency: string;
  planId: string;
}

export type RecordSalesSitePaymentResult =
  | { status: 'recorded'; leadId: string; paymentId: string }
  | { status: 'duplicate'; leadId: string; paymentId: string }
  | { status: 'error'; message: string };

// Finds the lead by email (same lower(email) match convert-lead.ts uses --
// leads_email_unique_idx is on lower(email), not email, so this can't be a
// plain upsert) and marks it 'paid', filling in name only if the lead
// didn't already have one (an earlier abandoned-checkout attempt may have
// captured just the email). Loses a create race against a concurrent call
// for the same email by falling back to a re-select, since the unique
// index would reject a second insert anyway.
async function findOrCreateLead(
  supabase: ReturnType<typeof createServiceClient>,
  { email, name, phone }: { email: string; name: string | null; phone: string | null }
): Promise<string> {
  const { data: existing } = await supabase
    .from('leads')
    .select('id, name, phone')
    .ilike('email', email)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, string> = { funnel_stage: 'paid' };
    if (name && !existing.name) updates.name = name;
    if (phone && !existing.phone) updates.phone = phone;
    await supabase.from('leads').update(updates).eq('id', existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('leads')
    .insert({ email, name, phone, funnel_stage: 'paid' })
    .select('id')
    .single();

  if (created) return created.id;

  const { data: retry } = await supabase
    .from('leads')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (retry) return retry.id;

  throw new Error(error?.message ?? 'Could not create lead');
}

// Called once per verified sales-site payment. Idempotent on
// payment_reference -- mini-export-web retrying a timed-out call, or a
// gateway re-firing its own event, must never create a second payments row
// for the same charge, so a repeat call returns 'duplicate' instead of
// erroring.
export async function recordSalesSitePayment(
  input: SalesSitePaymentInput
): Promise<RecordSalesSitePaymentResult> {
  const supabase = createServiceClient();

  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id, lead_id')
    .eq('payment_reference', input.paymentReference)
    .maybeSingle();
  if (existingPayment) {
    return {
      status: 'duplicate',
      leadId: existingPayment.lead_id,
      paymentId: existingPayment.id,
    };
  }

  let leadId: string;
  try {
    leadId = await findOrCreateLead(supabase, {
      email: input.email,
      name: input.name,
      phone: input.phone,
    });
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Lead upsert failed' };
  }

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      lead_id: leadId,
      plan_id: input.planId,
      gateway: input.gateway,
      payment_reference: input.paymentReference,
      amount_kobo: input.amountKobo,
      currency: input.currency,
      status: 'success',
      paid_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !payment) {
    // A concurrent call for the same reference could lose this insert to
    // the unique constraint after already passing the check above --
    // treat that the same as finding it there in the first place.
    const { data: retry } = await supabase
      .from('payments')
      .select('id')
      .eq('payment_reference', input.paymentReference)
      .maybeSingle();
    if (retry) return { status: 'duplicate', leadId, paymentId: retry.id };
    return { status: 'error', message: error?.message ?? 'Could not record payment' };
  }

  return { status: 'recorded', leadId, paymentId: payment.id };
}
