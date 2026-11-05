import { Suspense } from 'react';
import { requireCurrentUser } from '@/lib/actions/user-actions';
import { getActivePlans } from '@/lib/actions/plans-actions';
import { UpgradePageClient } from './upgrade-page-client';

export default async function UpgradePage() {
  const [{ accessStatus }, plans] = await Promise.all([requireCurrentUser(), getActivePlans()]);

  // Suspense boundary for UpgradePageClient's useSearchParams (reads
  // ?from=mentor -- see access-limit-bar.tsx) -- same reasoning as the
  // mentor page's own wrapper in mentor/page.tsx.
  return (
    <Suspense>
      <UpgradePageClient accessStatus={accessStatus} plans={plans} />
    </Suspense>
  );
}
