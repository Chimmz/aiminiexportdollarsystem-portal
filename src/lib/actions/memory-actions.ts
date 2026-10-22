import { createServiceClient } from '@/lib/supabase/service';
import { getJourneyProgress } from './journey-actions';
import type { ExportScale } from '@/lib/utils/journey-utils';
import type { ProfileFact, UserMemory } from '@/lib/utils/memory-utils';

// Default until the user's own export_scale fact says otherwise -- this
// course's main focus (see config.ts's PRODUCT CONTEXT), not a guess.
const DEFAULT_EXPORT_SCALE: ExportScale = 'small';

// Eva's memory, as a user-facing umbrella over three underlying stores:
// loose profile facts (this file) and the two fixed-step progress trackers
// (journey-actions.ts, unchanged -- this file combines rather than
// duplicates that logic). manage-memory-tool.ts is the one write path for
// all three; this file plus journey-actions.ts are the read/write
// primitives it calls into.

export async function getProfileFacts(userId: string): Promise<ProfileFact[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('profile_facts')
    .select('fact_type, fact_value, confidence, source')
    .eq('user_id', userId);
  if (error) throw new Error(`profile facts: ${error.message}`);

  return (data ?? []).map((row) => ({
    factType: row.fact_type,
    factValue: row.fact_value,
    confidence: row.confidence,
    source: row.source as ProfileFact['source'],
  }));
}

// "add" and "update" from manage-memory-tool.ts both land here -- fact_type
// is unique per user (see schema_app.sql), so both are really just an
// upsert, same as a progress step's status transition in journey-actions.ts.
// source defaults to the model's own extraction path; the chat-controls
// rail's manual "add a fact" form is the only other caller, passing
// 'user_provided' instead (see memory-utils.ts's ProfileFact['source']).
export async function upsertProfileFact(
  userId: string,
  factType: string,
  factValue: string,
  confidence: number | null,
  source: ProfileFact['source'] = 'chat_extracted'
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('profile_facts').upsert(
    {
      user_id: userId,
      fact_type: factType,
      fact_value: factValue,
      confidence,
      source,
    },
    { onConflict: 'user_id,fact_type' }
  );
  if (error) throw new Error(`upsert profile fact: ${error.message}`);
}

// Unlike progress steps (which only ever transition status, never need to
// disappear), a fact can become outright false -- "I don't use WhatsApp
// anymore" -- so deletion is meaningful here in a way it isn't for
// setup/deal progress.
export async function deleteProfileFact(userId: string, factType: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('profile_facts')
    .delete()
    .eq('user_id', userId)
    .eq('fact_type', factType);
  if (error) throw new Error(`delete profile fact: ${error.message}`);
}

// The chat-controls rail's "clear all memory" action -- a full reset of
// loose facts, same reasoning as deleteProfileFact above (a fact can be
// outright wrong, and here the user wants to wipe the slate rather than
// correct one entry at a time). Journey/deal progress is untouched; that's
// a separate reset the rail doesn't expose yet.
export async function clearProfileFacts(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('profile_facts').delete().eq('user_id', userId);
  if (error) throw new Error(`clear profile facts: ${error.message}`);
}

// Fetched once per request (same pattern as getCurrentUserFirstName in
// user-utils.ts) and injected into the system prompt via
// formatMemoryForPrompt (memory-utils.ts), so Eva knows everything she's
// learned about this user without a tool call just to find out.
//
// Sequential, not parallel, on purpose: which journey track to read
// (small-scale or large-scale) depends on the user's own "export_scale"
// fact, which only the facts fetch can tell us, so the journey fetch has
// to wait on it. Still a single cheap, indexed read either way.
export async function getUserMemory(userId: string): Promise<UserMemory> {
  const facts = await getProfileFacts(userId);
  const scaleFact = facts.find((f) => f.factType === 'export_scale')?.factValue;
  const scale: ExportScale = scaleFact === 'large' ? 'large' : DEFAULT_EXPORT_SCALE;
  const journey = await getJourneyProgress(userId, scale);
  return { facts, journey };
}
