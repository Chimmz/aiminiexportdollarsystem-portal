import { createClient } from "@supabase/supabase-js";

// The secret key (sb_secret_...) bypasses RLS like the old service_role key did.
// Only call this from server-side code (route handlers, server actions) —
// never import it in a client component.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
