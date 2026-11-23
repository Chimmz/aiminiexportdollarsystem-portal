import { gateway } from 'ai';

// The single place every model instance in this codebase is constructed —
// both the rag-lab (src/lib/rag/*) and the live mentor chat (src/lib/mentor/*)
// import their models from here rather than each calling
// gateway.languageModel/embeddingModel on their own. One file to see/change
// which model backs which job.
// Tested gpt-5 here live (cheaper on input, tied on output -- see the
// Gateway's published rates): real conversations came back consistently
// slower, including at default (unset) reasoning effort, and explicitly
// setting a low reasoning effort made it worse, not better. Staying on
// gpt-4o trades away that per-token cost advantage for the response speed
// a live chat mentor actually needs -- margin now comes from the
// USAGE_CEILING_* ceiling in lib/mentor/limits.ts protecting the
// blended-average economics, not from picking the cheapest model.
export const CHAT_MODEL_ID = 'openai/gpt-4o';
export const EMBEDDING_MODEL_ID = 'cohere/embed-v4.0';
export const EMBEDDING_DIMENSIONS = 1536; // must match kb_chunks' vector(1536) column
// Cheap, fast model for structured one-line rewrites (query rewriting) —
// not a task that needs a frontier model's reasoning.
export const QUERY_REWRITE_MODEL_ID = 'openai/gpt-4o-mini';

export const chatModel = gateway.languageModel(CHAT_MODEL_ID);
export const embeddingModel = gateway.embeddingModel(EMBEDDING_MODEL_ID);
export const queryRewriteModel = gateway.languageModel(QUERY_REWRITE_MODEL_ID);
