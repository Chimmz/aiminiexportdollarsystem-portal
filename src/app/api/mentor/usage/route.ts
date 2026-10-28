import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/actions/user-actions';
import { getLifetimeTokenUsage, getTokenUsageTimeline } from '@/lib/actions/token-usage-actions';

// Backs the mentor controls rail's Usage section -- both the line-chart
// history (every tier; hourly or daily, see getTokenUsageTimeline) and the
// lifetime trialTokensUsed number the donut renders ('trial' tier only).
// requireCurrentUser() resolves that same lifetime number once, at page
// load, into the accessStatus prop -- this route is what the rail re-hits
// on each 'refresh-usage' push (see mentor-context.tsx) to get a number
// that's still fresh deep into a session, well after that initial server
// render.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  try {
    const [{ granularity, points }, trialTokensUsed] = await Promise.all([
      getTokenUsageTimeline(user.id),
      getLifetimeTokenUsage(user.id),
    ]);
    return NextResponse.json({ history: points, granularity, trialTokensUsed });
  } catch (err) {
    console.error('[mentor] load usage failed:', err);
    return NextResponse.json({ error: 'Failed to load usage' }, { status: 500 });
  }
}
