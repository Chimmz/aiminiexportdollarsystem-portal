import { requireCurrentUser } from '@/lib/actions/user-actions';
import { UpgradePageClient } from './upgrade-page-client';

export default async function UpgradePage() {
  const { accessStatus } = await requireCurrentUser();

  return <UpgradePageClient accessStatus={accessStatus} />;
}
