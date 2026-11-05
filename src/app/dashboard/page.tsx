import { requireCurrentUser } from '@/lib/actions/user-actions';
import { getMostRecentMessagePreview } from '@/lib/actions/mentor-messages-actions';
import { DashboardHomeClient } from './dashboard-home-client';

export default async function DashboardHomePage() {
  const { user, accessStatus } = await requireCurrentUser();
  const recentMessage = await getMostRecentMessagePreview(user.id);

  return (
    <DashboardHomeClient
      user={user}
      accessStatus={accessStatus}
      recentMessage={recentMessage}
    />
  );
}
