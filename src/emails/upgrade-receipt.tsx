import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'react-email';

// Sent once per successful AI-plan payment (both a first upgrade and any
// later renewal/top-up) from inside payments-actions.ts's creditPayment --
// the one place both the Paystack webhook and the verify-callback path
// converge after a payment is actually marked successful, so this fires
// exactly once regardless of which path got there first. A full-receipt
// style (amount, reference, date) rather than just the short in-app toast
// copy (paymentSuccessCopy in plan-utils.ts) -- this is the thing a buyer
// might actually need to find again later (a support request, their own
// records), not just a celebratory moment.
export interface UpgradeReceiptEmailProps {
  firstName: string;
  planLabel: string;
  amountPaid: string; // pre-formatted, e.g. "₦23,000" -- see formatPlanPrice
  paymentReference: string;
  paidAtFormatted: string; // e.g. "November 4, 2026"
  accessUntilFormatted: string | null; // null when the period is still unactivated
  ctaUrl: string;
  ctaLabel: string;
  // True for an AI-plan purchase made on the sales site, where there's no
  // `users` row yet (same situation as pdf-guide-receipt.tsx) -- the plan
  // isn't actually active yet, just paid for, so both the subtext and the
  // CTA need to say "sign in first," not "you're all set."
  requiresSignIn: boolean;
}

const main = { backgroundColor: '#f6f6f4', fontFamily: 'Helvetica, Arial, sans-serif' };
const container = {
  backgroundColor: '#ffffff',
  margin: '32px auto',
  padding: '32px 28px',
  borderRadius: '16px',
  maxWidth: '480px',
};
const brand = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#94a3b8',
  margin: '0 0 16px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
};
const heading = { fontSize: '20px', fontWeight: 600, color: '#0f172a', margin: '0 0 8px' };
const subtext = { fontSize: '14px', color: '#475569', margin: '0 0 24px', lineHeight: '22px' };
// display:flex on a <tr> (the original version of this) is silently
// ignored by every email client's table layout engine -- cellPadding={0}
// on the <table> then left zero actual gap between the label and value
// cells, since table-layout:auto sizes each column to its own content
// with nothing forcing space between them. paddingRight on the label
// cell itself is what email clients do respect.
const row = { fontSize: '14px' };
const rowLabel = { color: '#64748b', padding: '8px 16px 8px 0', verticalAlign: 'top' as const };
const rowValue = {
  color: '#0f172a',
  fontWeight: 600,
  padding: '8px 0',
  verticalAlign: 'top' as const,
};
const button = {
  backgroundColor: '#15803d',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 600,
  borderRadius: '999px',
  padding: '12px 28px',
  textDecoration: 'none',
  display: 'inline-block',
};
const footer = { fontSize: '12px', color: '#94a3b8', marginTop: '24px', lineHeight: '18px' };

export function UpgradeReceiptEmail({
  firstName,
  planLabel,
  amountPaid,
  paymentReference,
  paidAtFormatted,
  accessUntilFormatted,
  ctaUrl,
  ctaLabel,
  requiresSignIn,
}: UpgradeReceiptEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your {planLabel} plan is confirmed — receipt inside</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>The AI-Powered Mini Export Dollar System</Text>
          <Heading style={heading}>You&apos;re upgraded, {firstName}</Heading>
          <Text style={subtext}>
            {requiresSignIn
              ? `Your payment went through. Sign in to activate your ${planLabel} plan and start chatting with Eva.`
              : `Your payment went through and your ${planLabel} plan is active. Here is your receipt for your records.`}
          </Text>

          <Section>
            <table width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr style={row}>
                  <td style={rowLabel}>Plan</td>
                  <td style={rowValue} align="right">
                    {planLabel}
                  </td>
                </tr>
                <tr style={row}>
                  <td style={rowLabel}>Amount paid</td>
                  <td style={rowValue} align="right">
                    {amountPaid}
                  </td>
                </tr>
                <tr style={row}>
                  <td style={rowLabel}>Date</td>
                  <td style={rowValue} align="right">
                    {paidAtFormatted}
                  </td>
                </tr>
                <tr style={row}>
                  <td style={rowLabel}>Reference</td>
                  <td style={rowValue} align="right">
                    {paymentReference}
                  </td>
                </tr>
                <tr style={row}>
                  <td style={rowLabel}>Access</td>
                  <td style={rowValue} align="right">
                    {accessUntilFormatted ? `Through ${accessUntilFormatted}` : 'Starts on first use'}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: '#e2e8f0', margin: '24px 0' }} />

          <Section style={{ textAlign: 'center' as const }}>
            <Button href={ctaUrl} style={button}>
              {ctaLabel}
            </Button>
          </Section>

          <Text style={footer}>
            This is a no-reply address. Questions about this receipt? Write to{' '}
            chima@aipoweredminiexportdollarsystem.online.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
