import { cosineSimilarity, embed } from 'ai';
import { embeddingModel } from '@/lib/ai/models';

// Everything "semantic search" means in this codebase: the raw vector-math
// primitive (cosineSimilarity — re-exported from the `ai` package itself,
// not hand-rolled), the brute-force ranking building block
// (rankBySimilarity), and the embed-query-then-look-up orchestration
// (semanticSearch). Always uses the one embedding model defined in
// lib/ai/models.ts — not injected — so every semantic search in the app is
// guaranteed to compare vectors from the same embedding space.
export { cosineSimilarity };

// A single hit from any ranked search (semantic or keyword) — `id` is what
// reciprocalRankFusion (see ./hybrid) fuses rankings on, `item` is the
// actual retrieved thing. `score` is optional and purely informational
// (e.g. for a UI to display) — rank *order* in the returned array is what
// everything else in this module actually relies on. Generic over item
// type: chunks today, memory facts later, anything retrievable.
export interface RankedResult<T> {
  id: string;
  item: T;
  score?: number;
}

// One candidate to compare a query vector against: its own vector, plus
// the item it represents. Only meaningful for brute-force ranking (see
// rankBySimilarity) — a real index-backed lookup (e.g. lib/chunks.ts's
// getChunksBySimilarity, via Supabase's HNSW-indexed RPC) never needs this
// at all, since the database does the comparison itself.
export interface VectorCandidate<T> {
  id: string;
  vector: number[];
  item: T;
}

// Ranks `candidates` against `queryVector` by cosine similarity, best
// first. The brute-force building block for a search() that has no index
// to delegate to — e.g. the rag-lab's local-search, comparing against a
// local JSON cache of vectors instead of a real database. Not used by
// lib/chunks.ts, which has a real HNSW index to query instead.
export function rankBySimilarity<T>(
  queryVector: number[],
  candidates: VectorCandidate<T>[]
): RankedResult<T>[] {
  return candidates
    .map((c) => ({ id: c.id, item: c.item, score: cosineSimilarity(queryVector, c.vector) }))
    .sort((a, b) => b.score - a.score);
}

// Embeds `query` and hands the vector to `search` for the actual
// nearest-neighbor lookup — which table, which index, which RPC (or, for
// the rag-lab's local cache, rankBySimilarity above) is entirely up to the
// caller. This is the only part of "semantic search" that's genuinely the
// same regardless of what's being searched; the lookup itself never is.
export async function semanticSearch<T>(
  query: string,
  search: (queryEmbedding: number[]) => Promise<RankedResult<T>[]>
): Promise<RankedResult<T>[]> {
  const { embedding } = await embed({ model: embeddingModel, value: query });
  return search(embedding);
}
