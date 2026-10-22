import { gateway } from "ai";

// The single place every model instance in this codebase is constructed —
// both the rag-lab (src/lib/rag/*) and the live mentor chat (src/lib/mentor/*)
// import their models from here rather than each calling
// gateway.languageModel/embeddingModel on their own. One file to see/change
// which model backs which job.
export const CHAT_MODEL_ID = "openai/gpt-4o-mini";
export const EMBEDDING_MODEL_ID = "cohere/embed-v4.0";
export const EMBEDDING_DIMENSIONS = 1536; // must match kb_chunks' vector(1536) column
// Cheap, fast model for structured one-line rewrites (query rewriting) —
// not a task that needs a frontier model's reasoning.
export const QUERY_REWRITE_MODEL_ID = "openai/gpt-4o-mini";

// The actual answer a paying user reads. Stepped down to 4o-mini (same
// tier as the query-rewrite model below) to control API costs -- swap
// CHAT_MODEL_ID back to a frontier model here if quality becomes the
// binding constraint instead of cost.
export const chatModel = gateway.languageModel(CHAT_MODEL_ID);
export const embeddingModel = gateway.embeddingModel(EMBEDDING_MODEL_ID);
export const queryRewriteModel = gateway.languageModel(QUERY_REWRITE_MODEL_ID);
