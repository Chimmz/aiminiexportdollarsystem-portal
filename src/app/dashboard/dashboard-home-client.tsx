'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon, MegaphoneIcon, MessageCircleIcon } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { UsageDonut } from '@/components/charts/usage-donut';
import { UsageLineChart } from '@/components/charts/usage-line-chart';
import { resources } from '@/lib/mock-data/resources';
import { FadeIn, HoverLift } from '@/components/motion/fade-in';
import { AISparkle } from '@/components/ui/ai-sparkle';
import { formatRecentTimestamp } from '@/lib/utils/date-utils';
import { planBadgeLabel } from '@/lib/utils/plan-utils';
import { cn } from '@/lib/utils';
import type { AccessStatus, CurrentUser } from '@/lib/utils/user-utils';

const faqItems = [
  {
    question: 'What happens when my free trial ends?',
    answer:
      "Your chat stays visible, but new messages pause until you upgrade. Nothing you've already discussed with Eva is lost.",
  },
  {
    question: 'How does Eva know about my product and buyers?',
    answer:
      'Eva is trained on 3 years of real export-mentoring sessions. She guides and drafts for you, she does not place orders, move money, or contact buyers on your behalf.',
  },
  {
    question: 'Can I switch plans later?',
    answer:
      'Yes. You can move between the 30-day, 3-month, and 6-month plans at any time from the upgrade page.',
  },
];

function displayNameFor(user: CurrentUser) {
  return user.fullName?.trim() || user.email.split('@')[0];
}

function firstNameFor(user: CurrentUser) {
  return displayNameFor(user).split(' ')[0];
}

function initialsFor(user: CurrentUser) {
  return displayNameFor(user)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function memberSinceFor(user: CurrentUser) {
  return new Date(user.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

export function DashboardHomeClient({
  user,
  accessStatus,
  recentMessage,
}: {
  user: CurrentUser;
  accessStatus: AccessStatus;
  recentMessage: { text: string; createdAt: string } | null;
}) {
  // const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [usage, setUsage] = useState<{
    history: { date: string; tokens: number }[];
    granularity: 'hour' | 'day';
  } | null>(null);

  // Same /api/mentor/usage route the mentor controls rail already fetches
  // for its own usage section (see mentor-controls-rail.tsx) -- reused
  // here rather than a second endpoint, since the underlying data (the
  // adaptive hour/day token_usage timeline -- see getTokenUsageTimeline)
  // is identical regardless of which page asks for it. The lifetime
  // trialTokensUsed field in the same response isn't needed here --
  // accessStatus's own prop already has it, and this page doesn't stay
  // open through a live chat turn the way the rail does, so there's no
  // 'refresh-usage' push to react to, just the one mount fetch.
  useEffect(() => {
    fetch('/api/mentor/usage')
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then(
        (data: {
          history: { date: string; tokens: number }[];
          granularity: 'hour' | 'day';
        }) => setUsage({ history: data.history, granularity: data.granularity })
      )
      .catch((err) => {
        console.error('[dashboard] load usage failed:', err);
        setUsage(null);
      });
  }, []);

  const displayName = displayNameFor(user);
  const initials = initialsFor(user);

  return (
    <div className="space-y-12 px-8 py-14">
      {accessStatus.status === 'trial' && (
        <FadeIn className="flex flex-col items-start gap-3 rounded-lg border border-accent-gold/30 bg-accent-gold/10 p-4 text-base sm:flex-row sm:items-center sm:text-sm">
          {/* Icon + message stay grouped in their own row even while the
              banner as a whole is stacked on mobile -- sm:contents unwraps
              this div at the sm breakpoint so all three children (icon,
              message, link) go back to being direct flex items in one row,
              matching the original desktop layout exactly. */}
          <div className="flex items-start gap-3 sm:contents">
            <MegaphoneIcon className="mt-0.5 size-4 shrink-0 text-accent-gold sm:mt-0" />
            <p className="flex-1 text-foreground">
              Your guide comes with a fast-expiring free trial with your mentor.
            </p>
          </div>
          <Link
            href="/dashboard/upgrade"
            className="shrink-0 font-medium text-primary underline-offset-4 hover:underline"
          >
            Upgrade your AI mentor &rarr;
          </Link>
        </FadeIn>
      )}

      {/* Dont delete this */}
      {/* {!announcementDismissed && (
        <FadeIn className="flex items-start gap-3 rounded-lg border border-accent-gold/30 bg-accent-gold/10 p-4 text-sm">
          <MegaphoneIcon className="mt-0.5 size-4 shrink-0 text-accent-gold" />
          <p className="flex-1 text-foreground">
            Eva now remembers your last conversation, so you can pick up right where you
            left off.
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setAnnouncementDismissed(true)}
            aria-label="Dismiss announcement"
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" />
          </Button>
        </FadeIn>
      )} */}

      <FadeIn delay={0.05} className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Welcome back, {firstNameFor(user)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s where things stand today.
          </p>
        </div>

        <Card className="hidden shrink-0 bg-gradient-to-br from-background-subtle to-background sm:block">
          <CardContent className="flex items-center gap-3 py-3">
            <Avatar>
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="text-sm">
              <p className="font-medium text-center">{displayName}</p>
              <p className="text-xs text-muted-foreground">
                Member since {memberSinceFor(user)}
              </p>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Card className="relative overflow-hidden border-primary/15 bg-radial from-primary/12 via-primary/3 to-transparent shadow-soft">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-1.5 text-xl">
                  Chat with{' '}
                  <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                    Eva
                  </span>
                  <AISparkle size={18} gradient={['#6366f1', '#a855f7', '#ec4899']} />
                </CardTitle>
                <CardDescription>
                  Your AI export mentor, trained on real sourcing and pricing sessions.
                </CardDescription>
              </div>
              <Badge variant={accessStatus.status === 'trial' ? 'secondary' : 'default'}>
                {planBadgeLabel(accessStatus)}
              </Badge>
            </div>
          </CardHeader>
          {accessStatus.status === 'trial' && (
            <CardContent>
              <UsageDonut
                value={accessStatus.trialTokensUsed}
                max={accessStatus.trialTokenBudget}
                label="of your free trial used"
              />
            </CardContent>
          )}
          <CardFooter className="gap-3">
            <Button
              asChild
              className="rounded-full px-6 active:scale-95 transition-transform"
            >
              <Link href="/dashboard/mentor">
                <MessageCircleIcon className="size-4" />
                Open chat
              </Link>
            </Button>
            {accessStatus.status !== 'active' && (
              <Button asChild variant="outline" className="rounded-full px-6">
                <Link href="/dashboard/upgrade">Upgrade</Link>
              </Button>
            )}
          </CardFooter>
        </Card>
      </FadeIn>

      {usage && usage.history.some((point) => point.tokens > 0) && (
        <FadeIn delay={0.13}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usage</CardTitle>
              <CardDescription>
                Tokens spent talking with Eva,{' '}
                {usage.granularity === 'hour' ? 'by the hour today' : 'last 14 days'}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UsageLineChart
                data={usage.history}
                granularity={usage.granularity}
                className="h-56 sm:h-64"
              />
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <FadeIn
        delay={0.15}
        className={cn('grid gap-6', recentMessage && 'sm:grid-cols-2')}
      >
        {recentMessage && (
          <HoverLift>
            <Card className="bg-gradient-to-br from-background-subtle to-background">
              <CardHeader>
                <CardTitle className="text-base">Continue where you left off</CardTitle>
                <CardDescription>
                  {formatRecentTimestamp(recentMessage.createdAt)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 text-sm text-muted-foreground italic">
                  {recentMessage.text}
                </p>
              </CardContent>
              <CardFooter>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/mentor">Resume conversation</Link>
                </Button>
              </CardFooter>
            </Card>
          </HoverLift>
        )}

        <HoverLift>
          <Card className="bg-gradient-to-br from-background-subtle to-background">
            <CardHeader>
              <CardTitle className="text-base">Quick links</CardTitle>
              <CardDescription>
                Everything from your purchase, in one place.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <Link
                href="/dashboard/mentor"
                className="flex items-center justify-between gap-4 rounded-md px-2 py-2 text-sm font-medium hover:bg-background-subtle"
              >
                Chat with your AI mentor
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </Link>
              <Link
                href="/dashboard/resources"
                className="flex items-center justify-between gap-4 rounded-md px-2 py-2 text-sm font-medium hover:bg-background-subtle"
              >
                Grab your bonuses
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        </HoverLift>
      </FadeIn>

      <FadeIn delay={0.2}>
        <HoverLift>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resources</CardTitle>
              <CardDescription>
                The guide and bonus contact lists that came with your purchase.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {resources.map((resource) => (
                <Link
                  key={resource.id}
                  href="/dashboard/resources"
                  className="flex items-center justify-between gap-4 rounded-md px-2 py-2 hover:bg-background-subtle"
                >
                  <div>
                    <p className="text-sm font-medium">{resource.title}</p>
                    <p className="text-xs text-muted-foreground">{resource.meta}</p>
                  </div>
                  <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
            <CardFooter>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/resources">View all resources</Link>
              </Button>
            </CardFooter>
          </Card>
        </HoverLift>
      </FadeIn>

      <FadeIn delay={0.25}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Frequently asked</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {faqItems.map((item, index) => (
                <AccordionItem key={item.question} value={`item-${index}`}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.3} className="text-center">
        <p className="text-sm text-muted-foreground">
          Need help?{' '}
          <a
            href="mailto:chima@aipoweredminiexportdollarsystem.online"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Contact support
          </a>
        </p>
      </FadeIn>
    </div>
  );
}
