import { randomUUID } from "crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import type { Chunk, ChunkOptions } from "./chunk";

// Persists full chunk runs locally (same .rag-lab-cache/ home as the
// embedding cache) so a page reload — or coming back to a file you
// chunked an hour ago — doesn't mean re-pasting and re-chunking. Separate
// from embedding-cache.ts: that's keyed on chunk content alone (an
// embedding is a pure function of text+model), this is keyed on the run
// itself (one record per "Chunk" click), since you want to get back the
// exact text + settings + resulting chunks, not just the vectors.
const RUNS_DIR = path.join(process.cwd(), ".rag-lab-cache", "chunk-runs");

export interface ChunkRun {
  id: string;
  label: string | null;
  createdAt: string;
  text: string;
  options: ChunkOptions;
  chunks: Chunk[];
  // Set after a successful "Push to DB" — the kb_chunks batch_id/batch_no
  // this run currently has live in Supabase, if any. Lets a second push of
  // the same run find and delete its own prior rows before re-inserting,
  // instead of accumulating duplicate batches every time you re-push after
  // re-chunking. See push-to-db/route.ts.
  dbBatchId?: string | null;
  dbBatchNo?: number | null;
  dbPushedAt?: string | null;
}

export interface ChunkRunSummary {
  id: string;
  label: string | null;
  createdAt: string;
  chunkCount: number;
  textPreview: string;
  dbBatchId?: string | null;
  dbBatchNo?: number | null;
  dbPushedAt?: string | null;
}

function runPath(id: string): string {
  return path.join(RUNS_DIR, `${id}.json`);
}

export async function saveChunkRun(input: {
  label: string | null;
  text: string;
  options: ChunkOptions;
  chunks: Chunk[];
}): Promise<string> {
  await mkdir(RUNS_DIR, { recursive: true });
  const id = randomUUID();
  const run: ChunkRun = { id, createdAt: new Date().toISOString(), ...input };
  await writeFile(runPath(id), JSON.stringify(run), "utf8");
  return id;
}

export async function listChunkRuns(): Promise<ChunkRunSummary[]> {
  await mkdir(RUNS_DIR, { recursive: true });
  const files = await readdir(RUNS_DIR);
  const runs = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const raw = await readFile(path.join(RUNS_DIR, f), "utf8");
        const run = JSON.parse(raw) as ChunkRun;
        return {
          id: run.id,
          label: run.label,
          createdAt: run.createdAt,
          chunkCount: run.chunks.length,
          textPreview: run.text.slice(0, 160),
          dbBatchId: run.dbBatchId ?? null,
          dbBatchNo: run.dbBatchNo ?? null,
          dbPushedAt: run.dbPushedAt ?? null,
        };
      })
  );
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getChunkRun(id: string): Promise<ChunkRun | null> {
  try {
    const raw = await readFile(runPath(id), "utf8");
    return JSON.parse(raw) as ChunkRun;
  } catch {
    return null;
  }
}

export async function deleteChunkRun(id: string): Promise<void> {
  try {
    await unlink(runPath(id));
  } catch {
    // already gone — fine
  }
}

// Records this run's live kb_chunks batch after a successful DB push, so
// the next push of the same run (after a re-chunk + re-save) knows which
// prior batch to delete first instead of accumulating duplicates.
export async function markChunkRunPushed(
  id: string,
  info: { batchId: string; batchNo: number }
): Promise<void> {
  const run = await getChunkRun(id);
  if (!run) return;
  const updated: ChunkRun = {
    ...run,
    dbBatchId: info.batchId,
    dbBatchNo: info.batchNo,
    dbPushedAt: new Date().toISOString(),
  };
  await writeFile(runPath(id), JSON.stringify(updated), "utf8");
}
