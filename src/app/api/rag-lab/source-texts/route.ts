import { NextResponse } from "next/server";
import { deleteSourceText, getSourceText, listSourceTexts } from "@/lib/rag/source-texts";

export async function GET(req: Request) {
  const label = new URL(req.url).searchParams.get("label");

  if (label) {
    const text = await getSourceText(label);
    if (text === null) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ label, text });
  }

  const sources = await listSourceTexts();
  return NextResponse.json({ sources });
}

export async function DELETE(req: Request) {
  const label = new URL(req.url).searchParams.get("label");
  if (!label) return NextResponse.json({ error: "label query param is required" }, { status: 400 });

  await deleteSourceText(label);
  return NextResponse.json({ ok: true });
}
