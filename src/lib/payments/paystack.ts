// Thin wrapper around Paystack's REST API — nothing in here touches our
// own DB (that's payments-actions.ts); this file only knows how to talk to
// Paystack itself, same split as lib/ai/models.ts vs the mentor files that
// use it.

// LIVE_* wins once it exists — lets this app "graduate" to real charges by
// adding PAYSTACK_LIVE_SECRET_KEY/PAYSTACK_LIVE_PUBLIC_KEY to the
// environment alone, no code change, instead of the sibling
// affordable-onestop-shop project's single hardcoded live key.
function getSecretKey(): string {
  const key = process.env.PAYSTACK_LIVE_SECRET_KEY || process.env.PAYSTACK_TEST_SECRET_KEY;
  if (!key) throw new Error('Missing PAYSTACK_LIVE_SECRET_KEY / PAYSTACK_TEST_SECRET_KEY');
  return key;
}

export function isPaystackLiveMode(): boolean {
  return Boolean(process.env.PAYSTACK_LIVE_SECRET_KEY);
}

const PAYSTACK_API_BASE = 'https://api.paystack.co';

interface InitializeTransactionParams {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

interface InitializeTransactionResult {
  authorizationUrl: string;
  accessCode: string;
}

export async function initializeTransaction(
  params: InitializeTransactionParams
): Promise<InitializeTransactionResult> {
  const res = await fetch(`${PAYSTACK_API_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      currency: 'NGN',
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  });

  const json = await res.json();
  if (!res.ok || !json?.status) {
    throw new Error(`Paystack initialize failed: ${json?.message ?? res.statusText}`);
  }

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
  };
}

export interface PaystackVerifyResult {
  status: 'success' | 'failed' | 'abandoned' | string;
  reference: string;
  amountKobo: number;
  currency: string;
  domain: 'test' | 'live';
  paidAt: string | null;
}

// Always re-verify server-side against Paystack's own API before crediting
// anything — called from both the webhook and the callback-page path, and
// never trust a webhook payload's own amount/status fields on their own
// (see the route handler's comment for why).
export async function verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
  const res = await fetch(
    `${PAYSTACK_API_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${getSecretKey()}` } }
  );

  const json = await res.json();
  if (!res.ok || !json?.status) {
    throw new Error(`Paystack verify failed: ${json?.message ?? res.statusText}`);
  }

  return {
    status: json.data.status,
    reference: json.data.reference,
    amountKobo: json.data.amount,
    currency: json.data.currency,
    domain: json.data.domain,
    paidAt: json.data.paid_at ?? null,
  };
}

// HMAC-SHA512 of the raw request body, timing-safe compared against the
// x-paystack-signature header — the one thing that proves a webhook call
// actually came from Paystack and not an attacker who just knows our
// webhook URL. Takes the raw body text, never a re-serialized JSON object:
// JSON.stringify(JSON.parse(body)) is not guaranteed to produce the exact
// same bytes Paystack signed (key order, whitespace), which would make a
// legitimate call fail verification.
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!signatureHeader) return false;

  const { createHmac, timingSafeEqual } = await import('node:crypto');
  const expected = createHmac('sha512', getSecretKey()).update(rawBody).digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signatureHeader, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
