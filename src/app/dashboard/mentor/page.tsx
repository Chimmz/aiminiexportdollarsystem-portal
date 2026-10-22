import { Suspense } from "react";
import { getCurrentUser } from "@/lib/actions/user-actions";
import { getCurrentUserFirstName } from "@/lib/utils/user-utils";
import { MentorChatClient } from "./mentor-chat-client";

// Server wrapper only exists for two things: satisfying useSearchParams'
// Suspense requirement in the client component below, and resolving the
// signed-in user's first name once here (cache()'d in getCurrentUser, same
// as the chat route's own lookup) so the empty-state greeting can say "Hi
// <name>" without the client making its own round trip just to find out.
export default async function MentorPage() {
  const user = await getCurrentUser();
  const firstName = getCurrentUserFirstName(user);

  return (
    <Suspense>
      <MentorChatClient firstName={firstName} />
    </Suspense>
  );
}
