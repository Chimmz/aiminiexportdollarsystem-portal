import { tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import { retrieveRelatedChunks } from '@/lib/actions/chunks-actions';
import { extractTextHistory } from '@/lib/utils/conversation-utils';

// A high-level, semantic tool surface for the model — it just asks a
// question and gets back relevant training material. The low-level
// retrieval mechanics (BM25-style keyword search, vector/embedding search,
// weighted reciprocal-rank fusion) are entirely internal to
// retrieveRelatedChunks (lib/chunks.ts); the model never needs to know any
// of that exists, only that this tool answers export questions from real
// training material.

export function createAnswerQuestionTool(messages: ModelMessage[]) {
  const conversationHistory = extractTextHistory(messages);
  void conversationHistory;

  return tool({
    description: `Look up information from the export-business training knowledge
      base to help answer the user's question — sourcing, pricing, buyers,
      shipping, documentation, processing or packaging a specific product,
      regulations, or any other export-related topic. Call this before
      answering any export question so the answer is grounded in real
      training material instead of guessed.`,
    inputSchema: z.object({
      query: z.string().describe(
        `A clear, self-contained restatement of what the user wants to know —
          written so it makes sense without the rest of the conversation. Used
          for semantic search, which understands paraphrase and intent rather
          than exact wording.`
      ),
      keyword: z
        .string()
        .nullable()
        .describe(
          `Short, space-separated literal terms likely to appear verbatim in the
          training material (product names, numbers, exact terminology) — used
          for keyword search, which only rewards exact word overlap. Return
          null if the question is abstract/conversational and literal keyword
          matching wouldn't help.`
        ),
      scope: z
        .enum(['specific', 'medium', 'broad'])
        .describe(
          `How wide a net this question needs. "specific" for something
          narrow and concrete (one product, one step, one number — e.g.
          "what's the bank rate" or "how do I seal a crayfish pack").
          "broad" for an open-ended guide/process question spanning many
          subtopics (e.g. "guide me through labeling and branding
          generally", "how do I start exporting"). "medium" for anything
          in between. Pick the smallest scope that still covers the
          question — a wider scope returns more chunks, which costs more
          context and reading time, not just more thoroughness.`
        ),
    }),
    execute: async ({ query, keyword, scope }) => {
      // The model writes query/keyword/scope itself as part of calling this
      // tool (see the schema above) — there's no separate rewrite step the
      // way rag-lab's local-search has one, so this is the only place to see
      // what the model actually generated for a given question.
      console.log('[mentor] answerQuestion query rewrite:', { query, keyword, scope });
      // Structured, not a formatted string — same reasoning as
      // search-contacts-tool.ts: the chat UI reads this same output to
      // render the retrieved chunks (see mentor-chat-client.tsx's
      // 'tool-answerQuestion' case and tools-ui/answer-chunks-panel.tsx),
      // and the model reads the JSON directly just fine without needing it
      // pre-formatted into one big string.
      const startedAt = Date.now();
      try {
        const chunks = await retrieveRelatedChunks({ query, keyword, scope });
        const retrievedInMs = Date.now() - startedAt;
        if (chunks.length === 0) {
          return {
            chunks: [],
            retrievedInMs,
            note: 'No matching material was found in the training knowledge base for this question.',
          };
        }
        return { chunks, retrievedInMs };
      } catch (err) {
        console.error('[mentor] answerQuestion tool failed:', err);
        return {
          chunks: [],
          retrievedInMs: Date.now() - startedAt,
          note: "The knowledge base lookup failed right now -- answer from general knowledge if you can, and be upfront that you couldn't check the training material for this one.",
        };
      }
    },
  });
}

// DONT DELETE THESE!

// Now let's start from the beginning as a user
//   who's just purchased the course. The empy chat
//   msg should tell that

// ▎ [INTRODUCTION TO MINI EXPORT]
// ▎ 1. Decide products you want to export, and decide which country you want to sell to.
// 2. find out where to get it and the wholesale price.
// ▎ 3. Open a domiciliary account (e.g. GTBank, zero account opening).
// ▎ 4. Create a flyer and run adverts targeting buyers abroad.

// ----------

// In this section, we're going to implement what we saw in the previous explainer, which is to take a data bank of memories and pull them in using semantic recall. I've actually already added a little memories area in the project where you can view memories here, such as user's name is Sarah Chen, or you can add new ones too by pressing this plus button here and adding new memories with a title and content. This is great for us because it will allow us to easily debug what memories are being created, but I also think it's great practice to actually surface this to users, because it means if there's something wildly inaccurate there, the user can just delete it. So by the end of this section, we will have implemented semantic recall on these memories and memory extraction.

// -------

// export type MyMessage = UIMessage<
//   never,
//   {
//     'frontend-action': 'refresh-sidebar';
//   },
//   InferUITools<ReturnType<typeof getTools>>
// >;
