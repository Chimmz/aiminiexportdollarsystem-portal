import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/actions/user-actions';
import { getCurrentUserFirstName } from '@/lib/utils/user-utils';
import { IntakeWizard } from './_components/intake-wizard';

// Deliberately a top-level route, not under /dashboard -- dashboard/
// layout.tsx redirects here whenever intakeCompletedAt is unset, so
// living outside that layout is what keeps this page from immediately
// redirecting to itself. proxy.ts already keeps signed-out visitors off
// this path the same way it does /dashboard.
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in');
  }
  if (user.intakeCompletedAt) {
    redirect('/dashboard');
  }

  return <IntakeWizard firstName={getCurrentUserFirstName(user)} />;
}
