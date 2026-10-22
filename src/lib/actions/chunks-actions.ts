import type { SupabaseClient } from '@supabase/supabase-js';
import * as retrieval from '@/lib/rag/retrieval';
import { createServiceClient } from '@/lib/supabase/service';
import {
  toRankedChunks,
  SCOPE_RETRIEVAL,
  type RetrievedChunk,
  type ChunkRow,
  type QuestionScope,
} from '@/lib/utils/chunks-utils';

// Chunks ranked by cosine similarity via Supabase's HNSW-indexed RPC (see
// schema.sql's kb_chunks_embedding_idx / match_kb_chunks_all) — the
// database does the nearest-neighbor search itself, so this never pulls
// a raw vector into JS. Faster and cheaper than fetching every row's
// embedding and comparing in Node once the table isn't tiny.
async function getDBChunksBySimilarity(
  supabase: SupabaseClient,
  queryEmbedding: number[],
  limit: number
): Promise<retrieval.RankedResult<RetrievedChunk>[]> {
  const { data, error } = await supabase.rpc('match_kb_chunks_all', {
    query_embedding: queryEmbedding,
    match_count: limit,
  });
  if (error) throw new Error(`vector search: ${error.message}`);
  return toRankedChunks((data ?? []) as ChunkRow[]);
}

// Chunks ranked by Postgres full-text search (ts_rank, see migrations/
// 0002) against `query` — the keyword-search counterpart to
// getDBChunksBySimilarity above. Same reasoning: a named, reusable "give me
// chunks matching this" operation belongs here, not inlined as a closure
// inside retrieveRelatedChunks.
async function getDBChunksByKeyword(
  supabase: SupabaseClient,
  query: string,
  limit: number
): Promise<retrieval.RankedResult<RetrievedChunk>[]> {
  const { data, error } = await supabase.rpc('match_kb_chunks_text', {
    query_text: query,
    match_count: limit,
  });
  if (error) throw new Error(`text search: ${error.message}`);
  return toRankedChunks((data ?? []) as ChunkRow[]);
}

export interface RetrieveRelatedChunksParams {
  // A clear, self-contained semantic restatement of the question — used
  // for vector/embedding search.
  query: string;
  // Literal keyword terms for BM25-style keyword search, or null when the
  // question is too abstract for keyword matching to help.
  keyword: string | null;
  // How wide a net this question needs -- see SCOPE_RETRIEVAL for the
  // pool/limit each scope maps to.
  scope?: QuestionScope;
}

export async function retrieveRelatedChunks({
  query,
  keyword,
  scope = 'medium',
}: RetrieveRelatedChunksParams): Promise<RetrievedChunk[]> {
  const supabase = createServiceClient();
  const { pool, limit } = SCOPE_RETRIEVAL[scope];

  const [keywordResults, semanticResults] = await Promise.all([
    retrieval.keywordSearch<RetrievedChunk>(() =>
      getDBChunksByKeyword(supabase, keyword?.trim() || query, pool)
    ),
    retrieval.semanticSearch<RetrievedChunk>(query, (queryEmbedding) =>
      getDBChunksBySimilarity(supabase, queryEmbedding, pool)
    ),
  ]);

  // No literal keywords worth searching for (an abstract/intent-y
  // question) is a direct signal to trust keyword search's ranking less
  // relative to semantic search.
  return retrieval.rerank(keywordResults, semanticResults, {
    keywordWeight: keyword ? 1 : 0.3,
    limit,
  });
}
