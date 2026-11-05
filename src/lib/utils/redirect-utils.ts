// Guards the "next" path carried through sign-in (proxy.ts sets it when
// bouncing a signed-out visitor off /dashboard/*, sign-in/actions.ts
// threads it into the magic link's emailRedirectTo, auth/callback/
// route.ts reads it back once the link is clicked) against an open
// redirect: a crafted link with next=https://evil.com, or the
// protocol-relative next=//evil.com (browsers treat that as external
// too), must never be followed just because it round-tripped through our
// own sign-in flow. Only a same-origin, absolute path is safe.
export function safeRedirectPath(next: string | null | undefined, fallback: string): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return fallback;
}
