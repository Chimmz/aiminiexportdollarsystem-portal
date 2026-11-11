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
import { resources } from '@/lib/mock-data/resources';

// Sent once per successful sales-site ('pdf-guide') payment, from inside
// the /api/webhooks/sales-site route's recordSalesSitePayment convergence
// point -- fires only on a fresh 'recorded' result, never on 'duplicate',
// so a webhook retry can't double-send. There's no `users` row yet at
// this point (just a `leads` row -- see convert-lead.ts), so this can't
// deep-link into the portal the way upgrade-receipt.tsx does; the one
// real job here is pointing the buyer at /sign-in.
export interface PdfGuideReceiptEmailProps {
  firstName: string;
  amountPaid: string; // pre-formatted, e.g. "₦9,800" -- see formatPlanPrice
  paymentReference: string;
  paidAtFormatted: string; // e.g. "November 5, 2026"
  email: string;
  signInUrl: string;
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
const subtext = { fontSize: '14px', color: '#475569', margin: '0 0 16px', lineHeight: '22px' };
const listItem = { fontSize: '14px', color: '#0f172a', margin: '0 0 6px', lineHeight: '20px' };
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
const hint = { fontSize: '12px', color: '#94a3b8', margin: '10px 0 0', lineHeight: '18px' };
const footer = { fontSize: '12px', color: '#94a3b8', marginTop: '24px', lineHeight: '18px' };

export function PdfGuideReceiptEmail({
  firstName,
  amountPaid,
  paymentReference,
  paidAtFormatted,
  email,
  signInUrl,
}: PdfGuideReceiptEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your guide and bonus contacts are ready</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>The AI-Powered Mini Export Dollar System</Text>
          <Heading style={heading}>Thanks for grabbing the guide, {firstName}</Heading>
          <Text style={subtext}>Your payment went through. Here is what is waiting for you:</Text>

          <Section style={{ margin: '0 0 20px' }}>
            {/* resources[0] is the guide itself; the free mentor trial sits
                right after it and before the three contact directories,
                matching the guide -> mentor -> bonus-contacts order the
                sales copy itself uses -- not folded into the shared
                `resources` array since it's a trial of an ongoing feature,
                not a downloadable resource like the other three. */}
            <Text style={listItem}>&bull; {resources[0].title}</Text>
            <Text style={listItem}>&bull; Free trial access to your AI Export Mentor</Text>
            {resources.slice(1).map((resource) => (
              <Text key={resource.id} style={listItem}>
                &bull; {resource.title}
              </Text>
            ))}
          </Section>

          <Section>
            <table width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr style={row}>
                  <td style={rowLabel}>Item</td>
                  <td style={rowValue} align="right">
                    Export Guide + Directories + AI Mentor Trial
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
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: '#e2e8f0', margin: '24px 0' }} />

          <Section style={{ textAlign: 'center' as const }}>
            <Button href={signInUrl} style={button}>
              Sign in to get your guide
            </Button>
            <Text style={hint}>Enter the same email you used in your purchase: {email}.</Text>
          </Section>

          <Text style={footer}>
            This is a no-reply address. Questions about your order? Write to{' '}
            chima@aipoweredminiexportdollarsystem.online.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
