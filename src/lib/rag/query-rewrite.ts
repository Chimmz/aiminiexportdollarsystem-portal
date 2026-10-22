import { generateText, Output } from 'ai';
import { z } from 'zod';
import { queryRewriteModel } from '@/lib/ai/models';

const QueryRewriteSchema = z.object({
  keywords: z
    .string()
    .nullable()
    .describe(
      `Short, space-separated literal terms likely to appear verbatim in the
      source text (names, numbers, exact terminology) — for BM25 keyword
      search, which only rewards exact word overlap. Null if the query is
      too abstract/conversational for keyword search to help.`
    ),
  semanticQuery: z
    .string()
    .nullable()
    .describe(
      `A clear, slightly broader restatement of what the user actually wants
      to know — for embedding/semantic search, which understands paraphrase
      and intent rather than exact wording. Null only if the raw query is
      already just as good as anything you'd write for this.`
    ),
});

export interface QueryRewrite {
  keywords: string | null;
  semanticQuery: string | null;
}

// Splits one raw user query into the two different strings BM25 and
// semantic search each actually want (see bm25.ts and
// api/rag-lab/local-search/route.ts) — a query like "what's the first
// thing to do to export small-scale" shares almost no literal vocabulary
// with the chunk that answers it, which starves BM25; a rewrite can supply
// "first step export small scale" instead, while semantic search gets a
// clearer restatement of the same intent. Either half may come back null
// — not every query benefits from both signals — the caller is expected
// to fall back to the raw query for that half, never an empty string.
export async function rewriteQuery(query: string): Promise<QueryRewrite> {
  try {
    const { output } = await generateText({
      model: queryRewriteModel,
      output: Output.object({ schema: QueryRewriteSchema }),
      prompt: `A user is searching a knowledge base with two retrieval methods
running in parallel: BM25 keyword search and semantic embedding search.
Rewrite their query into the best input for each method, per the schema.
Only return null for a field if the raw query below is already just as good
as anything you could write for that method — don't return null for both.

User's query: "${query}"`,
    });
    console.log("[rag-lab] query rewrite:", { query, ...output });
    return output;
  } catch (err) {
    // The rewrite is an enhancement, not a hard dependency — a Gateway
    // hiccup shouldn't fail the whole search. Both null falls back to the
    // raw query on both sides at the call site.
    console.error("[rag-lab] query rewrite failed, falling back to raw query:", err);
    return { keywords: null, semanticQuery: null };
  }
}
