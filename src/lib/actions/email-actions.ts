import { render } from '@react-email/render';
import { Resend } from 'resend';
import { UpgradeReceiptEmail } from '@/emails/upgrade-receipt';
import { PdfGuideReceiptEmail } from '@/emails/pdf-guide-receipt';
import { TrialUpgradePromptEmail } from '@/emails/trial-upgrade-prompt';

// Lazily constructed, not module-top-level -- a missing RESEND_API_KEY
// should only ever break the one email send that needed it, not crash
// every route that happens to import this file.
function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Missing RESEND_API_KEY');
  return new Resend(apiKey);
}

function getFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('Missing RESEND_FROM_EMAIL');
  return from;
}

export interface SendUpgradeReceiptParams {
  to: string;
  firstName: string;
  planLabel: string;
  amountPaid: string;
  paymentReference: string;
  paidAtFormatted: string;
  accessUntilFormatted: string | null;
  mentorUrl: string;
}

// Called from payments-actions.ts's creditPayment, right after a payment
// is actually marked successful -- best-effort by design. The caller
// wraps this in its own try/catch; a send failure here must never undo
// or block the access that was already credited for real.
export async function sendUpgradeReceiptEmail(params: SendUpgradeReceiptParams): Promise<void> {
  const html = await render(
    UpgradeReceiptEmail({
      firstName: params.firstName,
      planLabel: params.planLabel,
      amountPaid: params.amountPaid,
      paymentReference: params.paymentReference,
      paidAtFormatted: params.paidAtFormatted,
      accessUntilFormatted: params.accessUntilFormatted,
      mentorUrl: params.mentorUrl,
    })
  );

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: params.to,
    subject: `Receipt: your ${params.planLabel} plan is active`,
    html,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

export interface SendTrialUpgradePromptParams {
  to: string;
  firstName: string;
  upgradeUrl: string;
}

// Called from access-actions.ts's activateUserOnFirstMessage, right after
// it wins the race to flip activated_at from null -- best-effort, same
// reasoning as the other sends in this file. Sent at most once per user,
// ever (activated_at never resets).
export async function sendTrialUpgradePromptEmail(
  params: SendTrialUpgradePromptParams
): Promise<void> {
  const html = await render(
    TrialUpgradePromptEmail({
      firstName: params.firstName,
      upgradeUrl: params.upgradeUrl,
    })
  );

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: params.to,
    subject: 'Your Eva trial just started',
    html,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

export interface SendPdfGuideReceiptParams {
  to: string;
  firstName: string;
  amountPaid: string;
  paymentReference: string;
  paidAtFormatted: string;
  signInUrl: string;
}

// Called from the sales-site webhook route, right after recordSalesSite-
// Payment reports a fresh 'recorded' (never 'duplicate') -- best-effort by
// design, same reasoning as sendUpgradeReceiptEmail above. There is no
// `users` row at this point, only a `leads` row, so `to`/`firstName` come
// from the webhook body mini-export-web sent, not a DB read.
export async function sendPdfGuideReceiptEmail(params: SendPdfGuideReceiptParams): Promise<void> {
  const html = await render(
    PdfGuideReceiptEmail({
      firstName: params.firstName,
      amountPaid: params.amountPaid,
      paymentReference: params.paymentReference,
      paidAtFormatted: params.paidAtFormatted,
      email: params.to,
      signInUrl: params.signInUrl,
    })
  );

  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: params.to,
    subject: 'Your guide and bonus contacts are ready',
    html,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
