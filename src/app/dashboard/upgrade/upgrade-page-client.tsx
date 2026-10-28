'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { FadeIn, HoverLift } from '@/components/motion/fade-in';
import { formatNaira } from '@/components/ui/naira-sign';
import { initiatePlanPurchase } from '@/lib/actions/payments-actions';
import type { AccessStatus } from '@/lib/utils/user-utils';

// "Current plan" highlighting is driven by accessStatus.currentPlanId — the
// plan backing whichever access_period is in effect right this moment (see
// lib/utils/user-utils.ts). Periods stack and can come from different
// tiers over time, but exactly one is ever in effect at once, so there's
// always a single well-defined "current" tier to highlight (or none, on
// trial/expired).

const tiers = [
  {
    id: '30-day',
    label: '30 Days',
    price: '₦9,500',
    perMonth: null as string | null,
    bestValue: false,
  },
  {
    id: '3-month',
    label: '3 Months',
    price: '₦23,000',
    perMonth: 'about ₦7,667 a month',
    bestValue: true,
  },
  {
    id: '6-month',
    label: '6 Months',
    price: '₦35,000',
    perMonth: 'about ₦5,833 a month',
    bestValue: false,
  },
];

const billingFaq = [
  {
    question: 'When does my paid access period start?',
    answer:
      "The moment you first open the full mentor after upgrading, not the moment you pay. So there's no rush to use it the same day.",
  },
  {
    question: 'Can I switch plans later?',
    answer:
      'Yes. You can move between the 30-day, 3-month, and 6-month plans at any time from this page.',
  },
  {
    question: 'Is this refundable?',
    answer:
      "No, plans are prepaid and non-refundable. That's why every plan still includes the free trial first, so you can see how Eva talks before you pay.",
  },
];


function headerCopyFor(status: AccessStatus['status']) {
  if (status === 'active') {
    return {
      eyebrow: "You're all set",
      heading: 'Add more time to your access',
      body: 'Buying another plan adds its time on top of what you already have — no need to wait for it to run out.',
    };
  }
  if (status === 'expired') {
    return {
      eyebrow: 'Your trial has ended',
      heading: 'Pick a plan to continue',
      body: 'Same Eva, without the free-session limit. Pick whichever period matches how long you expect to be actively sourcing and negotiating.',
    };
  }
  return {
    eyebrow: 'Before your free trial ends',
    heading: 'Upgrade your AI mentor',
    body: 'Same Eva, without the free-session limit. Pick whichever period matches how long you expect to be actively sourcing and negotiating.',
  };
}

export function UpgradePageClient({ accessStatus }: { accessStatus: AccessStatus }) {
  const header = headerCopyFor(accessStatus.status);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  // Set only when this page was reached via the mentor page's access-limit
  // bar (see access-limit-bar.tsx's ?from=mentor) -- threaded through to
  // initiatePlanPurchase so Paystack redirects straight back to the
  // mentor page instead of the generic Upgrade callback page.
  const returnTo = useSearchParams().get('from') === 'mentor' ? 'mentor' : undefined;

  async function handleUpgradeClick(planId: string) {
    setPendingPlanId(planId);
    const result = await initiatePlanPurchase(planId, returnTo);
    if ('error' in result) {
      setPendingPlanId(null);
      toast('Could not start checkout', { description: result.error });
      return;
    }
    window.location.assign(result.authorizationUrl);
  }

  return (
    <div className="space-y-12 px-8 py-14">
      <FadeIn className="space-y-2 text-center">
        <p className="text-sm font-medium text-accent-gold">{header.eyebrow}</p>
        <h1 className="text-2xl font-semibold">{header.heading}</h1>
        <p className="mx-auto max-w-prose text-sm text-muted-foreground">{header.body}</p>
      </FadeIn>

      <div className="grid gap-6 sm:grid-cols-3">
        {tiers.map((tier, index) => {
          const isCurrent = tier.id === accessStatus.currentPlanId;

          return (
            <FadeIn key={tier.id} delay={0.05 + index * 0.05} className="flex h-full">
              <HoverLift className="relative flex h-full w-full">
                {tier.bestValue && (
                  <Badge className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 bg-none bg-accent-gold text-white">
                    Recommended
                  </Badge>
                )}
                <Card
                  className={cn(
                    'h-full w-full',
                    isCurrent && 'ring-2 ring-primary',
                    tier.bestValue
                      ? 'border-primary/20 bg-gradient-to-br from-primary/15 via-accent-gold/8 to-primary/5 shadow-lg'
                      : 'shadow-soft'
                  )}
                >
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base whitespace-nowrap">
                        {tier.label}
                      </CardTitle>
                      {isCurrent && <Badge variant="secondary">Current plan</Badge>}
                    </div>
                    <div className="pt-2">
                      <span className="font-alt text-xl font-semibold">
                        {formatNaira(tier.price)}
                      </span>
                    </div>
                    {tier.perMonth && (
                      <CardDescription>{formatNaira(tier.perMonth)}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="mb-auto">
                    <div className="flex items-start gap-2 text-sm">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>Full mentor, without the free-session limit</span>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full rounded-full active:scale-95 transition-transform"
                      variant={tier.bestValue ? 'default' : 'outline'}
                      disabled={isCurrent || pendingPlanId !== null}
                      onClick={() => handleUpgradeClick(tier.id)}
                    >
                      {pendingPlanId === tier.id && (
                        <Loader2Icon className="size-4 animate-spin" />
                      )}
                      {isCurrent
                        ? 'Current plan'
                        : pendingPlanId === tier.id
                          ? 'Starting checkout…'
                          : `Get ${tier.label.toLowerCase()}`}
                    </Button>
                  </CardFooter>
                </Card>
              </HoverLift>
            </FadeIn>
          );
        })}
      </div>

      {accessStatus.status === 'active' && (
        <FadeIn delay={0.18} className="text-center">
          <p className="text-xs text-muted-foreground">
            Your upgraded plan will be added on top of your current plan.
          </p>
        </FadeIn>
      )}

      <FadeIn delay={0.2}>
        <Card className="bg-background-subtle py-0 shadow-none ring-0">
          <CardContent className="px-5 py-5 text-sm text-muted-foreground">
            Prepaid and non-refundable. That&apos;s why you get a free trial first, to see
            how Eva talks before you pay. Your access period starts the first time you use
            the full mentor, not the day you pay.
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.25}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billing questions</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {billingFaq.map((item, index) => (
                <AccordionItem key={item.question} value={`item-${index}`}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
