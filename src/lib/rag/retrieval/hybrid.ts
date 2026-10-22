import type { RankedResult } from './semantic';

// Reciprocal Rank Fusion (Cormack, Clarke & Buettcher, 2009): combines
// multiple independently-produced rankings of the same item set into one
// fused ranking, using each item's rank *position* in every list rather
// than its raw score. That's the point of it here specifically: a BM25
// score and a cosine similarity live on completely different, incomparable
// scales, so averaging or summing the raw numbers would be meaningless —
// rank position is the only thing the two methods share a common scale on.
// k=60 is the constant from the original paper (it just controls how much
// a #1 vs. a #20 ranking differs in contribution), not a tunable knob.
const RRF_K = 60;

export interface RankedList {
  items: { id: string; rank: number }[];
  // Scales that list's contribution before summing — 1 reproduces
  // unweighted RRF. See hybrid() below: this is how a query with no
  // useful literal keywords gets the keyword list's vote discounted
  // rather than trusted equally with semantic.
  weight: number;
}

export function reciprocalRankFusion(lists: RankedList[]): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const { items, weight } of lists) {
    for (const { id, rank } of items) {
      scores.set(id, (scores.get(id) ?? 0) + weight / (RRF_K + rank));
    }
  }
  return Array.from(scores, ([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}

export interface RerankOptions {
  // Scales each list's influence in the fused ranking — 1 (default) trusts
  // it equally. E.g. a caller that already knows a query has no useful
  // literal keywords can discount the keyword list instead of trusting it
  // equally with semantic.
  keywordWeight?: number;
  semanticWeight?: number;
  limit?: number;
}

// Takes the two already-computed ranked lists from keywordSearch() and
// semanticSearch() and fuses them into one ranking of the actual items —
// the caller runs the two searches (in parallel, typically), then hands
// both results here. Generic over item type T: chunks today (see
// lib/chunks.ts), memory facts later.
export function rerank<T>(
  keywordResults: RankedResult<T>[],
  semanticResults: RankedResult<T>[],
  options?: RerankOptions
): T[] {
  const { keywordWeight = 1, semanticWeight = 1, limit = 8 } = options ?? {};

  const byId = new Map<string, T>();
  for (const r of [...keywordResults, ...semanticResults]) {
    byId.set(r.id, r.item);
  }

  const fused = reciprocalRankFusion([
    { items: keywordResults.map((r, i) => ({ id: r.id, rank: i + 1 })), weight: keywordWeight },
    { items: semanticResults.map((r, i) => ({ id: r.id, rank: i + 1 })), weight: semanticWeight },
  ]).slice(0, limit);

  return fused.map((r) => byId.get(r.id)).filter((item): item is T => item !== undefined);
}
