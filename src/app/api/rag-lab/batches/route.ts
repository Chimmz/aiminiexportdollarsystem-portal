import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export interface BatchSummary {
  batchId: string;
  batchNo: number | null;
  sourceLabel: string | null;
  chunkCount: number;
  createdAt: string;
}

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("kb_chunks")
    .select("batch_id, batch_no, source_label, created_at")
    .order("batch_no", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Dev-scale table — grouping client-side is simpler than a dedicated view.
  const byBatch = new Map<string, BatchSummary>();
  for (const row of data) {
    const existing = byBatch.get(row.batch_id);
    if (existing) {
      existing.chunkCount++;
      if (row.created_at < existing.createdAt) existing.createdAt = row.created_at;
    } else {
      byBatch.set(row.batch_id, {
        batchId: row.batch_id,
        batchNo: row.batch_no,
        sourceLabel: row.source_label,
        chunkCount: 1,
        createdAt: row.created_at,
      });
    }
  }

  const batches = Array.from(byBatch.values()).sort(
    (a, b) => (b.batchNo ?? 0) - (a.batchNo ?? 0)
  );

  return NextResponse.json({ batches });
}
