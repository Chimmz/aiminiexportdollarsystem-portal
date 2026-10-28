import { embedMany } from 'ai';
import { createServiceClient } from '@/lib/supabase/service';
import { embeddingModel } from '@/lib/ai/models';
import { getMessageText, hasRecallableText, textOnlyParts } from '@/lib/utils/conversation-utils';
import type { AppMessage } from '@/app/api/mentor/chat/route';

// Reads/writes the `messages` table (see supabase/migrations/
// 0011_mentor_messages.sql, 0017_message_embeddings.sql,
// 0018_message_keyword_search.sql). Service-role client, same reasoning as
// memory-actions.ts -- these only ever run from /api/mentor/chat (a server
// route), never a client bundle.

export async function getMentorMessages(userId: string): Promise<AppMessage[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, parts')
    .eq('user_id', userId)
    .order('seq', { ascending: true });
  if (error) throw new Error(`mentor messages: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role as AppMessage['role'],
    parts: row.parts as AppMessage['parts'],
  }));
}

// Called from route.ts's onFinish with just the turn's new messages (the
// user message that wasn't yet persisted, plus whatever Eva responded
// with) -- not the full conversation every time. Upsert by id rather than
// a plain insert so a continued/resumed stream (isContinuation in
// onFinish's event) overwrites its own row instead of erroring on a
// duplicate key.
export async function saveMentorMessages(
  userId: string,
  messages: AppMessage[]
): Promise<void> {
  if (messages.length === 0) return;
  const supabase = createServiceClient();

  // Embeddings power lib/mentor/working-memory.ts's semantic recall over
  // older messages -- only a message with real text is ever a candidate
  // for that (see hasRecallableText's own comment), so that's all that's
  // worth the embedding call here. One embedMany call for however many of
  // this turn's messages qualify (usually the new user message plus
  // Eva's final reply -- at most 2), not one call per message. A failure
  // here is never allowed to lose the turn itself -- it just means those
  // messages stay unsearchable later (embedding left null), same
  // graceful-degradation posture as recordTokenUsage/manageMemory
  // failures elsewhere in this route.
  const embeddableIndexes = messages.reduce<number[]>((acc, message, index) => {
    if (hasRecallableText(message)) acc.push(index);
    return acc;
  }, []);
  const embeddingByIndex = new Map<number, number[]>();
  if (embeddableIndexes.length > 0) {
    try {
      const { embeddings } = await embedMany({
        model: embeddingModel,
        values: embeddableIndexes.map((index) => getMessageText(messages[index])),
      });
      embeddableIndexes.forEach((index, i) => embeddingByIndex.set(index, embeddings[i]));
    } catch (err) {
      console.error('[mentor] embed messages for working memory failed:', err);
    }
  }

  const { error } = await supabase.from('messages').upsert(
    messages.map((message, index) => ({
      id: message.id,
      user_id: userId,
      role: message.role,
      parts: message.parts,
      // content powers keyword search (content_tsv, a generated column --
      // see migrations/0018); embedding powers semantic search. Both are
      // set from the exact same qualifying messages, independently of
      // whether the embedding call above actually succeeded -- a failed
      // embed call shouldn't also cost the message its keyword
      // searchability.
      content: hasRecallableText(message) ? getMessageText(message) : null,
      embedding: embeddingByIndex.get(index) ?? null,
    })),
    { onConflict: 'id' }
  );
  if (error) throw new Error(`save mentor messages: ${error.message}`);
}

// One ranked older message, from either the keyword or the semantic RPC
// below -- `rank` is RankedResult<T>-shaped (see lib/rag/retrieval) so
// working-memory.ts can feed these straight into reciprocalRankFusion
// without reshaping them first. `createdAt` rides along separately since
// fusion only ever deals in id/rank -- it's what restores chronological
// order after the fused top-K is picked.
export interface RankedMentorMessage {
  id: string;
  item: AppMessage;
  createdAt: string;
}

function toRankedMentorMessages(
  data: unknown
): RankedMentorMessage[] {
  const rows = (data ?? []) as {
    id: string;
    role: string;
    parts: unknown;
    created_at: string;
  }[];
  return rows.map((row) => {
    // The row's own `parts` column is whatever was originally persisted --
    // may still include tool-call/tool-result parts for a message that
    // qualified here via its text alongside one (see hasRecallableText).
    // Strip back down to text-only before this ever reaches
    // working-memory.ts, same as the recent window does for its own
    // qualifying messages.
    const rawMessage = {
      id: row.id,
      role: row.role as AppMessage['role'],
      parts: row.parts as AppMessage['parts'],
    };
    return {
      id: row.id,
      item: textOnlyParts(rawMessage),
      createdAt: row.created_at,
    };
  });
}

export interface SearchOlderMentorMessagesParams {
  userId: string;
  // An OR-joined set of distinct lexemes built from every recent message
  // at once (see working-memory.ts's buildKeywordQuery), not one
  // message's text verbatim -- a single combined call needs OR, not the
  // implicit AND websearch_to_tsquery would give a plain concatenation
  // (see match_mentor_messages_text's own comment, migrations/0019, for
  // why that matters). Empty string when no recent message had any real
  // word in it -- skipped below rather than sent to Postgres, since
  // to_tsquery errors on an empty query string.
  query: string;
  queryEmbedding: number[];
  excludeIds: string[];
  poolLimit: number;
  matchCount: number;
}

// The DB-side half of working-memory.ts's hybrid recall over a user's own
// older mentor-chat messages -- one combined call per turn (one query
// embedding, one OR-joined keyword set, both built from every recent
// message at once rather than one call per recent message), running
// keyword and semantic search in parallel and handing both rankings back
// unfused. Fusion itself (reciprocalRankFusion) happens in
// working-memory.ts -- same reciprocalRankFusion chunks-actions.ts's
// retrieveRelatedChunks already uses for kb_chunks, reused rather than
// reimplemented for a second table. Both RPCs rank entirely in Postgres
// (match_mentor_messages / match_mentor_messages_text, migrations/0017,
// 0018/0019) so only the already-ranked top matches ever cross the wire,
// never a user's raw embeddings or message text.
export async function searchOlderMentorMessages({
  userId,
  query,
  queryEmbedding,
  excludeIds,
  poolLimit,
  matchCount,
}: SearchOlderMentorMessagesParams): Promise<{
  keyword: RankedMentorMessage[];
  semantic: RankedMentorMessage[];
}> {
  const supabase = createServiceClient();
  const [keywordResult, semanticResult] = await Promise.all([
    query.trim()
      ? supabase.rpc('match_mentor_messages_text', {
          p_user_id: userId,
          query_text: query,
          exclude_ids: excludeIds,
          pool_limit: poolLimit,
          match_count: matchCount,
        })
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc('match_mentor_messages', {
      p_user_id: userId,
      query_embedding: queryEmbedding,
      exclude_ids: excludeIds,
      pool_limit: poolLimit,
      match_count: matchCount,
    }),
  ]);
  if (keywordResult.error) {
    throw new Error(`search older mentor messages (keyword): ${keywordResult.error.message}`);
  }
  if (semanticResult.error) {
    throw new Error(`search older mentor messages (semantic): ${semanticResult.error.message}`);
  }

  return {
    keyword: toRankedMentorMessages(keywordResult.data),
    semantic: toRankedMentorMessages(semanticResult.data),
  };
}

// The chat-controls rail's "Clear chats" action, once persistence exists
// -- without this, reloading the page would bring old messages straight
// back since page.tsx re-seeds useChat from this same table.
export async function clearMentorMessages(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('messages').delete().eq('user_id', userId);
  if (error) throw new Error(`clear mentor messages: ${error.message}`);
}
