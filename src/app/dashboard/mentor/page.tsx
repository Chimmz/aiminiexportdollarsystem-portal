import { Suspense } from 'react';
import { requireCurrentUser } from '@/lib/actions/user-actions';
import { getCurrentUserFirstName } from '@/lib/utils/user-utils';
import { getMentorMessages } from '@/lib/actions/mentor-messages-actions';
import { getPriceQuotesByUser } from '@/lib/actions/pricing-actions';
import { getProfileFacts } from '@/lib/actions/memory-actions';
import { MentorChatClient } from './_components/mentor-chat-client';

// Server wrapper exists for six things now: satisfying useSearchParams'
// Suspense requirement in the client component below, resolving the
// signed-in user's first name once here (cache()'d in requireCurrentUser,
// same as the chat route's own getCurrentUser lookup) so the empty-state
// greeting can say "Hi <name>" without the client making its own round
// trip just to find out, loading this user's persisted chat history so
// useChat starts from it instead of an empty conversation on every page
// load, resolving accessStatus so the client can show the access-limit bar
// immediately for an already-expired user, before they even try to send a
// message, loading this user's already-saved price quotes keyed by tool
// call id so a persisted 'tool-calculatePricing' message whose calculator
// was already finished renders that saved result instead of a blank
// calculator again (see conversation-messages.tsx and
// pricing-actions.ts's getPriceQuotesByUser), and loading their current
// profile facts so MentorControlsRail's memory list starts populated
// server-side -- see mentor-chat-client.tsx's useChat onFinish, which
// calls router.refresh() after every turn specifically so this re-runs
// and the rail picks up whatever the chat turn's deterministic memory
// extraction (lib/mentor/memory-extraction.ts) just saved.
export default async function MentorPage() {
  const { user, accessStatus } = await requireCurrentUser();
  const firstName = getCurrentUserFirstName(user);
  const [initialMessages, savedPriceQuotes, initialFacts] = await Promise.all([
    getMentorMessages(user.id),
    getPriceQuotesByUser(user.id),
    getProfileFacts(user.id),
  ]);

  return (
    <Suspense>
      <MentorChatClient
        firstName={firstName}
        initialMessages={initialMessages}
        accessStatus={accessStatus}
        savedPriceQuotes={savedPriceQuotes}
        initialFacts={initialFacts}
      />
    </Suspense>
  );
}
