import type { RankedResult } from './semantic';

// Keyword search's counterpart to semanticSearch() — kept as thin as it is
// on purpose. Semantic search has a real shared step to factor out
// (embedding the query); keyword search doesn't, the actual algorithm
// (BM25, Postgres full-text, whatever) is entirely up to `search`. Still
// gets its own function so a caller's retrieval recipe reads as three
// parallel calls — keywordSearch, semanticSearch, rerank — instead of
// mixing a bare function call in with two wrapped ones.
export async function keywordSearch<T>(
  search: () => Promise<RankedResult<T>[]>
): Promise<RankedResult<T>[]> {
  return search();
}
