import { NextResponse } from "next/server";
import { embedWithCache } from "@/lib/rag/embedding-cache";

export async function POST(req: Request) {
  const { chunks } = await req.json();

  if (!Array.isArray(chunks) || chunks.length === 0) {
    return NextResponse.json({ error: "chunks[] is required" }, { status: 400 });
  }

  const contents: string[] = chunks.map((c) => String(c?.content ?? c));
  const { cachedCount, embeddedCount } = await embedWithCache(contents);

  return NextResponse.json({ total: contents.length, cachedCount, embeddedCount });
}
