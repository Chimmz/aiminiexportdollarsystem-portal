import { NextResponse } from "next/server";
import { embedQuery } from "@/lib/rag/embed";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: Request) {
  const { query, batchId, topK } = await req.json();

  if (typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  if (typeof batchId !== "string") {
    return NextResponse.json({ error: "batchId is required" }, { status: 400 });
  }

  const embedding = await embedQuery(query);
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("match_kb_chunks", {
    query_embedding: embedding,
    match_batch_id: batchId,
    match_count: Number(topK) || 8,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ results: data });
}
