import { Suspense } from "react";
import { getCurrentUser } from "@/lib/actions/user-actions";
import { getCurrentUserFirstName } from "@/lib/utils/user-utils";
import { getMentorMessages } from "@/lib/actions/mentor-messages-actions";
import { MentorChatClient } from "./_components/mentor-chat-client";

// Server wrapper exists for three things now: satisfying useSearchParams'
// Suspense requirement in the client component below, resolving the
// signed-in user's first name once here (cache()'d in getCurrentUser, same
// as the chat route's own lookup) so the empty-state greeting can say "Hi
// <name>" without the client making its own round trip just to find out,
// and loading this user's persisted chat history so useChat starts from
// it instead of an empty conversation on every page load.
export default async function MentorPage() {
  const user = await getCurrentUser();
  const firstName = getCurrentUserFirstName(user);
  const initialMessages = user ? await getMentorMessages(user.id) : [];

  return (
    <Suspense>
      <MentorChatClient firstName={firstName} initialMessages={initialMessages} />
    </Suspense>
  );
}
