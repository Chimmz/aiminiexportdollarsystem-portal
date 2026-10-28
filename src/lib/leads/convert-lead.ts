import { createServiceClient } from "@/lib/supabase/service";
import { createAccessPeriodForPayment } from "@/lib/actions/access-actions";

// Runs once per sign-in, right after the magic-link callback establishes a
// session — looks for a lead matching this email (written by the separate
// mini-export-web sales site, which only ever writes leads/payments and
// never has a real user to attach them to) and, if found:
//   1. Links it to this real user and marks it 'converted', so nurture
//      emails stop going to someone who's already in.
//   2. Creates an access_period for every successful payment on that lead
//      that doesn't have one yet, and backfills payments.user_id. Runs on
//      every sign-in (not just the first), which is also how a later
//      repeat purchase while already a member gets picked up — it doesn't
//      depend on funnel_stage, only on unlinked successful payments
//      existing.
// createAccessPeriodForPayment (access-actions.ts) decides unactivated vs.
// activate-immediately per payment — a first-ever purchase before this
// user has ever activated stays unactivated until their first mentor
// message, but a repeat purchase made while already activated (e.g. they
// bought a second plan on the sales site while mid-membership) chains onto
// their current period right away instead of silently never activating,
// since activated_at is already set and nothing would otherwise flip it
// again.
export async function convertLeadForUser(userId: string, email: string) {
  const supabase = createServiceClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, converted_user_id")
    .ilike("email", email)
    .maybeSingle();

  if (!lead) return;

  if (!lead.converted_user_id) {
    await supabase
      .from("leads")
      .update({ converted_user_id: userId, funnel_stage: "converted" })
      .eq("id", lead.id);
  }

  const { data: unlinkedPayments } = await supabase
    .from("payments")
    .select("id, plan_id")
    .eq("lead_id", lead.id)
    .eq("status", "success")
    .is("user_id", null)
    .order("paid_at", { ascending: true });

  if (!unlinkedPayments || unlinkedPayments.length === 0) return;

  const { data: plans } = await supabase
    .from("plans")
    .select("id, duration_days, grants_ai_access");
  const planById = new Map((plans ?? []).map((plan) => [plan.id, plan]));

  for (const payment of unlinkedPayments) {
    const plan = planById.get(payment.plan_id);
    // Plan was removed/renamed since purchase (shouldn't happen, but skip
    // rather than guess a duration), or it's a base-product purchase (e.g.
    // 'pdf-guide') that was never meant to grant AI access in the first
    // place — see migrations/0015's grants_ai_access.
    if (!plan || !plan.grants_ai_access) continue;

    await supabase.from("payments").update({ user_id: userId }).eq("id", payment.id);
    await createAccessPeriodForPayment({
      userId,
      paymentId: payment.id,
      durationDays: plan.duration_days,
    });
  }
}
