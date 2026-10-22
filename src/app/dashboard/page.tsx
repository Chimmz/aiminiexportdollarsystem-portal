import { requireCurrentUser } from '@/lib/actions/user-actions';
import { DashboardHomeClient } from './dashboard-home-client';

export default async function DashboardHomePage() {
  const { user, accessStatus, onboarding } = await requireCurrentUser();

  return (
    <DashboardHomeClient
      user={user}
      accessStatus={accessStatus}
      onboarding={onboarding}
    />
  );
}
