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
