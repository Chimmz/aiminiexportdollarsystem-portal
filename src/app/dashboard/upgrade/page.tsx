import { Suspense } from 'react';
import { requireCurrentUser } from '@/lib/actions/user-actions';
import { UpgradePageClient } from './upgrade-page-client';

export default async function UpgradePage() {
  const { accessStatus } = await requireCurrentUser();

  // Suspense boundary for UpgradePageClient's useSearchParams (reads
  // ?from=mentor -- see access-limit-bar.tsx) -- same reasoning as the
  // mentor page's own wrapper in mentor/page.tsx.
  return (
    <Suspense>
      <UpgradePageClient accessStatus={accessStatus} />
    </Suspense>
  );
}
