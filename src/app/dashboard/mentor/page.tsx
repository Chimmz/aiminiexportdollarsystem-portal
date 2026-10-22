import { Suspense } from "react";
import { MentorChatClient } from "./mentor-chat-client";

// Just the UI — no model, no API route, no Supabase. Dummy seed messages and
// a fake reply-on-a-timer to get the look and feel right before any of that
// exists. Server wrapper only here to satisfy useSearchParams' Suspense
// requirement in the client component below.
export default function MentorPage() {
  return (
    <Suspense>
      <MentorChatClient />
    </Suspense>
  );
}
