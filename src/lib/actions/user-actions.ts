import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getLifetimeTokenUsage } from "@/lib/actions/token-usage-actions";
import { TRIAL_TOKEN_BUDGET } from "@/lib/mentor/limits";
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
    .select("id, email, full_name, company_name, created_at, activated_at, role")
    .eq("id", claims.claims.sub)
    .single();

  if (userRow) {
    return {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      companyName: userRow.company_name,
      createdAt: userRow.created_at,
      activatedAt: userRow.activated_at,
      role: userRow.role as CurrentUser["role"],
    };
  }

  // Self-heal: a valid session with no matching `users` row means the
  // on_auth_user_created trigger (schema_app.sql) either hasn't landed
  // yet or didn't fire for this signup (see migrations/0028's own
  // comment for how that was already caught once). Returning null here
  // would read as "signed out" to every caller -- including proxy.ts,
  // whose own "bounce signed-in visitors off /sign-in" check would then
  // fight requireCurrentUser's "no users row, back to /sign-in" redirect
  // forever. Inserting the row ourselves with exactly what the trigger
  // would have, then proceeding, turns that failure mode into a one-time
  // self-correction instead of a stuck account. Service role, since
  // there's deliberately no INSERT policy on `users` for the regular
  // client (self-registration only ever happens via the trigger).
  const email = claims.claims.email as string | undefined;
  if (!email) return null;

  const service = createServiceClient();
  const { data: healedRow, error: healError } = await service
    .from("users")
    .upsert({ id: claims.claims.sub, email }, { onConflict: "id" })
    .select("id, email, full_name, company_name, created_at, activated_at, role")
    .single();

  if (healError || !healedRow) {
    console.error("[auth] self-heal insert for missing users row failed:", healError?.message);
    return null;
  }

  return {
    id: healedRow.id,
    email: healedRow.email,
    fullName: healedRow.full_name,
    companyName: healedRow.company_name,
    createdAt: healedRow.created_at,
    activatedAt: healedRow.activated_at,
    role: healedRow.role as CurrentUser["role"],
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

  const [{ data: accessRow }, { data: currentPeriod }, { data: recentPayment }, trialTokensUsed] =
    await Promise.all([
      supabase
        .from("user_access_status")
        .select("status, paid_access_until")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("access_periods")
        .select("payment:payments(plan_id)")
        .eq("user_id", user.id)
        .lte("starts_at", nowIso)
        .gt("ends_at", nowIso)
        .maybeSingle(),
      supabase
        .from("payments")
        .select("plan_id")
        .eq("user_id", user.id)
        .eq("status", "success")
        .order("paid_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getLifetimeTokenUsage(user.id),
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
      paidAccessUntil: accessRow.paid_access_until,
      currentPlanId: currentPayment?.plan_id ?? null,
      recentPaymentPlanId: recentPayment?.plan_id ?? null,
      trialTokensUsed,
      trialTokenBudget: TRIAL_TOKEN_BUDGET,
    },
    onboarding: {
      hasSentFirstMessage: Boolean(user.activatedAt),
    },
  };
});

// Lightweight access-tier lookup for a server route that already knows
// its signed-in user's id (e.g. /api/mentor/chat) -- unlike
// requireCurrentUser above, this never redirects (a Route Handler has no
// Server Component boundary to redirect from) and only fetches the one
// column /api/mentor/chat's token-budget/rate-limit checks actually key
// on, not the full AccessStatus shape. Service-role, not the cookie-bound
// client -- same reasoning as memory-actions.ts. Defaults to "expired"
// when no user_access_status row exists at all: an unrecognized state
// should never read as "allowed," the same safe-by-default posture as
// leads/kb_chunks' zero-policy RLS.
export async function getUserAccessTier(userId: string): Promise<AccessStatus["status"]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("user_access_status")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.status as AccessStatus["status"] | undefined) ?? "expired";
}
