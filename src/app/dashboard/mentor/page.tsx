import { Suspense } from "react";
import { requireCurrentUser } from "@/lib/actions/user-actions";
import { getCurrentUserFirstName } from "@/lib/utils/user-utils";
import { getMentorMessages } from "@/lib/actions/mentor-messages-actions";
import { MentorChatClient } from "./_components/mentor-chat-client";

// Server wrapper exists for four things now: satisfying useSearchParams'
// Suspense requirement in the client component below, resolving the
// signed-in user's first name once here (cache()'d in requireCurrentUser,
// same as the chat route's own getCurrentUser lookup) so the empty-state
// greeting can say "Hi <name>" without the client making its own round
// trip just to find out, loading this user's persisted chat history so
// useChat starts from it instead of an empty conversation on every page
// load, and resolving accessStatus so the client can show the access-limit
// bar immediately for an already-expired user, before they even try to
// send a message.
export default async function MentorPage() {
  const { user, accessStatus } = await requireCurrentUser();
  const firstName = getCurrentUserFirstName(user);
  const initialMessages = await getMentorMessages(user.id);

  return (
    <Suspense>
      <MentorChatClient
        firstName={firstName}
        initialMessages={initialMessages}
        accessStatus={accessStatus}
      />
    </Suspense>
  );
}
