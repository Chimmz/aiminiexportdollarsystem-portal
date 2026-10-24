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
