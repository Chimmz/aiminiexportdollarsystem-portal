import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
};

export type AccessStatus = {
  status: "trial" | "active" | "expired";
  trialMessagesUsed: number;
  trialMessagesLimit: number;
  paidAccessUntil: string | null;
  // The plan backing whichever access_period is in effect right now (i.e.
  // starts_at <= now() < ends_at), or null if none is. Periods stack and
  // can come from different tiers over time, but exactly one is ever "in
  // effect" at a given moment, so this is well-defined despite that —
  // it's just not the same thing as "the only plan they've ever bought."
  currentPlanId: string | null;
};

export type OnboardingSignals = {
  hasSentFirstMessage: boolean;
};

// Safe to call from a Route Handler, unlike getCurrentUser() below — that
// one calls redirect() on signed-out access, which only works inside the
// Server Component/Server Action rendering boundary. A Route Handler (e.g.
// /api/mentor/chat) has no such boundary to catch it, so this returns null
// instead of redirecting when there's no session or no name set, letting
// the caller degrade gracefully (e.g. skip personalizing a prompt) rather
// than throwing.
export async function getCurrentUserFirstName(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;

  const { data: userRow } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", data.claims.sub)
    .single();

  const fullName = userRow?.full_name?.trim();
  return fullName ? fullName.split(/\s+/)[0] : null;
}

// Same Route-Handler-safe shape as getCurrentUserFirstName (null instead of
// redirect when signed out) -- getClaims() verifies the JWT locally, so
// this is cheap even though it duplicates the call that function already
// makes internally.
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

// proxy.ts already keeps signed-out visitors off /dashboard, but that's an
// optimistic cookie check (see the Next.js auth guide) — this is the real
// check, close to the data, per-request. cache() dedupes repeat calls
// within one render (layout + page both call this) into a single query.
export const getCurrentUser = cache(async (): Promise<{
  user: CurrentUser;
  accessStatus: AccessStatus;
  onboarding: OnboardingSignals;
}> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    redirect("/sign-in");
  }

  const userId = claims.claims.sub;

  const nowIso = new Date().toISOString();

  const [{ data: userRow }, { data: accessRow }, { data: currentPeriod }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, full_name, company_name, created_at, activated_at")
      .eq("id", userId)
      .single(),
    supabase
      .from("user_access_status")
      .select("status, trial_messages_used, trial_messages_limit, paid_access_until")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("access_periods")
      .select("payment:payments(plan_id)")
      .eq("user_id", userId)
      .lte("starts_at", nowIso)
      .gt("ends_at", nowIso)
      .maybeSingle(),
  ]);

  if (!userRow || !accessRow) {
    redirect("/sign-in");
  }

  // supabase-js can't tell this embed is to-one without generated DB types,
  // so it infers `payment` as an array even though the FK direction
  // (access_periods.payment_id -> payments.id) means PostgREST actually
  // returns a single object here at runtime.
  const currentPayment = currentPeriod?.payment as { plan_id: string } | null | undefined;

  return {
    user: {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      companyName: userRow.company_name,
      createdAt: userRow.created_at,
      activatedAt: userRow.activated_at,
    },
    accessStatus: {
      status: accessRow.status,
      trialMessagesUsed: accessRow.trial_messages_used,
      trialMessagesLimit: accessRow.trial_messages_limit,
      paidAccessUntil: accessRow.paid_access_until,
      currentPlanId: currentPayment?.plan_id ?? null,
    },
    onboarding: {
      hasSentFirstMessage: Boolean(userRow.activated_at),
    },
  };
});
