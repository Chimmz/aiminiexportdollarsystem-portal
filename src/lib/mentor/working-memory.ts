import { embed } from 'ai';
import { reciprocalRankFusion, type RankedList } from '@/lib/rag/retrieval';
import { embeddingModel } from '@/lib/ai/models';
import {
  searchOlderMentorMessages,
  type RankedMentorMessage,
} from '@/lib/actions/mentor-messages-actions';
import {
  getMessageText,
  hasRecallableText,
  textOnlyParts,
  trimAssistantReply,
} from '@/lib/utils/conversation-utils';
import type { WORKING_MEMORY_LIMITS } from './limits';
import type { AppMessage } from '@/app/api/mentor/chat/route';

type WorkingMemoryTierLimits =
  (typeof WORKING_MEMORY_LIMITS)[keyof typeof WORKING_MEMORY_LIMITS];

// Keyword search gets a lower vote than semantic in the fused ranking,
// same posture (and same reasoning) as chunks-actions.ts's
// retrieveRelatedChunks: a recall query built from conversational text is
// a weaker keyword signal than searchKb's explicit, hand-picked `keyword`
// input -- it should still get a vote (an older message that happens to
// share an exact product/country name is a real signal semantic search
// can under-rank), just not an equal one.
const KEYWORD_WEIGHT = 0.5;

// How much wider than the final rerankedMessagesLimit each sub-search
// (keyword, semantic) asks for before fusing -- same reasoning as
// chunks-utils.ts's SCOPE_RETRIEVAL pool/limit split: RRF needs real
// breadth from each ranking to actually fuse anything, not just the
// exact final count from each side.
const SUB_SEARCH_WIDTH = 3;

// A deduplicated, OR-joined set of lexemes from every recent message at
// once -- not one message's text verbatim, and not all of them simply
// concatenated into one sentence either. A single combined keyword
// search needs OR, not AND: match_mentor_messages_text's to_tsquery
// (migrations/0019) would otherwise require a single older message to
// contain nearly every word from every recent message at once to match
// at all. Deliberately simple tokenizing (lowercase, word characters) --
// to_tsquery's own english dictionary still does real stemming/stopword
// handling on each lexeme, this just needs to produce valid `a | b | c`
// syntax, not do the linguistic work itself.
function buildKeywordQuery(texts: string[]): string {
  const words = new Set<string>();
  for (const text of texts) {
    for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      words.add(word);
    }
  }
  return [...words].join(' | ');
}

// Replaces "send the whole conversation to the model every turn" with a
// bounded window: the most recent `recentMessagesLimit` messages with real
// text, plus up to `rerankedMessagesLimit` older ones that are actually
// relevant to what's being asked right now (see limits.ts's
// WORKING_MEMORY_LIMITS comment for why that's a deliberately bounded
// search, not a second long-term memory system). Any tool-call/tool-result
// parts on a qualifying message are stripped out (see
// conversation-utils.ts's hasRecallableText/textOnlyParts) rather than fed
// through verbatim -- they're bulky, and every tool here is cheaply
// re-callable if something from one is genuinely still needed (e.g. "show
// me those buyers again" just calls searchContacts again), so there's
// nothing about the call itself worth preserving once its own turn is
// over, only the words said alongside it. Dropping the whole message
// instead of just its tool parts was tried first and caused a real bug: an
// old user request like "show me buyers in the USA" could resurface via
// semantic recall with its own answer nowhere in context (the reply that
// answered it got dropped entirely for having a tool call in it), which
// reads to the model as a dangling, unanswered question to act on right
// now rather than something already handled. That brought a token-cost
// problem of its own though: a recalled assistant reply can be a full
// packaging rundown or market list, verbatim, just so the model can see an
// old question was already answered. trimAssistantReply (see
// conversation-utils.ts) cuts each recalled assistant message down to its
// opening line before it's returned below -- only the reranked/older
// portion, never the recent window, which still needs full fidelity.
//
// Retrieval itself is hybrid, not semantic-only, and runs as ONE combined
// search per turn, not one per recent message: every recent message's
// text is condensed into a single query embedding and a single OR-joined
// keyword set (buildKeywordQuery above), searched once each against the
// older pool (searchOlderMentorMessages), then fused by
// reciprocalRankFusion -- the exact same fusion chunks-actions.ts's
// retrieveRelatedChunks already uses for kb_chunks (lib/rag/retrieval/
// hybrid.ts), reused here rather than reimplemented for a second table.
// An earlier version of this ran one Promise.all'd hybrid search *per*
// recent message -- correct, but still a `Promise.all` that waits on the
// slowest of N round trips before any of this turn's own work (getTools,
// streamText) can start; condensing to one combined search cuts that
// down to one round trip's worth of latency regardless of how large
// recentMessagesLimit is.
//
// Returned oldest-first throughout: the selected older messages (sorted
// by their own createdAt, since fusion ranks by relevance, not time)
// come first, then the recent window (already oldest-first by
// construction) -- matching the chronological order every other reader
// of these messages already assumes.
export async function buildWorkingMemoryMessages(
  userId: string,
  limits: WorkingMemoryTierLimits,
  messages: AppMessage[]
): Promise<AppMessage[]> {
  const textOnlyMessages = messages.filter(hasRecallableText);
  const recentTextMessages = textOnlyMessages.slice(-limits.recentMessagesLimit);

  // Nothing older exists to search at all -- a short conversation, or one
  // still entirely inside the recent window. Skip the embedding/RPC round
  // trip entirely rather than pay for a search with an empty pool.
  if (recentTextMessages.length === textOnlyMessages.length) {
    return recentTextMessages.map(textOnlyParts);
  }

  const recentTexts = recentTextMessages.map(getMessageText);

  // The text actually embedded isn't recentTexts verbatim -- the single
  // most recent message is included a second time, so it dominates the
  // resulting vector instead of being diluted equally across the rest of
  // the recent window. recentTextMessages is oldest-first by construction
  // (see this function's own comment), so the most recent one is the last
  // element. No keyword-side equivalent: buildKeywordQuery already dedupes
  // into a flat OR set, so repeating a word there is a no-op.
  const mostRecentText = recentTexts[recentTexts.length - 1];
  const { embedding } = await embed({
    model: embeddingModel,
    value: [...recentTexts, mostRecentText].join('\n'),
  });

  const subSearchMatchCount = Math.min(
    limits.olderPoolLimit,
    limits.rerankedMessagesLimit * SUB_SEARCH_WIDTH
  );

  const { keyword, semantic } = await searchOlderMentorMessages({
    userId,
    query: buildKeywordQuery(recentTexts),
    queryEmbedding: embedding,
    excludeIds: recentTextMessages.map((msg) => msg.id),
    poolLimit: limits.olderPoolLimit,
    matchCount: subSearchMatchCount,
  });

  const byId = new Map<string, AppMessage>();
  const createdAtById = new Map<string, string>();

  const rememberMatches = (matches: RankedMentorMessage[]) => {
    for (const match of matches) {
      byId.set(match.id, match.item);
      createdAtById.set(match.id, match.createdAt);
    }
  };
  rememberMatches(keyword);
  rememberMatches(semantic);

  const toRankedList = (matches: RankedMentorMessage[], weight: number): RankedList => ({
    items: matches.map((match, i) => ({ id: match.id, rank: i + 1 })),
    weight,
  });

  const reranked = reciprocalRankFusion([
    toRankedList(keyword, KEYWORD_WEIGHT),
    toRankedList(semantic, 1),
  ])
    .slice(0, limits.rerankedMessagesLimit)
    .map((fused) => ({
      message: byId.get(fused.id),
      createdAt: createdAtById.get(fused.id),
    }))
    .filter(
      (entry): entry is { message: AppMessage; createdAt: string } =>
        entry.message !== undefined && entry.createdAt !== undefined
    )
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .map((entry) => entry.message)
    .map(trimAssistantReply);

  console.log(
    `\n-----------------------------`,
    `[Working Memory] Retrieved older messages:\n`,
    reranked.map((msg) => `${msg.role.toUpperCase()}: ${getMessageText(msg)}`).join('\n'),
    `\n-----------------------------`
  );

  return [...reranked, ...recentTextMessages.map(textOnlyParts)];
}
