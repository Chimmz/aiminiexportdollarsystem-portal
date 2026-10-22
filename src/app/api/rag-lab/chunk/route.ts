import { NextResponse } from "next/server";
import { chunkText, type ChunkStrategy } from "@/lib/rag/chunk";

export async function POST(req: Request) {
  const {
    text,
    chunkSize,
    chunkOverlap,
    strategy,
    separators,
    carryMainHeading,
    headingPrefixes,
    ignoreHeadingWords,
  } = await req.json();

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const chunks = chunkText(text, {
    chunkSize: Number(chunkSize) || 800,
    // `||` would treat an intentional 0 (no overlap) as "unset" and fall
    // back to 100 — chunkSize keeps `||` above because 0 is never a valid
    // chunk size, but 0 overlap is valid and means exactly that.
    chunkOverlap: Number.isFinite(Number(chunkOverlap)) ? Number(chunkOverlap) : 100,
    strategy: (strategy as ChunkStrategy) ?? "recursive",
    separators: Array.isArray(separators) ? separators : undefined,
    carryMainHeading: carryMainHeading === true,
    headingPrefixes: Array.isArray(headingPrefixes) ? headingPrefixes.filter((p) => typeof p === "string") : [],
    ignoreHeadingWords: Array.isArray(ignoreHeadingWords)
      ? ignoreHeadingWords.filter((p) => typeof p === "string")
      : [],
  });

  return NextResponse.json({ chunks });
}
