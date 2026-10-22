import { createServiceClient } from "@/lib/supabase/service";

// Runs once per sign-in, right after the magic-link callback establishes a
// session — looks for a lead matching this email (written by the separate
// mini-export-web sales site, which only ever writes leads/payments and
// never has a real user to attach them to) and, if found:
//   1. Links it to this real user and marks it 'converted', so nurture
//      emails stop going to someone who's already in.
//   2. Creates an *unactivated* access_period for every successful payment
//      on that lead that doesn't have one yet, and backfills
//      payments.user_id. Runs on every sign-in (not just the first), which
//      is also how a later repeat purchase while already a member gets
//      picked up — it doesn't depend on funnel_stage, only on unlinked
//      successful payments existing.
// Activation (setting starts_at/ends_at, chaining periods back-to-back) is
// deliberately NOT done here — that happens the first time this user sends
// a mentor message, which doesn't exist yet. This function only ever
// creates unactivated periods; see access_periods' comments in
// supabase/schema_app.sql for the full activation algorithm.
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

  const { data: plans } = await supabase.from("plans").select("id, duration_days");
  const durationByPlanId = new Map((plans ?? []).map((plan) => [plan.id, plan.duration_days]));

  for (const payment of unlinkedPayments) {
    const durationDays = durationByPlanId.get(payment.plan_id);
    // Plan was removed/renamed since purchase — shouldn't happen, but skip
    // rather than guess a duration.
    if (!durationDays) continue;

    await supabase.from("payments").update({ user_id: userId }).eq("id", payment.id);
    await supabase.from("access_periods").insert({
      user_id: userId,
      payment_id: payment.id,
      duration_days: durationDays,
    });
  }
}
