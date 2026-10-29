import { createServiceClient } from '@/lib/supabase/service';

// Reads/writes the `token_usage` table (see
// supabase/migrations/0012_token_usage.sql). Service-role client, same
// reasoning as memory-actions.ts/mentor-messages-actions.ts -- these only
// ever run from /api/mentor/chat (a server route), never a client bundle.

// One row per turn, straight from the model provider's own reported
// usage (streamText's result.usage -- see route.ts) -- never an
// estimate. Silently skips a non-positive/zero count rather than writing
// a useless row.
export async function recordTokenUsage(userId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('token_usage')
    .insert({ user_id: userId, tokens });
  if (error) throw new Error(`record token usage: ${error.message}`);
}

// The trial budget check -- a lifetime sum, never windowed, since a free
// trial is meant to run out, not refill.
export async function getLifetimeTokenUsage(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('token_usage')
    .select('tokens')
    .eq('user_id', userId);
  if (error) throw new Error(`lifetime token usage: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + row.tokens, 0);
}

// The abuse rate-limit check -- a rolling window, not a fixed one: "the
// last `windowHours` hours from right now," not "since the top of the
// hour." resetAt is derived from the OLDEST row still inside the window --
// once that row ages out, the window's sum drops below it again (absent
// new usage), which is the actual moment the limit lifts. null when the
// window is empty, meaning there's nothing to wait out.
export async function getRollingWindowTokenUsage(
  userId: string,
  windowHours: number
): Promise<{ tokens: number; resetAt: Date | null }> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('token_usage')
    .select('tokens, created_at')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });
  if (error) throw new Error(`rolling window token usage: ${error.message}`);

  const rows = data ?? [];
  const tokens = rows.reduce((sum, row) => sum + row.tokens, 0);
  const resetAt =
    rows.length > 0
      ? new Date(new Date(rows[0].created_at).getTime() + windowHours * 60 * 60 * 1000)
      : null;
  return { tokens, resetAt };
}

export type TokenUsageTimeline = {
  granularity: 'hour' | 'day';
  points: { date: string; tokens: number }[];
};

const HISTORY_DAYS = 14;
// Below this many actual hours of spread, a daily chart would be one
// spike among thirteen empty days -- not a trend. Below this many hour
// buckets, even an hourly chart is too short to read as a line, so the
// window gets padded backward (never forward past the last real row).
const MIN_HOUR_BUCKETS = 6;

// Backs the usage-over-time line chart (mentor controls rail + dashboard
// home). A free trial's whole lifetime budget can burn through in under a
// day -- a fixed 14-point daily chart would be useless for that case, all
// zeros but one spike -- so granularity adapts to how the user's own
// usage is actually spread: all on one calendar date bunches it by hour
// instead; spread across 2+ dates keeps the daily window. Either way,
// every bucket in the returned range is present, zero-filled, oldest
// first -- a chart with gaps where nothing happened reads as broken data,
// not as "no usage."
//
// The window itself starts at whichever is LATER: HISTORY_DAYS ago (an
// established user still gets the normal trailing window, not their
// entire history), or this user's actual first-ever token_usage row.
// Without that second clamp, a user just three days into their trial got
// a 14-day chart padded with eleven flat, empty days before they had ever
// sent a message -- the x-axis should start where their usage actually
// starts, not at a fixed lookback that assumes everyone's been active the
// whole time.
export async function getTokenUsageTimeline(userId: string): Promise<TokenUsageTimeline> {
  const supabase = createServiceClient();

  const { data: earliestRow, error: earliestError } = await supabase
    .from('token_usage')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (earliestError) throw new Error(`earliest token usage: ${earliestError.message}`);

  const historyFloor = new Date(Date.now() - (HISTORY_DAYS - 1) * 24 * 60 * 60 * 1000);
  historyFloor.setUTCHours(0, 0, 0, 0);

  let since = historyFloor;
  if (earliestRow) {
    const earliestDay = new Date(earliestRow.created_at);
    earliestDay.setUTCHours(0, 0, 0, 0);
    if (earliestDay > historyFloor) since = earliestDay;
  }

  const { data, error } = await supabase
    .from('token_usage')
    .select('tokens, created_at')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });
  if (error) throw new Error(`token usage history: ${error.message}`);

  const rows = data ?? [];
  const distinctDates = new Set(rows.map((row) => row.created_at.slice(0, 10)));

  if (rows.length > 0 && distinctDates.size <= 1) {
    return { granularity: 'hour', points: bucketByHour(rows) };
  }
  return { granularity: 'day', points: bucketByDay(rows, since) };
}

function bucketByDay(
  rows: { tokens: number; created_at: string }[],
  since: Date
): { date: string; tokens: number }[] {
  const tokensByDate = new Map<string, number>();
  for (const row of rows) {
    const date = row.created_at.slice(0, 10);
    tokensByDate.set(date, (tokensByDate.get(date) ?? 0) + row.tokens);
  }

  // Spans from `since` to today, not a fixed HISTORY_DAYS count -- `since`
  // itself may already be fewer than HISTORY_DAYS back (see
  // getTokenUsageTimeline's earliest-usage clamp), and a fixed count here
  // would either run past today or re-introduce the empty-padding problem
  // that clamp exists to remove.
  const day = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dayCount = Math.round((today.getTime() - since.getTime()) / day) + 1;

  return Array.from({ length: dayCount }, (_, i) => {
    const date = new Date(since.getTime() + i * day).toISOString().slice(0, 10);
    return { date, tokens: tokensByDate.get(date) ?? 0 };
  });
}

function hourKey(iso: string): string {
  const d = new Date(iso);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function bucketByHour(
  rows: { tokens: number; created_at: string }[]
): { date: string; tokens: number }[] {
  const tokensByHour = new Map<string, number>();
  for (const row of rows) {
    const key = hourKey(row.created_at);
    tokensByHour.set(key, (tokensByHour.get(key) ?? 0) + row.tokens);
  }

  const earliest = new Date(hourKey(rows[0].created_at)).getTime();
  const latest = new Date(hourKey(rows[rows.length - 1].created_at)).getTime();
  const hour = 60 * 60 * 1000;
  const spanHours = Math.round((latest - earliest) / hour) + 1;
  const start = spanHours < MIN_HOUR_BUCKETS ? latest - (MIN_HOUR_BUCKETS - 1) * hour : earliest;

  const points: { date: string; tokens: number }[] = [];
  for (let t = start; t <= latest; t += hour) {
    const iso = new Date(t).toISOString();
    points.push({ date: iso, tokens: tokensByHour.get(iso) ?? 0 });
  }
  return points;
}
