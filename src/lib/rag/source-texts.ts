import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

// Raw pasted text, kept independently of chunk-runs.ts. A chunk run is a
// snapshot (text + settings + resulting chunks) you'll want several of per
// file, to compare configs — but you only ever want ONE copy of the raw
// text itself, reusable across configs so re-chunking with new separators
// never means re-pasting. Keyed by filename/label (one JSON index rather
// than per-file disk files, since labels are free-typed and not safe
// filesystem names as-is).
const INDEX_PATH = path.join(process.cwd(), ".rag-lab-cache", "source-texts.json");

interface SourceTextIndex {
  [label: string]: { text: string; updatedAt: string };
}

async function readIndex(): Promise<SourceTextIndex> {
  try {
    return JSON.parse(await readFile(INDEX_PATH, "utf8")) as SourceTextIndex;
  } catch {
    return {};
  }
}

async function writeIndex(index: SourceTextIndex): Promise<void> {
  await mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(index), "utf8");
}

export interface SourceTextSummary {
  label: string;
  updatedAt: string;
  charCount: number;
}

// Upserts — pasting a new version of a file under the same label replaces
// the old text, which is the intended behavior (the file's content is
// whatever you last pasted under that name).
export async function saveSourceText(label: string, text: string): Promise<void> {
  const index = await readIndex();
  index[label] = { text, updatedAt: new Date().toISOString() };
  await writeIndex(index);
}

export async function listSourceTexts(): Promise<SourceTextSummary[]> {
  const index = await readIndex();
  return Object.entries(index)
    .map(([label, v]) => ({ label, updatedAt: v.updatedAt, charCount: v.text.length }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSourceText(label: string): Promise<string | null> {
  const index = await readIndex();
  return index[label]?.text ?? null;
}

export async function deleteSourceText(label: string): Promise<void> {
  const index = await readIndex();
  delete index[label];
  await writeIndex(index);
}
