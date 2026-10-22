import { redirect } from 'next/navigation';

// / has no content of its own — it just forwards into the app. proxy.ts's
// existing /dashboard guard takes it from there: signed in -> dashboard,
// signed out -> bounced on to /sign-in.
export default function RootPage() {
  redirect('/dashboard');
}
