import { Suspense } from 'react';
import { requireCurrentUser } from '@/lib/actions/user-actions';
import { getCurrentUserFirstName } from '@/lib/utils/user-utils';
import { getMentorMessages } from '@/lib/actions/mentor-messages-actions';
import { getPriceQuotesByUser } from '@/lib/actions/pricing-actions';
import { getUserMemory } from '@/lib/actions/memory-actions';
import { getProductAndCountryProgress } from '@/lib/utils/journey-utils';
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
// profile facts AND their decide_product/decide_country progress
// (journeyFields) so MentorControlsRail's memory section starts
// populated server-side -- see mentor-chat-client.tsx's useChat
// onFinish, which calls router.refresh() after every turn specifically
// so this re-runs and the rail picks up whatever the chat turn's
// deterministic memory extraction (lib/mentor/memory-extraction.ts) just
// saved. journeyFields used to have no SSR-seeded prop at all and was
// only ever fetched once on the rail's own mount -- which meant a
// freshly-saved product/country never showed up there without a full
// reload, since a router.refresh() re-renders this Server Component but
// doesn't remount MentorControlsRail's already-mounted client instance.
// getUserMemory (not the narrower getProfileFacts) since
// getProductAndCountryProgress needs the export journey progress half of
// it too -- one fetch covers both rather than two separate ones.
export default async function MentorPage() {
  const { user, accessStatus } = await requireCurrentUser();
  const firstName = getCurrentUserFirstName(user);
  const [initialMessages, savedPriceQuotes, userMemory] = await Promise.all([
    getMentorMessages(user.id),
    getPriceQuotesByUser(user.id),
    getUserMemory(user.id),
  ]);

  return (
    <Suspense>
      <MentorChatClient
        firstName={firstName}
        initialMessages={initialMessages}
        accessStatus={accessStatus}
        savedPriceQuotes={savedPriceQuotes}
        initialFacts={userMemory.facts}
        initialJourneyFields={getProductAndCountryProgress(userMemory.exportJourneyProgress)}
      />
    </Suspense>
  );
}
