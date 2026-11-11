import type { SupabaseClient } from '@supabase/supabase-js';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import * as retrieval from '@/lib/rag/retrieval';
import { queryRewriteModel } from '@/lib/ai/models';
import { createServiceClient } from '@/lib/supabase/service';
import { toRankedVideos, type RetrievedVideo, type VideoRow } from '@/lib/utils/video-utils';

// Hybrid keyword + vector search over video_media (migration
// 0023_video_media.sql) -- identical recipe to chunks-actions.ts's
// retrieveRelatedChunks, just against the curated video library instead
// of kb_chunks. No scope tiers like chunks has (specific/medium/broad):
// the library is small (under 20 rows today) and every call wants the
// same small handful of best matches, so pool/limit are fixed constants
// rather than a model-chosen scope.
const POOL = 8;
const LIMIT = 3;

async function getAllVideos(supabase: SupabaseClient): Promise<RetrievedVideo[]> {
  const { data, error } = await supabase
    .from('video_media')
    .select('id, title, description, video_url, platform');
  if (error) throw new Error(`video_media select: ${error.message}`);
  return toRankedVideos((data ?? []) as VideoRow[]).map((r) => r.item);
}

const VideoMatchSchema = z.object({
  matchedVideoIds: z
    .array(z.number())
    .describe(
      `Which of the catalog's video ids this query is actually asking
      about. Zero, one, or several -- never force a match just because a
      video shares a category with the query (e.g. a query about sealing
      a pouch is not a match for a video about shrink-wrapping a bottle).`
    ),
});

// Resolves a query against the real, full video catalog using a cheap
// model instead of text/embedding similarity alone -- same reasoning and
// same failure mode as media-actions.ts's matchProductWithLLM: embeddings
// of a short title/description can put same-category videos (two
// different packaging techniques, say) close enough together that a
// fuzzy search surfaces one when the query actually named the other, and
// a regional/colloquial product name in the query may not appear in any
// video's title/description at all. The library is small (under 20 rows)
// so fetching the whole thing and asking a cheap model to pick is cheap
// in practice. Grounded against the real catalog: only ids actually in
// it are ever returned. Returns null (not []) on an actual call failure,
// so the caller can fall back to the old fuzzy search only for that case,
// not for a genuine "no match".
async function matchVideosWithLLM(
  query: string,
  videos: RetrievedVideo[]
): Promise<RetrievedVideo[] | null> {
  if (videos.length === 0) return [];

  try {
    const { output } = await generateText({
      model: queryRewriteModel,
      output: Output.object({ schema: VideoMatchSchema }),
      prompt: `A user is asking an export mentor about a packaging
technique or product, and we need to match their query against a real
curated video catalog.

Query: "${query}"

Catalog (video id -> title -> description):
${videos
  .map((v) => `- ${v.id} -> ${v.title ?? '(no title)'} -> ${v.description ?? '(no description)'}`)
  .join('\n')}

Return the video id(s) this query is actually about. The query may use a
regional or colloquial name that never appears in any title/description
(e.g. in Nigerian English, "red oil" means palm oil) -- use that
knowledge. Don't return an id just because it shares a general category
with the query.`,
    });

    const validIds = new Set(videos.map((v) => v.id));
    const matchedIds = new Set(output.matchedVideoIds.filter((id) => validIds.has(id)));
    return videos.filter((v) => matchedIds.has(v.id));
  } catch (err) {
    console.error('[mentor] matchVideosWithLLM failed:', err);
    return null;
  }
}

async function getDBVideosBySimilarity(
  supabase: SupabaseClient,
  queryEmbedding: number[]
): Promise<retrieval.RankedResult<RetrievedVideo>[]> {
  const { data, error } = await supabase.rpc('match_video_media_all', {
    query_embedding: queryEmbedding,
    match_count: POOL,
  });
  if (error) throw new Error(`video vector search: ${error.message}`);
  return toRankedVideos((data ?? []) as VideoRow[]);
}

async function getDBVideosByKeyword(
  supabase: SupabaseClient,
  query: string
): Promise<retrieval.RankedResult<RetrievedVideo>[]> {
  const { data, error } = await supabase.rpc('match_video_media_text', {
    query_text: query,
    match_count: POOL,
  });
  if (error) throw new Error(`video text search: ${error.message}`);
  return toRankedVideos((data ?? []) as VideoRow[]);
}

export async function retrieveRelatedVideos(query: string): Promise<RetrievedVideo[]> {
  const supabase = createServiceClient();

  // LLM match first, trusted whenever it succeeds -- see
  // matchVideosWithLLM's own comment. Fuzzy BM25+semantic search below
  // only runs as a fallback for when the LLM call itself fails.
  const allVideos = await getAllVideos(supabase);
  const llmMatches = await matchVideosWithLLM(query, allVideos);
  if (llmMatches !== null) return llmMatches.slice(0, LIMIT);

  const [keywordResults, semanticResults] = await Promise.all([
    retrieval.keywordSearch<RetrievedVideo>(() => getDBVideosByKeyword(supabase, query)),
    retrieval.semanticSearch<RetrievedVideo>(query, (queryEmbedding) =>
      getDBVideosBySimilarity(supabase, queryEmbedding)
    ),
  ]);

  return retrieval.rerank(keywordResults, semanticResults, { limit: LIMIT });
}
