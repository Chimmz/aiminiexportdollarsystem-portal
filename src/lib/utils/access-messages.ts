// The exact two blocked-chat messages checkMentorChatLimits (api/mentor/chat/_utils.ts)
// can send back. Pure strings, shared with mentor-chat-client.tsx's access
// bar so the client can recognize which case an error.message is without
// parsing/guessing, and so the two copies can never drift apart.
export const ACCESS_EXPIRED_MESSAGE =
  'Your access has expired. Upgrade to keep chatting with Eva.';
export const TRIAL_BUDGET_EXHAUSTED_MESSAGE =
  "You've used up your free trial with Eva. Upgrade to keep the conversation going.";
