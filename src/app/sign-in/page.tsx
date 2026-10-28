'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  Loader2Icon,
  MailCheckIcon,
} from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { FadeIn } from '@/components/motion/fade-in';
import { sendMagicLink, type SendMagicLinkState } from './actions';

const initialState: SendMagicLinkState = { status: 'idle' };

// A plain, conventional sign-in gate -- not framed around Eva/the mentor,
// since this is the entry point for the account as a whole, not just the
// chat. Keeps the centered layout and soft radial backdrop from the
// previous pass (a generic "feature zone" treatment also used on the
// dashboard home and payment-callback pages, see globals.css), just in
// the app's own brand tokens instead of Eva's AI-specific gradient.
export default function SignInPage() {
  const [state, action, pending] = useActionState(sendMagicLink, initialState);
  const isSent = state.status === 'sent';

  return (
    <div className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="pointer-events-none absolute inset-0 -z-10 bg-radial from-primary/15 via-accent-gold/5 to-transparent"
      />

      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <Link href="/" className="text-sm font-semibold leading-relaxed text-foreground">
          The AI-Powered Mini Export
          <br />
          <span className="text-accent-gold">Dollar System</span>
        </Link>

        <FadeIn delay={0.15} className="space-y-1.5">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {isSent
              ? state.alreadySent
                ? 'We already sent a link to your email. Check your inbox, or wait a minute to request a new one.'
                : "We've sent you a link to sign in. Check your inbox to continue."
              : "Enter the email you paid with and we'll send you a secure link to sign in. No password needed."}
          </p>
        </FadeIn>

        <FadeIn delay={0.3} className="w-full">
          {isSent ? (
            <div className="flex items-center justify-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-3 text-sm">
              <MailCheckIcon className="size-4 shrink-0 text-primary" />
              <span>
                Sent to <span className="font-medium">{state.email}</span>
              </span>
            </div>
          ) : (
            <form action={action} className="w-full space-y-3">
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <InputGroup className="h-14 rounded-full px-2 shadow-soft">
                <InputGroupInput
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="text-base"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="submit"
                    disabled={pending}
                    variant="default"
                    aria-label="Send sign-in link"
                    className="size-10 rounded-full active:scale-95"
                  >
                    {pending ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <ArrowRightIcon className="size-4" />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>

              {state.status === 'error' && (
                <div className="flex items-center justify-center gap-1.5 text-sm text-destructive">
                  <AlertCircleIcon className="size-4 shrink-0" />
                  <span>{state.message}</span>
                </div>
              )}
            </form>
          )}
        </FadeIn>
      </div>
    </div>
  );
}
