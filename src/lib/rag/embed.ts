import { embed, embedMany } from "ai";
import { embeddingModel, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_ID } from "@/lib/ai/models";

// Re-exported so existing callers (e.g. embedding-cache.ts's cache-key hash)
// don't need to know this module just forwards to lib/ai/models — the model
// instance itself is defined there now, shared with the mentor chat.
export { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_ID };

export async function embedChunks(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: embeddingModel, values: texts });
  return embeddings;
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: embeddingModel, value: text });
  return embedding;
}
