import Link from 'next/link';
import { CheckCircle2Icon, Clock3Icon, XCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { verifyAndActivatePayment } from '@/lib/actions/payments-actions';
import { paymentSuccessCopy } from '@/lib/utils/plan-utils';

// Where Paystack redirects the browser after checkout (see
// initiatePlanPurchase's callback_url) — Paystack appends ?reference=...
// &trxref=... itself, we don't construct those. The webhook
// (/api/webhooks/paystack) is the reliable path that credits access even
// if the buyer closes the tab before landing here; this page is just the
// faster, user-facing confirmation. Only reached for checkouts NOT started
// from the mentor page's access-limit bar -- those point Paystack straight
// back at /dashboard/mentor instead (see initiatePlanPurchase's returnTo
// and mentor-chat-client.tsx's arrival effect), which verifies itself and
// never routes through here at all.
export default async function UpgradeCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = params.reference ?? params.trxref;

  const result = reference
    ? await verifyAndActivatePayment(reference)
    : { status: 'not_found' as const };

  const successCopy =
    result.status === 'success' ? paymentSuccessCopy(result.planId, result.endsAt) : null;

  // strokeWidth 1.5, not lucide's default 2 -- the default reads heavy at
  // this size, especially on the success checkmark, where it's the whole
  // point of the page and the first thing anyone sees.
  const copy = {
    success: {
      icon: <CheckCircle2Icon className="size-10 text-primary" strokeWidth={1.5} />,
      title: successCopy?.heading ?? "You're upgraded",
      body: successCopy?.body ?? '',
    },
    pending: {
      icon: <Clock3Icon className="size-10 text-accent-gold" strokeWidth={1.5} />,
      title: 'Still confirming your payment',
      body: "This can take a minute. Refresh this page shortly, or check back from the Upgrade page — we'll credit your access automatically once it clears.",
    },
    failed: {
      icon: <XCircleIcon className="size-10 text-destructive" strokeWidth={1.5} />,
      title: "Payment didn't go through",
      body: 'Nothing was charged to your access. You can try again from the Upgrade page.',
    },
    not_found: {
      icon: <XCircleIcon className="size-10 text-destructive" strokeWidth={1.5} />,
      title: 'We could not find that payment',
      body: 'If you completed a checkout, try the Upgrade page again or contact support.',
    },
  }[result.status];

  const isSuccess = result.status === 'success';

  return (
    <div className="relative flex min-h-[60vh] items-center justify-center overflow-hidden px-8 py-14">
      {/* Reward-moment background, success only -- a warm radial wash in
          the brand tokens plus two pulse rings radiating from the icon
          below (the classic "payment confirmed" motif), all pure CSS, no
          image asset. Pending/failed stay plain so the muted tone matches
          what they're actually saying. */}
      {isSuccess && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-radial from-primary/15 via-accent-gold/5 to-transparent"
        />
      )}

      <Card className="relative w-full max-w-md text-center">
        <CardHeader className="items-center space-y-3">
          {/* CardHeader is a CSS grid (see card.tsx), not flex -- its own
              items-center only ever controlled cross-axis (vertical)
              alignment, never this fixed-width block's horizontal
              position. mx-auto is what actually centers it. */}
          <div className="relative mx-auto flex size-10 items-center justify-center">
            {isSuccess && (
              <>
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 animation-duration-[2s]" />
                <span className="absolute -inset-2 animate-ping rounded-full bg-accent-gold/15 [animation-delay:0.3s] animation-duration-[2.4s]" />
              </>
            )}
            <span className="relative animate-in zoom-in-50 duration-500">
              {copy.icon}
            </span>
          </div>
          <CardTitle className="animate-in fade-in slide-in-from-bottom-1 text-lg duration-500">
            {copy.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="animate-in fade-in text-sm text-muted-foreground delay-150 duration-500">
            {copy.body}
          </p>
          <Button asChild className="w-full rounded-full">
            <Link href={isSuccess ? '/dashboard/mentor' : '/dashboard/upgrade'}>
              {isSuccess ? 'Continue with Eva' : 'Back to Upgrade'}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
