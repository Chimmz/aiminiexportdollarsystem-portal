import { gateway } from 'ai';

// The single place every model instance in this codebase is constructed —
// both the rag-lab (src/lib/rag/*) and the live mentor chat (src/lib/mentor/*)
// import their models from here rather than each calling
// gateway.languageModel/embeddingModel on their own. One file to see/change
// which model backs which job.
export const CHAT_MODEL_ID = 'openai/gpt-4o';
export const EMBEDDING_MODEL_ID = 'cohere/embed-v4.0';
export const EMBEDDING_DIMENSIONS = 1536; // must match kb_chunks' vector(1536) column
// Cheap, fast model for structured one-line rewrites (query rewriting) —
// not a task that needs a frontier model's reasoning.
export const QUERY_REWRITE_MODEL_ID = 'openai/gpt-4o-mini';

// The actual answer a paying user reads. Deliberately kept on full gpt-4o,
// not stepped down to 4o-mini: quality/instruction-following turned out to
// be the actual binding constraint, not just searchKb tool-calling (see
// the tool-ordering note in memory -- mini has already shown it follows
// prompt-level rules less reliably than full 4o elsewhere in this app, and
// a less steerable model that rambles through an off-topic request instead
// of declining it burns more tokens overall, not fewer, even though its
// per-token price is lower).
export const chatModel = gateway.languageModel(CHAT_MODEL_ID);
export const embeddingModel = gateway.embeddingModel(EMBEDDING_MODEL_ID);
export const queryRewriteModel = gateway.languageModel(QUERY_REWRITE_MODEL_ID);
