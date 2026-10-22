"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_SEPARATORS, type SeparatorSpec } from "@/lib/rag/chunk";

type Strategy = "recursive" | "fixed";

interface ChunkRow {
  index: number;
  content: string;
  charCount: number;
  approxTokens: number;
}

interface ChunkOptionsRow {
  chunkSize: number;
  chunkOverlap: number;
  strategy: Strategy;
  separators?: SeparatorSpec[];
  carryMainHeading?: boolean;
  headingPrefixes?: string[];
  ignoreHeadingWords?: string[];
}

interface CacheStats {
  total: number;
  cachedCount: number;
  embeddedCount: number;
}

interface RunSummary {
  id: string;
  label: string | null;
  createdAt: string;
  chunkCount: number;
  textPreview: string;
  dbBatchId?: string | null;
  dbBatchNo?: number | null;
  dbPushedAt?: string | null;
}

interface RunDetail {
  id: string;
  label: string | null;
  createdAt: string;
  text: string;
  options: ChunkOptionsRow;
  chunks: ChunkRow[];
}

interface SourceSummary {
  label: string;
  updatedAt: string;
  charCount: number;
}

type SearchMode = "bm25" | "semantic" | "hybrid";

interface SearchResultRow {
  rank: number;
  score: number;
  runId: string;
  runLabel: string | null;
  chunkIndex: number;
  content: string;
  charCount: number;
  // Only present for mode "hybrid" — where each signal individually ranked
  // this chunk, so you can see what RRF actually fused together. null means
  // that signal never matched this chunk at all (e.g. no shared keywords).
  bm25Rank?: number | null;
  semanticRank?: number | null;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `${url} failed (${res.status})`);
  return data as T;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `${url} failed (${res.status})`);
  return data as T;
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function RagLab() {
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [chunkSize, setChunkSize] = useState(800);
  const [chunkOverlap, setChunkOverlap] = useState(100);
  const [strategy, setStrategy] = useState<Strategy>("recursive");
  const [separators, setSeparators] = useState<SeparatorSpec[]>(DEFAULT_SEPARATORS);
  // Off by default — carrying the document's first heading over every chunk
  // is a real assumption (one title governs the whole doc) that doesn't fit
  // every file, so it's an explicit per-file judgment call, not a default.
  const [carryMainHeading, setCarryMainHeading] = useState(false);
  // Comma-separated, kept as raw text in state so typing a trailing comma
  // doesn't get eaten — parsed into an array only when sent/saved.
  const [headingPrefixInput, setHeadingPrefixInput] = useState("");
  const headingPrefixes = headingPrefixInput
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  // Opposite of headingPrefixes: words that must stay inline body text even
  // though they'd otherwise qualify as a heading (e.g. a short ALL-CAPS
  // speaker label like "INSTRUCTOR:"/"STUDENT:" in a dialogue transcript) —
  // without this, every single turn forces its own chunk, producing
  // one-line fragments like "No." with no context of their own.
  const [ignoreHeadingInput, setIgnoreHeadingInput] = useState("");
  const ignoreHeadingWords = ignoreHeadingInput
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const [newSepPattern, setNewSepPattern] = useState("");
  const [newSepIsRegex, setNewSepIsRegex] = useState(true);

  const [chunks, setChunks] = useState<ChunkRow[] | null>(null);
  const [chunkError, setChunkError] = useState<string | null>(null);
  const [chunking, setChunking] = useState(false);

  const [caching, setCaching] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheError, setCacheError] = useState<string | null>(null);

  const [savingRun, setSavingRun] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveRunError, setSaveRunError] = useState<string | null>(null);

  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  // Starts true (rather than being set true inside the mount effect) so the
  // initial fetch doesn't call setState synchronously within the effect body.
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [loadRunError, setLoadRunError] = useState<string | null>(null);
  const [pushingRunId, setPushingRunId] = useState<string | null>(null);
  const [pushErrorByRunId, setPushErrorByRunId] = useState<Record<string, string>>({});

  const [sources, setSources] = useState<SourceSummary[] | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingSourceLabel, setLoadingSourceLabel] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResultRow[] | null>(null);
  const [searchRewrite, setSearchRewrite] = useState<{
    keywords: string | null;
    semanticQuery: string | null;
  } | null>(null);
  // Only set for mode "hybrid" — the per-signal RRF weights the rewrite
  // produced (see local-search/route.ts).
  const [searchWeights, setSearchWeights] = useState<{ bm25: number; semantic: number } | null>(
    null
  );

  async function loadRuns() {
    try {
      const data = await getJSON<{ runs: RunSummary[] }>("/api/rag-lab/chunk-runs");
      setRuns(data.runs);
      setRunsError(null);
    } catch (err) {
      setRunsError((err as Error).message);
    } finally {
      setLoadingRuns(false);
    }
  }

  async function loadSources() {
    try {
      const data = await getJSON<{ sources: SourceSummary[] }>("/api/rag-lab/source-texts");
      setSources(data.sources);
      setSourcesError(null);
    } catch (err) {
      setSourcesError((err as Error).message);
    } finally {
      setLoadingSources(false);
    }
  }

  useEffect(() => {
    // Standard fetch-on-mount — every setState call in loadRuns/loadSources
    // happens after an awaited fetch, never synchronously inside this
    // effect's own tick.
    loadRuns();
    loadSources();
  }, []);

  async function handleChunk() {
    setChunking(true);
    setChunkError(null);
    setChunks(null);
    setCaching(false);
    setCacheStats(null);
    setCacheError(null);
    setSaveRunError(null);
    setSaved(false);
    setActiveRunId(null);

    // Chunking alone — nothing is cached or saved until you click Save, so
    // you can review the chunk grid first and re-chunk freely with
    // different settings without spending anything or cluttering the
    // saved-runs list with drafts you were going to throw away.
    try {
      const data = await postJSON<{ chunks: ChunkRow[] }>("/api/rag-lab/chunk", {
        text,
        chunkSize,
        chunkOverlap,
        strategy,
        separators,
        carryMainHeading,
        headingPrefixes,
        ignoreHeadingWords,
      });
      setChunks(data.chunks);
    } catch (err) {
      setChunkError((err as Error).message);
    } finally {
      setChunking(false);
    }
  }

  async function handleSave() {
    if (!chunks || chunks.length === 0) return;

    setCaching(true);
    setSavingRun(true);
    setCacheError(null);
    setSaveRunError(null);
    const options: ChunkOptionsRow = {
      chunkSize,
      chunkOverlap,
      strategy,
      separators,
      carryMainHeading,
      headingPrefixes,
      ignoreHeadingWords,
    };
    const [cacheResult, saveResult] = await Promise.allSettled([
      postJSON<CacheStats>("/api/rag-lab/embed-cache", { chunks }),
      postJSON<{ id: string }>("/api/rag-lab/chunk-runs", {
        label: label.trim() || null,
        text,
        options,
        chunks,
      }),
    ]);
    setCaching(false);
    setSavingRun(false);

    if (cacheResult.status === "fulfilled") setCacheStats(cacheResult.value);
    else setCacheError(cacheResult.reason.message);

    if (saveResult.status === "fulfilled") {
      setActiveRunId(saveResult.value.id);
      setSaved(true);
      loadRuns(); // refresh the saved-runs list with this new one
      if (label.trim()) loadSources(); // the source text was upserted too
      // Clear the paste + label so the next file can't accidentally be
      // saved under a leftover label from this one (see source-texts.ts:
      // saving under an existing label silently overwrites it).
      setText("");
      setLabel("");
    } else {
      setSaveRunError(saveResult.reason.message);
    }
  }

  // Loads just the raw text for a previously-chunked file — not its old
  // chunks or settings — so you can pick a new chunkSize/strategy/
  // separators and re-chunk without re-pasting. Deleting a stale chunk-run
  // (if you want to) is a separate action in "Saved runs" below; this
  // never touches chunk-runs.
  async function handleLoadSourceText(sourceLabel: string) {
    setLoadingSourceLabel(sourceLabel);
    setSourcesError(null);
    try {
      const data = await getJSON<{ label: string; text: string }>(
        `/api/rag-lab/source-texts?label=${encodeURIComponent(sourceLabel)}`
      );
      setLabel(data.label);
      setText(data.text);
      setChunks(null);
      setChunkError(null);
      setCaching(false);
      setCacheStats(null);
      setCacheError(null);
      setSaved(false);
      setActiveRunId(null);
    } catch (err) {
      setSourcesError((err as Error).message);
    } finally {
      setLoadingSourceLabel(null);
    }
  }

  async function handleDeleteSourceText(sourceLabel: string) {
    try {
      const res = await fetch(`/api/rag-lab/source-texts?label=${encodeURIComponent(sourceLabel)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`delete failed (${res.status})`);
      setSources((prev) => prev?.filter((s) => s.label !== sourceLabel) ?? prev);
    } catch (err) {
      setSourcesError((err as Error).message);
    }
  }

  async function handleLoadRun(id: string) {
    setLoadingRunId(id);
    setLoadRunError(null);
    try {
      const { run } = await getJSON<{ run: RunDetail }>(
        `/api/rag-lab/chunk-runs?id=${encodeURIComponent(id)}`
      );
      setLabel(run.label ?? "");
      setText(run.text);
      setChunkSize(run.options.chunkSize);
      setChunkOverlap(run.options.chunkOverlap);
      setStrategy(run.options.strategy);
      setSeparators(run.options.separators ?? DEFAULT_SEPARATORS);
      setCarryMainHeading(run.options.carryMainHeading ?? false);
      setHeadingPrefixInput((run.options.headingPrefixes ?? []).join(", "));
      setIgnoreHeadingInput((run.options.ignoreHeadingWords ?? []).join(", "));
      setChunks(run.chunks);
      setChunkError(null);
      setCaching(false);
      setCacheStats(null);
      setCacheError(null);
      setSaved(true); // this run is already persisted
      setActiveRunId(id);
    } catch (err) {
      setLoadRunError((err as Error).message);
    } finally {
      setLoadingRunId(null);
    }
  }

  async function handleDeleteRun(id: string) {
    try {
      const res = await fetch(`/api/rag-lab/chunk-runs?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`delete failed (${res.status})`);
      setRuns((prev) => prev?.filter((r) => r.id !== id) ?? prev);
      if (activeRunId === id) setActiveRunId(null);
    } catch (err) {
      setRunsError((err as Error).message);
    }
  }

  async function handlePushRun(id: string) {
    setPushingRunId(id);
    setPushErrorByRunId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await postJSON<{ batchId: string; batchNo: number; count: number }>(
        "/api/rag-lab/push-to-db",
        { runId: id }
      );
      // Re-pulls dbBatchId/dbBatchNo/dbPushedAt from disk rather than
      // guessing them client-side, since push-to-db/route.ts is the one
      // source of truth for what actually landed.
      await loadRuns();
    } catch (err) {
      setPushErrorByRunId((prev) => ({ ...prev, [id]: (err as Error).message }));
    } finally {
      setPushingRunId(null);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const data = await postJSON<{
        results: SearchResultRow[];
        rewrite: { keywords: string | null; semanticQuery: string | null };
        weights?: { bm25: number; semantic: number };
      }>("/api/rag-lab/local-search", {
        query: searchQuery,
        mode: searchMode,
      });
      setSearchResults(data.results);
      setSearchRewrite(data.rewrite);
      setSearchWeights(data.weights ?? null);
    } catch (err) {
      setSearchError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  function moveSeparator(index: number, dir: -1 | 1) {
    setSeparators((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeSeparator(index: number) {
    setSeparators((prev) => prev.filter((_, i) => i !== index));
  }

  function addCustomSeparator() {
    if (!newSepPattern.trim()) return;
    // Prepended: a custom separator is almost always a structural marker
    // the author knows about (e.g. this KB's own divider lines), which
    // should be tried before the generic defaults below it. joinWith
    // defaults to a paragraph break since that's the common case
    // (reconnecting text across a removed section divider).
    setSeparators((prev) => [
      { pattern: newSepPattern, isRegex: newSepIsRegex, label: "Custom", joinWith: "\n\n" },
      ...prev,
    ]);
    setNewSepPattern("");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">RAG lab</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Paste source text and chunk it to validate chunk quality before
          committing to a storage schema. Chunking is free to re-run —
          nothing is cached until you review the chunks and click Save,
          which embeds + persists them locally (
          <code className="font-mono">.rag-lab-cache/</code>). Nothing is
          written to Supabase here yet. Dev-only route.
        </p>
      </header>

      <section className="sticky top-0 z-20 -mx-6 border-b border-neutral-200 bg-white/95 px-6 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex items-center gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="Search all saved chunks..."
            className="flex-1 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
          <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()} className="h-9">
            {searching ? "Searching..." : "Search"}
          </Button>
          {searchResults && (
            <button
              onClick={() => {
                setSearchResults(null);
                setSearchRewrite(null);
                setSearchWeights(null);
                setSearchQuery("");
                setSearchError(null);
              }}
              className="text-xs text-neutral-500 underline"
            >
              Clear
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-4 text-xs">
          {(
            [
              { value: "bm25", label: "BM25", hint: "keyword match" },
              { value: "semantic", label: "Semantic", hint: "cosine similarity" },
              { value: "hybrid", label: "Hybrid", hint: "RRF of both" },
            ] as const
          ).map((opt) => (
            <label key={opt.value} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="search-mode"
                value={opt.value}
                checked={searchMode === opt.value}
                onChange={() => setSearchMode(opt.value)}
              />
              {opt.label} <span className="text-neutral-500">({opt.hint})</span>
            </label>
          ))}
        </div>
        {searchError && <p className="mt-1 text-xs text-red-500">{searchError}</p>}
      </section>

      {searchResults && (
        <section className="space-y-3">
          {searchRewrite && (
            <div className="rounded border border-neutral-200 bg-neutral-50 p-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
              <span className="font-medium">Rewritten by LLM — </span>
              BM25 keywords: {searchRewrite.keywords ? `"${searchRewrite.keywords}"` : "(used raw query)"}
              {" · "}
              Semantic query:{" "}
              {searchRewrite.semanticQuery ? `"${searchRewrite.semanticQuery}"` : "(used raw query)"}
              {searchWeights && (
                <>
                  {" · "}
                  Fusion weights: BM25 {searchWeights.bm25.toFixed(1)}, Semantic{" "}
                  {searchWeights.semantic.toFixed(1)}
                  {searchWeights.bm25 < 1 && " (keywords discounted — query too abstract for BM25)"}
                </>
              )}
            </div>
          )}
          <h2 className="font-medium">
            Search results{" "}
            <span className="font-normal text-neutral-500">({searchResults.length})</span>
          </h2>
          {searchResults.length === 0 && (
            <p className="text-sm text-neutral-500">
              No saved chunks match that query (after stripping stopwords).
            </p>
          )}
          <div className="space-y-2">
            {searchResults.map((r) => (
              <div
                key={`${r.runId}-${r.chunkIndex}`}
                className="rounded border border-neutral-200 dark:border-neutral-800 p-3 text-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-neutral-900 px-1.5 py-0.5 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
                    #{r.rank}
                  </span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500 dark:bg-neutral-800">
                    score {r.score.toFixed(3)}
                  </span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500 dark:bg-neutral-800">
                    {r.runLabel ?? "(untitled)"}
                  </span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500 dark:bg-neutral-800">
                    chunk #{r.chunkIndex}
                  </span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500 dark:bg-neutral-800">
                    {r.charCount} chars
                  </span>
                  {r.bm25Rank !== undefined && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500 dark:bg-neutral-800">
                      BM25 {r.bm25Rank ? `#${r.bm25Rank}` : "—"}
                    </span>
                  )}
                  {r.semanticRank !== undefined && (
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-500 dark:bg-neutral-800">
                      Semantic {r.semanticRank ? `#${r.semanticRank}` : "—"}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap font-mono text-xs">{r.content}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <label className="block text-sm">
          Filename / label{" "}
          <span className="text-neutral-500">
            (optional — but set it to save this file&apos;s text under &quot;Files&quot; below, so
            you can re-chunk with new settings later without re-pasting)
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Course Training Schedule.txt"
            className="mt-1 block w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          placeholder="Paste knowledge-base source text here..."
          className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent p-3 text-sm font-mono"
        />
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            Strategy
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as Strategy)}
              className="ml-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1"
            >
              <option value="recursive">Recursive (ordered separator list)</option>
              <option value="fixed">Fixed-size window</option>
            </select>
          </label>
          <label className="text-sm">
            {strategy === "recursive" ? "Max chunk size (chars)" : "Chunk size (chars)"}
            <input
              type="number"
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
              className="ml-2 w-24 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1"
            />
          </label>
          <label className="text-sm">
            Overlap (chars)
            <input
              type="number"
              value={chunkOverlap}
              onChange={(e) => setChunkOverlap(Number(e.target.value))}
              className="ml-2 w-24 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1"
            />
          </label>
          {strategy === "recursive" && (
            <label className="text-sm">
              Main heading carry
              <select
                value={carryMainHeading ? "on" : "off"}
                onChange={(e) => setCarryMainHeading(e.target.value === "on")}
                className="ml-2 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1"
              >
                <option value="off">Off — this doc has several unrelated top-level sections</option>
                <option value="on">On — one title governs the whole doc</option>
              </select>
            </label>
          )}
          {strategy === "recursive" && (
            <label className="text-sm">
              Sub-heading prefixes
              <input
                type="text"
                value={headingPrefixInput}
                onChange={(e) => setHeadingPrefixInput(e.target.value)}
                placeholder="Category, Step, Part"
                className="ml-2 w-56 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1"
              />
            </label>
          )}
          {strategy === "recursive" && (
            <label className="text-sm">
              Inline-only labels
              <input
                type="text"
                value={ignoreHeadingInput}
                onChange={(e) => setIgnoreHeadingInput(e.target.value)}
                placeholder="Instructor, Student"
                title="Words that must never become a heading, even if they'd otherwise qualify (e.g. ALL-CAPS speaker labels in a dialogue transcript) — keeps every turn from forcing its own chunk"
                className="ml-2 w-56 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1"
              />
            </label>
          )}
          <Button onClick={handleChunk} disabled={chunking || !text.trim()}>
            {chunking ? "Chunking..." : "Chunk"}
          </Button>
        </div>

        {strategy === "recursive" && (
          <div className="space-y-2 rounded border border-neutral-200 dark:border-neutral-800 p-3">
            <p className="text-sm font-medium">
              Separators{" "}
              <span className="font-normal text-neutral-500">
                — tried in order top to bottom; a piece still too big after one is
                re-split with the ones below it
              </span>
            </p>
            <ol className="space-y-1">
              {separators.map((sep, i) => (
                <li key={`${sep.pattern}-${i}`} className="flex items-center gap-2 text-xs">
                  <span className="w-5 text-neutral-500">{i + 1}.</span>
                  <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono dark:bg-neutral-800">
                    {sep.pattern}
                  </code>
                  <span className="text-neutral-500">
                    {sep.isRegex ? "regex" : "literal"}
                    {sep.label !== "Custom" ? ` · ${sep.label}` : ""}
                  </span>
                  <span className="ml-auto flex gap-1">
                    <button
                      onClick={() => moveSeparator(i, -1)}
                      disabled={i === 0}
                      className="rounded border border-neutral-300 px-1.5 disabled:opacity-30 dark:border-neutral-700"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveSeparator(i, 1)}
                      disabled={i === separators.length - 1}
                      className="rounded border border-neutral-300 px-1.5 disabled:opacity-30 dark:border-neutral-700"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeSeparator(i)}
                      className="rounded border border-neutral-300 px-1.5 dark:border-neutral-700"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <input
                value={newSepPattern}
                onChange={(e) => setNewSepPattern(e.target.value)}
                placeholder="Custom separator pattern, e.g. ^-{3,}$"
                className="min-w-56 flex-1 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1 text-xs font-mono"
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={newSepIsRegex}
                  onChange={(e) => setNewSepIsRegex(e.target.checked)}
                />
                Regex
              </label>
              <Button onClick={addCustomSeparator} disabled={!newSepPattern.trim()}>
                Add to top
              </Button>
              <Button onClick={() => setSeparators(DEFAULT_SEPARATORS)}>Reset to defaults</Button>
            </div>
          </div>
        )}

        {chunkError && <p className="text-sm text-red-500">{chunkError}</p>}

        {chunks && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
              <span>{chunks.length} chunks</span>
              <Button
                onClick={handleSave}
                disabled={caching || savingRun || saved}
                className="h-7 px-2 text-xs"
              >
                {caching || savingRun ? "Saving..." : saved ? "Saved" : "Save"}
              </Button>
              {caching && <span>— caching embeddings...</span>}
              {cacheStats && (
                <span>
                  — {cacheStats.cachedCount} cached, {cacheStats.embeddedCount} newly embedded
                </span>
              )}
              {cacheError && <span className="text-red-500">— cache error: {cacheError}</span>}
              {savingRun && <span>— saving run...</span>}
              {saveRunError && <span className="text-red-500">— save error: {saveRunError}</span>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {chunks.map((c) => (
                <div
                  key={c.index}
                  className="flex flex-col rounded border border-neutral-200 dark:border-neutral-800 p-3 text-sm"
                >
                  <div className="mb-2 flex gap-2 text-xs text-neutral-500">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                      #{c.index}
                    </span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                      {c.charCount} chars
                    </span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                      ~{c.approxTokens} tokens
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap font-mono text-xs">{c.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Files</h2>
        <p className="text-sm text-neutral-500">
          Raw text per filename, kept independently of any chunk run. Load one to
          get its text back without its old chunks/settings, then pick new
          separators/size and hit Chunk again.
        </p>
        {sourcesError && <p className="text-sm text-red-500">{sourcesError}</p>}
        {loadingSources && <p className="text-sm text-neutral-500">Loading files...</p>}
        {sources && sources.length === 0 && (
          <p className="text-sm text-neutral-500">
            No files yet — chunk something above with a filename/label set.
          </p>
        )}
        {sources && sources.length > 0 && (
          <ul className="space-y-1.5">
            {sources.map((s) => (
              <li
                key={s.label}
                className="flex items-center gap-2 rounded border border-neutral-200 p-2 text-sm dark:border-neutral-800"
              >
                <button
                  onClick={() => handleLoadSourceText(s.label)}
                  disabled={loadingSourceLabel === s.label}
                  className="flex-1 truncate text-left"
                >
                  <span className="font-medium">{s.label}</span>{" "}
                  <span className="text-neutral-500">
                    — {s.charCount} chars — updated {timeAgo(s.updatedAt)}
                  </span>
                </button>
                <button
                  onClick={() => handleDeleteSourceText(s.label)}
                  className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Saved runs</h2>
        <p className="text-sm text-neutral-500">
          Every &quot;Chunk&quot; click is saved locally. Reload one instead of re-pasting —
          survives a page refresh.
        </p>
        {runsError && <p className="text-sm text-red-500">{runsError}</p>}
        {loadRunError && <p className="text-sm text-red-500">{loadRunError}</p>}
        {loadingRuns && <p className="text-sm text-neutral-500">Loading saved runs...</p>}
        {runs && runs.length === 0 && (
          <p className="text-sm text-neutral-500">No saved runs yet — chunk something above.</p>
        )}
        {runs && runs.length > 0 && (
          <ul className="space-y-1.5">
            {runs.map((r) => (
              <li
                key={r.id}
                className={`flex flex-col gap-1 rounded border p-2 text-sm ${
                  activeRunId === r.id
                    ? "border-neutral-900 dark:border-neutral-100"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleLoadRun(r.id)}
                    disabled={loadingRunId === r.id}
                    className="flex-1 truncate text-left"
                  >
                    <span className="font-medium">{r.label ?? "(untitled)"}</span>{" "}
                    <span className="text-neutral-500">
                      — {r.chunkCount} chunks — {timeAgo(r.createdAt)}
                    </span>
                    {r.dbBatchNo && (
                      <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                        in DB · batch #{r.dbBatchNo} · {timeAgo(r.dbPushedAt!)}
                      </span>
                    )}
                    <span className="block truncate text-xs text-neutral-500">
                      {r.textPreview}
                    </span>
                  </button>
                  <button
                    onClick={() => handlePushRun(r.id)}
                    disabled={pushingRunId === r.id}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                  >
                    {pushingRunId === r.id ? "Pushing..." : r.dbBatchNo ? "Re-push" : "Push to DB"}
                  </button>
                  <button
                    onClick={() => handleDeleteRun(r.id)}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                  >
                    Delete
                  </button>
                </div>
                {pushErrorByRunId[r.id] && (
                  <p className="text-xs text-red-500">— push error: {pushErrorByRunId[r.id]}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
