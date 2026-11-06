// Thin wrapper around Flutterwave's REST API — same split as paystack.ts
// in this same folder: nothing here touches our own DB, only Flutterwave
// itself. Mirrors that file's two functions (initializeTransaction/
// verifyTransaction) so payments-actions.ts's Flutterwave-specific
// counterparts read the same way as the Paystack ones they sit next to.
//
// One real shape difference from Paystack worth knowing before touching
// this file: Paystack lets you verify a transaction by the reference YOU
// generated (/transaction/verify/:yourReference). Flutterwave's verify
// endpoint needs ITS OWN numeric transaction_id instead -- the one thing
// only their redirect back to us actually carries. That's why
// verifyTransaction below takes transactionId, not our own tx_ref/
// payment_reference; the caller (payments-actions.ts) still looks the
// payments row up by our own reference, same as Paystack's path, just
// alongside a second value Flutterwave handed back on the redirect.

function getSecretKey(): string {
  const key = process.env.FLUTTERWAVE_LIVE_SECRET_KEY;
  if (!key) throw new Error('Missing FLUTTERWAVE_LIVE_SECRET_KEY');
  return key;
}

const FLUTTERWAVE_API_BASE = 'https://api.flutterwave.com/v3';

interface InitializeTransactionParams {
  email: string;
  amountKobo: number; // Same unit convention as paystack.ts's own param, converted to naira below -- Flutterwave's API takes major-unit naira, not kobo.
  reference: string; // Sent as tx_ref.
  callbackUrl: string; // Sent as redirect_url.
  metadata?: Record<string, unknown>;
}

interface InitializeTransactionResult {
  authorizationUrl: string; // Flutterwave's hosted checkout link (named to match paystack.ts's own result shape -- same window.location.assign(...) call site either way).
}

export async function initializeTransaction(
  params: InitializeTransactionParams
): Promise<InitializeTransactionResult> {
  const res = await fetch(`${FLUTTERWAVE_API_BASE}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tx_ref: params.reference,
      amount: params.amountKobo / 100,
      currency: 'NGN',
      redirect_url: params.callbackUrl,
      customer: { email: params.email },
      customizations: {
        title: 'AI Export Mentor',
        description: 'Plan upgrade',
      },
      meta: params.metadata,
    }),
  });

  const json = await res.json();
  if (!res.ok || json?.status !== 'success') {
    throw new Error(`Flutterwave initialize failed: ${json?.message ?? res.statusText}`);
  }

  return { authorizationUrl: json.data.link };
}

export interface FlutterwaveVerifyResult {
  status: 'success' | 'failed' | string;
  reference: string;
  amountKobo: number;
  currency: string;
  paidAt: string | null;
}

// Always re-verify server-side against Flutterwave's own API before
// crediting anything, same reasoning as paystack.ts's verifyTransaction —
// called from the upgrade callback page and the mentor page's own arrival
// handler, never trusting the redirect's own query params alone.
export async function verifyTransaction(transactionId: string): Promise<FlutterwaveVerifyResult> {
  const res = await fetch(
    `${FLUTTERWAVE_API_BASE}/transactions/${encodeURIComponent(transactionId)}/verify`,
    { headers: { Authorization: `Bearer ${getSecretKey()}` } }
  );

  const json = await res.json();
  if (!res.ok || json?.status !== 'success') {
    throw new Error(`Flutterwave verify failed: ${json?.message ?? res.statusText}`);
  }

  const txn = json.data;
  return {
    status: txn.status === 'successful' ? 'success' : txn.status,
    reference: txn.tx_ref,
    amountKobo: Math.round(txn.amount * 100),
    currency: txn.currency,
    paidAt: txn.created_at ?? null,
  };
}
