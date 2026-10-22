import { NextResponse } from 'next/server';
import { bm25Search, tokenize } from '@/lib/rag/retrieval/bm25';
import { rankBySimilarity, semanticSearch, type VectorCandidate } from '@/lib/rag/retrieval/semantic';
import { reciprocalRankFusion } from '@/lib/rag/retrieval/hybrid';
import { embedWithCache } from '@/lib/rag/embedding-cache';
import { rewriteQuery } from '@/lib/rag/query-rewrite';
import { loadSearchCorpus, type CorpusChunk } from '@/lib/rag/search-corpus';

type Mode = 'bm25' | 'semantic' | 'hybrid';

function bm25Ranked(query: string, corpus: CorpusChunk[]) {
  const docs = corpus.map((c) => ({ id: c.id, tokens: tokenize(c.content) }));
  // Zero-score chunks (no query term present at all) aren't a "rank" —
  // dropped here so hybrid mode doesn't fuse in irrelevant BM25 "matches."
  return bm25Search(query, docs).filter((r) => r.score > 0);
}

// The lab has no database index to query — every chunk's vector lives in
// the local cache (embedWithCache). Named so it's never an inline closure
// inside semanticRanked below.
async function getCorpusVectors(corpus: CorpusChunk[]): Promise<VectorCandidate<CorpusChunk>[]> {
  const { embeddings } = await embedWithCache(corpus.map((c) => c.content));
  return corpus.map((c, i) => ({ id: c.id, vector: embeddings[i], item: c }));
}

// Goes through the same generic semanticSearch() chunks.ts uses for the
// live Supabase path — only the lookup differs: no index here, so
// rankBySimilarity brute-forces cosine similarity over every cached
// vector instead of a database doing the nearest-neighbor search.
async function semanticRanked(query: string, corpus: CorpusChunk[]) {
  return semanticSearch(query, async (queryEmbedding) => {
    const candidates = await getCorpusVectors(corpus);
    return rankBySimilarity(queryEmbedding, candidates);
  });
}

export async function POST(req: Request) {
  const { query, mode, limit } = await req.json();

  if (typeof query !== 'string' || !query.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }
  if (mode !== 'bm25' && mode !== 'semantic' && mode !== 'hybrid') {
    return NextResponse.json(
      { error: 'mode must be bm25, semantic, or hybrid' },
      { status: 400 }
    );
  }

  const corpus = await loadSearchCorpus();
  const byId = new Map(corpus.map((c) => [c.id, c]));
  const take = typeof limit === 'number' && limit > 0 ? limit : 25;

  if (corpus.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const typedMode = mode as Mode;

  // The LLM may return null for either half (see query-rewrite.ts) — fall
  // back to the raw query for that half rather than ever scoring against
  // an empty string.
  const rewrite = await rewriteQuery(query);
  const bm25Query = rewrite.keywords?.trim() || query;
  const semanticQuery = rewrite.semanticQuery?.trim() || query;

  if (typedMode === 'bm25') {
    const ranked = bm25Ranked(bm25Query, corpus).slice(0, take);
    return NextResponse.json({
      rewrite,
      results: ranked.map((r, i) => ({
        rank: i + 1,
        score: r.score,
        ...byId.get(r.id)!,
      })),
    });
  }

  if (typedMode === 'semantic') {
    const ranked = (await semanticRanked(semanticQuery, corpus)).slice(0, take);
    return NextResponse.json({
      rewrite,
      results: ranked.map((r, i) => ({
        rank: i + 1,
        score: r.score,
        ...byId.get(r.id)!,
      })),
    });
  }

  // hybrid: fuse both rankings by rank position (RRF), never by raw score
  // — a BM25 score and a cosine similarity aren't on comparable scales.
  const [bm25List, semanticList] = await Promise.all([
    Promise.resolve(bm25Ranked(bm25Query, corpus)),
    semanticRanked(semanticQuery, corpus),
  ]);
  const bm25RankMap = new Map(bm25List.map((r, i) => [r.id, i + 1]));
  const semanticRankMap = new Map(semanticList.map((r, i) => [r.id, i + 1]));

  // The rewriter returning null for `keywords` means it found no literal
  // terms worth searching for (an abstract/intent-y query) — a direct
  // signal to trust BM25's ranking less for this search. There's no
  // equivalent "give up" signal for semanticQuery (embeddings are
  // general-purpose; the model essentially never says semantic search
  // can't help), so semantic's weight always stays at 1.
  const bm25Weight = rewrite.keywords ? 1 : 0.3;
  const semanticWeight = 1;

  const fused = reciprocalRankFusion([
    { items: bm25List.map((r, i) => ({ id: r.id, rank: i + 1 })), weight: bm25Weight },
    {
      items: semanticList.map((r, i) => ({ id: r.id, rank: i + 1 })),
      weight: semanticWeight,
    },
  ]).slice(0, take);

  return NextResponse.json({
    rewrite,
    weights: { bm25: bm25Weight, semantic: semanticWeight },
    results: fused.map((r, i) => ({
      rank: i + 1,
      score: r.score,
      bm25Rank: bm25RankMap.get(r.id) ?? null,
      semanticRank: semanticRankMap.get(r.id) ?? null,
      ...byId.get(r.id)!,
    })),
  });
}
