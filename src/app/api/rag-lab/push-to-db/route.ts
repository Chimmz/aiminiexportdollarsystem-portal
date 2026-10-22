import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getChunkRun, markChunkRunPushed } from "@/lib/rag/chunk-runs";
import { embedWithCache } from "@/lib/rag/embedding-cache";
import { createServiceClient } from "@/lib/supabase/service";

// Pushes one saved chunk-run's chunks into Supabase's kb_chunks. Uses
// embedWithCache, not embedChunks directly — every chunk here was already
// embedded once when its run was Saved (see rag-lab-client.tsx's
// handleSave), so this hits the local cache for virtually every chunk and
// only pays Cohere for genuinely new ones, rather than re-embedding the
// whole run from scratch.
export async function POST(req: Request) {
  const { runId } = await req.json();

  if (typeof runId !== "string" || !runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const run = await getChunkRun(runId);
  if (!run) {
    return NextResponse.json({ error: "chunk run not found" }, { status: 404 });
  }
  if (run.chunks.length === 0) {
    return NextResponse.json({ error: "run has no chunks" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Re-pushing the same run (after a re-chunk + re-save) replaces its
  // prior batch instead of accumulating a duplicate one alongside it.
  if (run.dbBatchId) {
    const { error: deleteError } = await supabase
      .from("kb_chunks")
      .delete()
      .eq("batch_id", run.dbBatchId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  const { embeddings } = await embedWithCache(run.chunks.map((c) => c.content));

  // One ordinal per push action, independent of the random batch_id —
  // gives the UI a human-friendly "batch 1, 2, 3..." in push order.
  const { data: seqData, error: seqError } = await supabase.rpc("next_kb_batch_no");
  if (seqError) {
    return NextResponse.json({ error: seqError.message }, { status: 500 });
  }
  const batchNo = seqData as number;
  const batchId = randomUUID();

  const rows = run.chunks.map((chunk, i) => ({
    batch_id: batchId,
    batch_no: batchNo,
    source_label: run.label,
    chunk_index: chunk.index,
    content: chunk.content,
    token_count: chunk.approxTokens,
    embedding: embeddings[i],
  }));

  const { error: insertError } = await supabase.from("kb_chunks").insert(rows);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await markChunkRunPushed(runId, { batchId, batchNo });

  return NextResponse.json({ batchId, batchNo, count: rows.length });
}
