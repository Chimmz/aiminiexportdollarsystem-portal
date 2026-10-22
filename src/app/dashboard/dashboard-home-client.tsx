'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2Icon,
  CircleIcon,
  DownloadIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  XIcon,
} from 'lucide-react';
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
import { Progress } from '@/components/ui/progress';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { resources } from '@/lib/mock-data/resources';
import { FadeIn, HoverLift } from '@/components/motion/fade-in';
import { AISparkle } from '@/components/ui/ai-sparkle';
import { cn } from '@/lib/utils';
import type {
  AccessStatus,
  CurrentUser,
  OnboardingSignals,
} from '@/lib/utils/user-utils';

// The chat/mentor itself isn't built yet, so the recent-conversation
// preview and suggestion prompts below are still presentational mock data
// — the buyer identity, plan/trial status, and onboarding checkmarks above
// them are real, pulled via the DAL in page.tsx.

const mockRecentConversation = {
  preview:
    '...so for a 20ft container of dried hibiscus, quote in USD per kg and let the buyer handle freight from the port...',
  updatedAt: 'Yesterday, 4:12 PM',
};

const mockSuggestions = [
  'What should I quote a buyer in dollars?',
  'How do I verify a buyer is real before shipping?',
  'Draft a follow-up email for a slow-paying buyer',
];

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

function planBadgeLabel(status: AccessStatus['status']) {
  if (status === 'active') return 'Active plan';
  if (status === 'expired') return 'Access expired';
  return 'Free trial';
}

export function DashboardHomeClient({
  user,
  accessStatus,
  onboarding,
}: {
  user: CurrentUser;
  accessStatus: AccessStatus;
  onboarding: OnboardingSignals;
}) {
  const router = useRouter();
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);

  const handleSuggestionClick = (suggestion: string) => {
    router.push(`/dashboard/mentor?prompt=${encodeURIComponent(suggestion)}`);
  };

  const displayName = displayNameFor(user);
  const initials = initialsFor(user);

  return (
    <div className="space-y-12 px-8 py-14">
      {!announcementDismissed && (
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
      )}

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
              <p className="font-medium">{displayName}</p>
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
                {planBadgeLabel(accessStatus.status)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {accessStatus.status === 'trial' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {accessStatus.trialMessagesUsed} of {accessStatus.trialMessagesLimit}{' '}
                    free messages used
                  </span>
                </div>
                <Progress
                  value={
                    (accessStatus.trialMessagesUsed / accessStatus.trialMessagesLimit) *
                    100
                  }
                />
              </div>
            )}

            <Suggestions>
              {mockSuggestions.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  suggestion={suggestion}
                  onClick={handleSuggestionClick}
                />
              ))}
            </Suggestions>
          </CardContent>
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

      <FadeIn
        delay={0.15}
        className={cn('grid gap-6', onboarding.hasSentFirstMessage && 'sm:grid-cols-2')}
      >
        {onboarding.hasSentFirstMessage && (
          <HoverLift>
            <Card className="bg-gradient-to-br from-background-subtle to-background">
              <CardHeader>
                <CardTitle className="text-base">Continue where you left off</CardTitle>
                <CardDescription>{mockRecentConversation.updatedAt}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {mockRecentConversation.preview}
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
              <CardTitle className="text-base">Getting started</CardTitle>
              <CardDescription>A short checklist for your first week.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {[
                  // Neither of these is derivable from anything in the schema
                  // yet — no resource-view/download tracking exists. Always
                  // shown unchecked until that's built.
                  { label: 'Read the main guide', done: false },
                  { label: 'Download your contact lists', done: false },
                  {
                    label: 'Ask Eva your first question',
                    done: onboarding.hasSentFirstMessage,
                  },
                ].map((item) => (
                  <li key={item.label} className="flex items-center gap-2 text-sm">
                    {item.done ? (
                      <CheckCircle2Icon className="size-4 shrink-0 text-primary" />
                    ) : (
                      <CircleIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span
                      className={item.done ? 'text-muted-foreground line-through' : ''}
                    >
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </HoverLift>
      </FadeIn>

      <FadeIn delay={0.2}>
        <HoverLift>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Downloads &amp; resources</CardTitle>
              <CardDescription>
                The guide and bonus contact lists that came with your purchase.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {resources.map((resource) => (
                <div
                  key={resource.id}
                  className="flex items-center justify-between gap-4 rounded-md px-2 py-2 hover:bg-background-subtle"
                >
                  <div>
                    <p className="text-sm font-medium">{resource.title}</p>
                    <p className="text-xs text-muted-foreground">{resource.meta}</p>
                  </div>
                  {/* Placeholder href — point at real file URLs once they exist. */}
                  <Button asChild size="icon-sm" variant="ghost">
                    <a href="#" aria-label={`Download ${resource.title}`}>
                      <DownloadIcon className="size-4" />
                    </a>
                  </Button>
                </div>
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
            href="mailto:support@example.com"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Contact support
          </a>
        </p>
      </FadeIn>
    </div>
  );
}
