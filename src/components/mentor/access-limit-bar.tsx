import Link from 'next/link';
import { AlertTriangleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Sits directly above MentorPromptInput (see mentor-chat-client.tsx, which
// wraps the two together in a `relative` div so this can anchor via
// `absolute bottom-full`) instead of a one-off toast -- a toast disappears
// on its own and this condition doesn't: the user can't send another
// message until they upgrade, so the reminder needs to stay up, not fade.
export function AccessLimitBar({ message }: { message: string }) {
  return (
    <div className="absolute inset-x-0 bottom-full z-10 mb-2 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-soft">
      <div className="flex items-center gap-2 text-sm text-amber-900">
        <AlertTriangleIcon className="size-4 shrink-0 text-amber-500" />
        <span>{message}</span>
      </div>
      <Button asChild size="sm" className="shrink-0 rounded-full">
        {/* ?from=mentor: read by upgrade-page-client.tsx and threaded
            through to initiatePlanPurchase so Paystack's callback_url
            points back at the mentor page instead of the generic Upgrade
            callback page -- see mentor-chat-client.tsx's arrival effect. */}
        <Link href="/dashboard/upgrade?from=mentor">Upgrade</Link>
      </Button>
    </div>
  );
}
