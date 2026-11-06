import type { SupabaseClient } from '@supabase/supabase-js';
import * as retrieval from '@/lib/rag/retrieval';
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

  const [keywordResults, semanticResults] = await Promise.all([
    retrieval.keywordSearch<RetrievedVideo>(() => getDBVideosByKeyword(supabase, query)),
    retrieval.semanticSearch<RetrievedVideo>(query, (queryEmbedding) =>
      getDBVideosBySimilarity(supabase, queryEmbedding)
    ),
  ]);

  return retrieval.rerank(keywordResults, semanticResults, { limit: LIMIT });
}
