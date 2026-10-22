import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { embedChunks, EMBEDDING_MODEL_ID } from "./embed";

// Local, gitignored cache so chunk-size/separator experiments don't re-pay
// for (or re-wait on) Cohere calls for text we've already embedded — no
// Supabase/DB involved while we're still tuning chunking, see CLAUDE.md.
const CACHE_DIR = path.join(process.cwd(), ".rag-lab-cache", "embeddings");

interface CachedEmbedding {
  content: string;
  model: string;
  embedding: number[];
  createdAt: string;
}

// Keyed on (model, content) only — an embedding is a pure function of the
// text itself, so filename/source label must NOT be part of the key, or
// identical text pasted under a different label would wrongly miss.
function hashFor(content: string): string {
  return createHash("sha256").update(`${EMBEDDING_MODEL_ID}::${content}`).digest("hex");
}

function cachePathFor(hash: string): string {
  return path.join(CACHE_DIR, `${hash}.json`);
}

async function getCached(content: string): Promise<number[] | null> {
  try {
    const raw = await readFile(cachePathFor(hashFor(content)), "utf8");
    return (JSON.parse(raw) as CachedEmbedding).embedding;
  } catch {
    return null;
  }
}

async function setCached(content: string, embedding: number[]): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const entry: CachedEmbedding = {
    content,
    model: EMBEDDING_MODEL_ID,
    embedding,
    createdAt: new Date().toISOString(),
  };
  await writeFile(cachePathFor(hashFor(content)), JSON.stringify(entry), "utf8");
}

export interface EmbedWithCacheResult {
  embeddings: number[][];
  cachedCount: number;
  embeddedCount: number;
}

// Embeds `contents`, skipping Cohere entirely for any text already cached
// from a previous run (same text + same model). Order of `embeddings`
// matches `contents`.
export async function embedWithCache(contents: string[]): Promise<EmbedWithCacheResult> {
  const existing = await Promise.all(contents.map(getCached));

  const missIndexes = existing.reduce<number[]>((acc, cached, i) => {
    if (cached === null) acc.push(i);
    return acc;
  }, []);

  const results: number[][] = existing.map((e) => e ?? []);

  if (missIndexes.length > 0) {
    const missContents = missIndexes.map((i) => contents[i]);
    const newEmbeddings = await embedChunks(missContents);
    await Promise.all(
      missIndexes.map((contentIndex, j) => setCached(contents[contentIndex], newEmbeddings[j]))
    );
    missIndexes.forEach((contentIndex, j) => {
      results[contentIndex] = newEmbeddings[j];
    });
  }

  return {
    embeddings: results,
    cachedCount: contents.length - missIndexes.length,
    embeddedCount: missIndexes.length,
  };
}
