export type UserRole = 'user' | 'staff' | 'admin';

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  companyName: string | null;
  createdAt: string;
  // Set the first time this user sends a mentor message (see
  // supabase/schema_app.sql) — doubles as "has this person used the AI at
  // least once," since nothing else in the schema tracks that yet.
  activatedAt: string | null;
  // See migrations/0027_users_role.sql -- 'user' for everyone except the
  // handful of internal accounts explicitly promoted in the DB.
  role: UserRole;
};

export type AccessStatus = {
  status: "trial" | "active" | "expired";
  paidAccessUntil: string | null;
  // The plan backing whichever access_period is in effect right now (i.e.
  // starts_at <= now() < ends_at), or null if none is. Periods stack and
  // can come from different tiers over time, but exactly one is ever "in
  // effect" at a given moment, so this is well-defined despite that —
  // it's just not the same thing as "the only plan they've ever bought."
  currentPlanId: string | null;
  // The plan_id of this user's most recent successful payment, regardless
  // of whether it ever granted AI access (so this can be 'pdf-guide',
  // unlike currentPlanId above, which only ever reflects an AI-access
  // plan). Lets the dashboard tell apart someone who's never paid for
  // anything from someone who bought the guide but hasn't upgraded to an
  // AI plan yet -- both are status 'trial', but only the latter should
  // read as "Free plan" instead of "Free trial".
  recentPaymentPlanId: string | null;
  // Real, provider-reported lifetime token usage (token_usage table) and
  // the lifetime budget it's measured against (TRIAL_TOKEN_BUDGET, see
  // lib/mentor/limits.ts) -- replaces the old message-count-based
  // trialMessagesUsed/trialMessagesLimit (dropped in migrations/0014,
  // since nothing ever wrote to them). Drives the trial-usage donut on
  // the dashboard home card; meaningless once status isn't 'trial' but
  // populated regardless rather than made nullable, since it's cheap and
  // a caller checking status first is simpler than one unwrapping null.
  trialTokensUsed: number;
  trialTokenBudget: number;
};

export type OnboardingSignals = {
  hasSentFirstMessage: boolean;
};

// A derivation, not a fetch — pass in whatever getCurrentUser() (or
// requireCurrentUser()'s `user`) returned rather than hitting the database
// again just for a name. The fetchers themselves live in
// lib/actions/user-actions.ts, not here — this file is just shapes and
// pure derivations over them.
export function getCurrentUserFirstName(user: CurrentUser | null): string | null {
  const fullName = user?.fullName?.trim();
  return fullName ? fullName.split(/\s+/)[0] : null;
}
