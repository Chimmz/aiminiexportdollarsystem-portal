import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AccessStatus, CurrentUser, OnboardingSignals } from "@/lib/utils/user-utils";

// The one place that fetches the signed-in user's base profile. Returns
// null instead of redirecting when there's no session, so this is safe to
// call from a Route Handler (e.g. /api/mentor/chat), which has no
// Server Component rendering boundary to redirect from. A Server Component
// that needs to require auth should use requireCurrentUser() below instead
// of handling the null case itself. cache() dedupes repeat calls within
// one render (requireCurrentUser calling this, plus a page and its layout
// both calling either one, all collapse into a single query).
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return null;

  const { data: userRow } = await supabase
    .from("users")
    .select("id, email, full_name, company_name, created_at, activated_at")
    .eq("id", claims.claims.sub)
    .single();
  if (!userRow) return null;

  return {
    id: userRow.id,
    email: userRow.email,
    fullName: userRow.full_name,
    companyName: userRow.company_name,
    createdAt: userRow.created_at,
    activatedAt: userRow.activated_at,
  };
});

// proxy.ts already keeps signed-out visitors off /dashboard, but that's an
// optimistic cookie check (see the Next.js auth guide) — this is the real
// check, close to the data, per-request, for every dashboard page that also
// needs access/onboarding state beyond the base profile getCurrentUser()
// already gives.
export const requireCurrentUser = cache(async (): Promise<{
  user: CurrentUser;
  accessStatus: AccessStatus;
  onboarding: OnboardingSignals;
}> => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [{ data: accessRow }, { data: currentPeriod }] = await Promise.all([
    supabase
      .from("user_access_status")
      .select("status, trial_messages_used, trial_messages_limit, paid_access_until")
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("access_periods")
      .select("payment:payments(plan_id)")
      .eq("user_id", user.id)
      .lte("starts_at", nowIso)
      .gt("ends_at", nowIso)
      .maybeSingle(),
  ]);

  if (!accessRow) {
    redirect("/sign-in");
  }

  // supabase-js can't tell this embed is to-one without generated DB types,
  // so it infers `payment` as an array even though the FK direction
  // (access_periods.payment_id -> payments.id) means PostgREST actually
  // returns a single object here at runtime.
  const currentPayment = currentPeriod?.payment as { plan_id: string } | null | undefined;

  return {
    user,
    accessStatus: {
      status: accessRow.status,
      trialMessagesUsed: accessRow.trial_messages_used,
      trialMessagesLimit: accessRow.trial_messages_limit,
      paidAccessUntil: accessRow.paid_access_until,
      currentPlanId: currentPayment?.plan_id ?? null,
    },
    onboarding: {
      hasSentFirstMessage: Boolean(user.activatedAt),
    },
  };
});
