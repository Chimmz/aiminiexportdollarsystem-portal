"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type SendMagicLinkState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent"; email: string; alreadySent?: boolean };

export async function sendMagicLink(
  _prevState: SendMagicLinkState,
  formData: FormData
): Promise<SendMagicLinkState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { status: "error", message: "Enter your email." };
  }

  // Derived from the actual request, not NEXT_PUBLIC_SITE_URL — dev's port
  // shifts (3000/3001/3002...) whenever something else is squatting the
  // default, and a mismatched redirect URL gets this call rejected by
  // Supabase's redirect-URL allow-list before it ever sends anything.
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    // Not a failure — Supabase throttles resends per email address (default
    // 60s), independent of how long the link itself stays valid. A link is
    // already sitting in their inbox from the last request.
    if (error.code === "over_email_send_rate_limit") {
      return { status: "sent", email, alreadySent: true };
    }

    console.error("signInWithOtp failed:", error);
    return { status: "error", message: "Couldn't send the link. Try again in a moment." };
  }

  return { status: "sent", email };
}
