import * as retrieval from '@/lib/rag/retrieval';

// Chunks (kb_chunks) are one retrievable item type among what will
// eventually be several — this file owns the chunk-specific shapes and the
// pure row -> ranked-item mapping over them. The actual DB/RPC calls
// (lib/actions/chunks-actions.ts) hand the real search work off to
// lib/rag/retrieval's generic keywordSearch()/semanticSearch()/rerank(),
// none of which know chunks exist.

export interface RetrievedChunk {
  id: number;
  content: string;
  sourceLabel: string | null;
}

export interface ChunkRow {
  id: number;
  content: string;
  source_label: string | null;
}

export function toRankedChunks(rows: ChunkRow[]): retrieval.RankedResult<RetrievedChunk>[] {
  return rows.map((row) => ({
    id: String(row.id),
    item: { id: row.id, content: row.content, sourceLabel: row.source_label },
  }));
}

// How wide a net a question needs -- the model classifies each call to
// searchKbTool into one of these rather than picking a raw chunk
// count itself, so it only ever has to reason about scope, not tune a
// number. `pool` is how many candidates each of keyword/semantic search
// pulls before RRF fusion, `limit` is how many survive the fusion cut.
// pool stays well above limit at every scope (roughly 2.5-3x) so fusion
// always has real headroom to discriminate between candidates -- if pool
// and limit were equal, RRF would have nothing to filter out and this
// would just return "everything both searches found" in whatever order
// they happened to come back in.
export type QuestionScope = 'specific' | 'medium' | 'broad';

export const SCOPE_RETRIEVAL: Record<QuestionScope, { pool: number; limit: number }> = {
  specific: { pool: 20, limit: 6 },
  medium: { pool: 30, limit: 12 },
  broad: { pool: 40, limit: 15 },
};
