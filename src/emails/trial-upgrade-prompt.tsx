import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'react-email';

// Sent once per user, from inside access-actions.ts's
// activateUserOnFirstMessage, right after it wins the race to flip
// activated_at from null (the same is('activated_at', null) guard that
// makes that update idempotent against a concurrent duplicate call).
// Scoped there to only when there was no already-purchased plan chaining
// in at that exact moment -- someone who paid for an AI plan before ever
// opening the mentor shouldn't get a "your trial is expiring" email the
// first time they chat, since they just activated a paid period, not a
// trial.
export interface TrialUpgradePromptEmailProps {
  firstName: string;
  upgradeUrl: string;
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

export function TrialUpgradePromptEmail({ firstName, upgradeUrl }: TrialUpgradePromptEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your free trial started the moment you sent your first message</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>The AI-Powered Mini Export Dollar System</Text>
          <Heading style={heading}>You&apos;re in, {firstName}</Heading>
          <Text style={subtext}>
            You just sent your first message to Eva. Your free trial started the moment you
            did. It is a one time allowance that does not renew, so it is worth upgrading
            before it runs out if you want uninterrupted help on your way to your first
            export.
          </Text>

          <Section style={{ textAlign: 'center' as const }}>
            <Button href={upgradeUrl} style={button}>
              Upgrade your AI mentor
            </Button>
          </Section>

          <Text style={footer}>
            Questions? Write to chima@aipoweredminiexportdollarsystem.online.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
