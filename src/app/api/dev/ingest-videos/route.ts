import { NextResponse } from "next/server";
import { embedChunks } from "@/lib/rag/embed";
import { createServiceClient } from "@/lib/supabase/service";

// One-off/occasional ingestion endpoint for the curated video library
// (migration 0023_video_media.sql) -- there's no UI for this, it's run
// manually (curl/fetch a JSON body of rows) whenever the source
// spreadsheet gets new rows, same spirit as the rag-lab's manual
// paste-and-push flow but with no page to drive it from.
export async function POST(req: Request) {
  const { rows } = (await req.json()) as {
    rows: { title: string | null; description: string | null; video_url: string; platform: string }[];
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows is required" }, { status: 400 });
  }

  // A row with neither title nor description has nothing to embed against
  // -- skipped rather than embedding on an empty string, which produces a
  // meaningless vector that would never surface for any real query.
  const usable = rows.filter(
    (r) => (r.title?.trim() || r.description?.trim()) && r.video_url?.trim()
  );
  const skipped = rows.length - usable.length;

  // Combined, not embedded separately -- same text the DB's generated
  // content_tsv column indexes for keyword search, so semantic and
  // keyword search agree on what each row "is".
  const combinedText = usable.map((r) => [r.title, r.description].filter(Boolean).join(". "));
  const embeddings = await embedChunks(combinedText);

  const dbRows = usable.map((r, i) => ({
    title: r.title?.trim() || null,
    description: r.description?.trim() || null,
    video_url: r.video_url.trim(),
    platform: r.platform,
    embedding: embeddings[i],
  }));

  const supabase = createServiceClient();
  // Upsert on video_url, not insert -- re-running this with the same sheet
  // after adding a few new rows re-embeds everything sent but never
  // duplicates a row already there (relies on the unique constraint on
  // video_url from migration 0023).
  const { error } = await supabase
    .from("video_media")
    .upsert(dbRows, { onConflict: "video_url" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: dbRows.length, skipped });
}
