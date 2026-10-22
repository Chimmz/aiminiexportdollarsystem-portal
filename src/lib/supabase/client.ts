import { createBrowserClient } from "@supabase/ssr";

// Browser-side client — uses the publishable key, safe to ship to the client.
// Session lives in cookies (not localStorage) so proxy.ts and server
// components can read it too.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  return createBrowserClient(url, key);
}
