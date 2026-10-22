import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export interface StoredChunk {
  id: number;
  batchId: string;
  batchNo: number | null;
  sourceLabel: string | null;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
}

export async function GET(req: Request) {
  const batchId = new URL(req.url).searchParams.get("batchId");
  if (!batchId) {
    return NextResponse.json({ error: "batchId query param is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("kb_chunks")
    .select("id, batch_id, batch_no, source_label, chunk_index, content, token_count")
    .eq("batch_id", batchId)
    .order("chunk_index", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const chunks: StoredChunk[] = data.map((row) => ({
    id: row.id,
    batchId: row.batch_id,
    batchNo: row.batch_no,
    sourceLabel: row.source_label,
    chunkIndex: row.chunk_index,
    content: row.content,
    tokenCount: row.token_count,
  }));

  return NextResponse.json({ chunks });
}
