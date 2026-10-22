import { NextResponse } from "next/server";
import { deleteChunkRun, getChunkRun, listChunkRuns, saveChunkRun } from "@/lib/rag/chunk-runs";
import { saveSourceText } from "@/lib/rag/source-texts";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");

  if (id) {
    const run = await getChunkRun(id);
    if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ run });
  }

  const runs = await listChunkRuns();
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const { label, text, options, chunks } = await req.json();

  if (typeof text !== "string" || !Array.isArray(chunks)) {
    return NextResponse.json({ error: "text and chunks[] are required" }, { status: 400 });
  }

  const normalizedLabel = typeof label === "string" && label.trim() ? label.trim() : null;

  const [id] = await Promise.all([
    saveChunkRun({ label: normalizedLabel, text, options, chunks }),
    // Kept separately from the run itself (see source-texts.ts) so the raw
    // text survives independently of any one chunk-run's lifecycle — only
    // possible when there's a label to key it by.
    normalizedLabel ? saveSourceText(normalizedLabel, text) : Promise.resolve(),
  ]);

  return NextResponse.json({ id });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 });

  await deleteChunkRun(id);
  return NextResponse.json({ ok: true });
}
