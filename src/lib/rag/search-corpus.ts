import { getChunkRun, listChunkRuns } from "./chunk-runs";

// Shared by every local-cache search mode (BM25, semantic, hybrid) so each
// one scores exactly the same set of chunks, built the same way, rather
// than three routes each re-implementing "load every saved chunk-run."
export interface CorpusChunk {
  id: string;
  runId: string;
  runLabel: string | null;
  chunkIndex: number;
  content: string;
  charCount: number;
}

export async function loadSearchCorpus(): Promise<CorpusChunk[]> {
  const summaries = await listChunkRuns();
  const runs = await Promise.all(summaries.map((s) => getChunkRun(s.id)));

  const corpus: CorpusChunk[] = [];
  for (const run of runs) {
    if (!run) continue;
    for (const chunk of run.chunks) {
      corpus.push({
        id: `${run.id}:${chunk.index}`,
        runId: run.id,
        runLabel: run.label,
        chunkIndex: chunk.index,
        content: chunk.content,
        charCount: chunk.charCount,
      });
    }
  }
  return corpus;
}
