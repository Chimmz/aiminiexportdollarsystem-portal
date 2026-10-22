'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { KeyRoundIcon } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { FadeIn, HoverLift } from '@/components/motion/fade-in';
import type { AccessStatus, CurrentUser } from '@/lib/utils/user-utils';

// Profile edits and account actions below are still presentational-only —
// no profile-update or account-deletion server action is wired up yet, so
// they show what will happen instead of actually changing anything. The
// identity and plan data above them, however, is real (see page.tsx).

function displayNameFor(user: CurrentUser) {
  return user.fullName?.trim() || user.email.split('@')[0];
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

function planDescriptionFor(accessStatus: AccessStatus) {
  if (accessStatus.status === 'active') {
    const until = accessStatus.paidAccessUntil
      ? new Date(accessStatus.paidAccessUntil).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null;
    return until ? `You have active access until ${until}.` : 'You have active access.';
  }
  if (accessStatus.status === 'expired') {
    return 'Your access has expired. Upgrade to keep chatting with Eva.';
  }
  return "You're on the free trial. Upgrade to keep chatting once it ends.";
}

function handleComingSoon(action: string) {
  toast(`${action} coming soon`, {
    description: 'This will be wired up once accounts are connected to Supabase.',
  });
}

export function AccountPageClient({
  user,
  accessStatus,
}: {
  user: CurrentUser;
  accessStatus: AccessStatus;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(displayNameFor(user));
  const [email, setEmail] = useState(user.email);

  const handleSave = () => {
    setIsEditing(false);
    handleComingSoon('Saving profile changes');
  };

  return (
    <div className="space-y-12 px-8 py-14">
      <FadeIn className="space-y-2">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Your profile, plan, and account settings.
        </p>
      </FadeIn>

      <FadeIn delay={0.05}>
        <HoverLift>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>{initialsFor(user)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-base">{displayNameFor(user)}</CardTitle>
                    <CardDescription>Member since {memberSinceFor(user)}</CardDescription>
                  </div>
                </div>
                {!isEditing && (
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                    Edit profile
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="account-name">Full name</Label>
                  <Input
                    id="account-name"
                    value={name}
                    disabled={!isEditing}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account-email">Email</Label>
                  <Input
                    id="account-email"
                    type="email"
                    value={email}
                    disabled={!isEditing}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
            {isEditing && (
              <CardFooter className="gap-3">
                <Button size="sm" onClick={handleSave}>
                  Save changes
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(false);
                    setName(displayNameFor(user));
                    setEmail(user.email);
                  }}
                >
                  Cancel
                </Button>
              </CardFooter>
            )}
          </Card>
        </HoverLift>
      </FadeIn>

      <FadeIn delay={0.1}>
        <HoverLift>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-base">Plan &amp; billing</CardTitle>
                <Badge
                  variant={accessStatus.status === 'active' ? 'default' : 'secondary'}
                >
                  {accessStatus.status === 'active'
                    ? 'Active plan'
                    : accessStatus.status === 'expired'
                      ? 'Access expired'
                      : 'Free trial'}
                </Badge>
              </div>
              <CardDescription>{planDescriptionFor(accessStatus)}</CardDescription>
            </CardHeader>
            <CardFooter className="gap-3">
              {accessStatus.status === 'active' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleComingSoon('Managing billing')}
                >
                  Manage billing
                </Button>
              ) : (
                <Button asChild size="sm" className="rounded-full px-5">
                  <Link href="/dashboard/upgrade">Upgrade</Link>
                </Button>
              )}
            </CardFooter>
          </Card>
        </HoverLift>
      </FadeIn>

      <FadeIn delay={0.15}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-md px-2 py-1">
              <div className="flex items-center gap-2 text-sm">
                <KeyRoundIcon className="size-4 shrink-0 text-muted-foreground" />
                <span>Password</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleComingSoon('Changing your password')}
              >
                Change password
              </Button>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.2}>
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Permanently delete your account and all of its data. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardFooter className="pt-(--card-spacing)">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleComingSoon('Deleting your account')}
            >
              Delete account
            </Button>
          </CardFooter>
        </Card>
      </FadeIn>
    </div>
  );
}
