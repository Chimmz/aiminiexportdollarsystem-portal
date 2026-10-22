import { requireCurrentUser } from '@/lib/actions/user-actions';
import { AccountPageClient } from './account-page-client';

export default async function AccountPage() {
  const { user, accessStatus } = await requireCurrentUser();

  return <AccountPageClient user={user} accessStatus={accessStatus} />;
}
