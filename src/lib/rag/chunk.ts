export type ChunkStrategy = "fixed" | "recursive";

// A LangChain-style separator: tried in priority order (index 0 first).
// Structural KB dividers (e.g. runs of "─" or "#" of varying length) can't
// be matched as a literal string, so each separator is either a literal
// string or a regex source string.
export interface SeparatorSpec {
  pattern: string;
  isRegex: boolean;
  label: string;
  // What to re-insert between pieces when merging them back up to
  // chunkSize. The text actually matched by `pattern` is discarded (it's
  // often the thing we're trying to remove, e.g. a divider line), so this
  // is a separate, fixed string rather than reusing `pattern`.
  joinWith: string;
  // Marks this separator as a document-structure boundary (a divider or
  // markdown heading, as opposed to a plain text-flow break like blank
  // line/sentence/space) and which heading level it represents by default.
  // "section" for a long divider rule or markdown heading, "list" for a
  // short divider rule (see DEFAULT_SEPARATORS) — real documents often use
  // two different divider lengths for exactly this distinction (e.g. a long
  // "────...────" around "EQUIPMENT AND TOOLS YOU MAY NEED" vs a short
  // "─ ─ ─" around each item under it, like "Dehydrator"). This is only a
  // fallback, though: content signals (ALL-CAPS, a configured prefix) are
  // checked first in classifyHeading and override it when they fire.
  headingLevel?: "section" | "list";
}

export interface ChunkOptions {
  chunkSize: number; // characters
  chunkOverlap: number; // characters
  strategy: ChunkStrategy;
  // Only used by "recursive". Tried in order; a piece that's still too big
  // after splitting on separators[0] is recursively split again using the
  // rest of the list. Falls back to a hard character slice once the list
  // is exhausted. Defaults to DEFAULT_SEPARATORS.
  separators?: SeparatorSpec[];
  // Only used by "recursive". Prepends the document's first heading-shaped
  // line to every chunk as an umbrella title (see extractMainHeading).
  // Off by default: it's a real assumption — that the whole doc nests under
  // one opening heading — which doesn't hold for every file (some have
  // several independent top-level sections, where the first heading is just
  // the first section's, not a title for the rest). Section sub-heading
  // carry is unaffected either way. Defaults to false.
  carryMainHeading?: boolean;
  // Only used by "recursive". Extra sub-heading signal for Title Case
  // list-item headings a document uses consistently (e.g. "Category") that
  // ALL-CAPS detection and divider matching both miss. See
  // matchesHeadingPrefix. Defaults to none.
  headingPrefixes?: string[];
  // Only used by "recursive". The opposite of headingPrefixes: words that
  // must NEVER be treated as a heading even though they'd otherwise qualify
  // (e.g. a short ALL-CAPS speaker label like "INSTRUCTOR:"/"STUDENT:" in a
  // dialogue transcript, which isAllCapsHeading would otherwise promote to
  // a "section"-level heading and use to force a chunk break at every
  // single turn). A line matching one of these stays ordinary body text —
  // still part of the chunk, just not a heading that resets or flushes
  // anything. Defaults to none.
  ignoreHeadingWords?: string[];
}

export interface Chunk {
  index: number;
  content: string;
  charCount: number;
  approxTokens: number;
}

// Order matters: most structural first, most generic (space) last — the
// same reasoning as LangChain's RecursiveCharacterTextSplitter defaults,
// extended with a divider-line regex for KB files that use long runs of
// box-drawing dashes or "#" as section breaks (lengths vary, so this has
// to be a pattern, not a literal string).
// Divider length as a level signal: split into two separators instead of
// one, long before short in priority. A long divider (10+ chars, "────...")
// splits the document into sections first; only *within* a section's body
// does the short divider (3-9 chars, "─ ─ ─") ever get tried, isolating
// list items nested under that section. Picking this by count of divider
// characters (ignoring interspersed single spaces) rather than exact string
// matches a real, consistent authoring convention — long rule for a major
// break, short rule for an item break — without needing it spelled out
// per-document.
export const DEFAULT_SEPARATORS: SeparatorSpec[] = [
  {
    label: "Section divider — long rule (────..., 10+ chars)",
    // Non-capturing group: String.split() with a *capturing* group inserts
    // the captured text into the result array as phantom extra pieces,
    // which — since this separator carries a headingLevel — would get
    // misread as standalone heading lines.
    pattern: "^[-─#=*_](?:\\s?[-─#=*_]){9,}\\s*$",
    isRegex: true,
    joinWith: "\n\n",
    headingLevel: "section",
  },
  {
    label: "Markdown heading (#, ##, ...)",
    pattern: "\\n#{1,6}\\s",
    isRegex: true,
    joinWith: "\n\n",
    headingLevel: "section",
  },
  {
    label: "List-item divider — short rule (─ ─ ─, ---, 3-9 chars)",
    // Allows an optional single space between divider chars so spaced
    // variants like "─ ─ ─" match too, not just a tight run like "---".
    pattern: "^[-─#=*_](?:\\s?[-─#=*_]){2,8}\\s*$",
    isRegex: true,
    joinWith: "\n\n",
    headingLevel: "list",
  },
  { label: "Blank line (paragraph break)", pattern: "\\n{2,}", isRegex: true, joinWith: "\n\n" },
  { label: "Single line break", pattern: "\\n", isRegex: false, joinWith: "\n" },
  { label: "Sentence boundary", pattern: "(?<=[.!?])\\s+", isRegex: true, joinWith: " " },
  { label: "Space", pattern: " ", isRegex: false, joinWith: " " },
];

const approxTokens = (text: string) => Math.ceil(text.length / 4);

// Plain .txt KB files have no markdown syntax to key off of, so a "heading"
// is detected three ways: structurally (a rawPart produced by a separator
// carrying a `headingLevel` — a divider or markdown heading), by content
// (an ALL-CAPS standalone line, e.g. "METHOD 1: FARMERS GROUPS ONLINE" —
// works even with no divider/blank-line structure around it, since body
// prose is never fully uppercase), or by a user-supplied prefix (e.g.
// "Category" for Title Case list-item headings like "Category 4: Popular
// Brands", which are neither all-caps nor long-divider-bound). All three
// still require the base shape check: single line, short enough to be a
// title, not a finished sentence. A heading of any kind ends the previous
// one at its own level the moment it appears — there's no separate "end
// marker" to configure, since the next heading is already the end of the
// last.
const HEADING_MAX_CHARS = 100;

function isHeadingShaped(text: string): boolean {
  if (!text || text.includes("\n")) return false;
  if (text.length > HEADING_MAX_CHARS) return false;
  return !/[.!?]$/.test(text);
}

function isAllCapsHeading(text: string): boolean {
  return /[A-Z]/.test(text) && text === text.toUpperCase();
}

// Word-boundary prefix match so "Category" matches "Category 4: Popular
// Brands" but not "Categorically speaking, ...".
function matchesHeadingPrefix(text: string, prefixes: string[]): boolean {
  const lower = text.toLowerCase();
  return prefixes.some((raw) => {
    const p = raw.trim().toLowerCase();
    if (!p || !lower.startsWith(p)) return false;
    const nextChar = text[p.length];
    return !nextChar || !/[a-z0-9]/i.test(nextChar);
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A "Prefix:" dialogue label — the configured prefix immediately followed
// by a colon (e.g. "Question:", "Speaker:") — is a far stronger signal than
// matchesHeadingPrefix's bare word-boundary match: real prose essentially
// never opens a sentence with "Word:" as a fragment, so unlike a bare
// prefix match, this is safe to trust even when the rest of the line is a
// full, long, question-mark-ending sentence (e.g. a Q&A transcript's
// "Question: ...?" line). matchesHeadingPrefix alone can't catch these,
// since classifyHeading's isHeadingShaped gate rejects anything over
// HEADING_MAX_CHARS or ending in [.!?] before the prefix is ever checked —
// exactly what every real question looks like.
//
// Unlike matchesHeadingPrefix, this can fire for two *different* prefixes
// at two different nesting levels in the same document (e.g. "Q:" bounded
// by a long divider, "Instructor:"/"Student:" bounded only by blank lines
// within it) — the caller decides which case it is per line by passing in
// that line's own structural level, see classifyHeading.
function matchesHeadingPrefixLabel(text: string, prefixes: string[]): boolean {
  return prefixes.some((raw) => {
    const p = raw.trim();
    return p ? new RegExp(`^${escapeRegex(p)}\\s*:`, "i").test(text) : false;
  });
}

// Two heading levels, not one: a "section" heading (divider, markdown, or
// ALL-CAPS — e.g. "CATEGORIES OF EXPORTABLE PRODUCTS") and a "list" heading
// (prefix-matched, e.g. "Category 4: Popular Brands") nested under it. A new
// section starts a new list of items, so it resets the list heading; a new
// list heading doesn't touch the section it belongs to — "Category 3" alone
// is meaningless without knowing it's a category *of exportable products*.
type HeadingLevel = "section" | "list" | null;

// `structuralLevel` is the matching separator's own declared level (see
// DEFAULT_SEPARATORS — long divider/markdown = "section", short divider =
// "list"). Content signals (ALL-CAPS, a configured prefix) are checked
// first and decide whenever they fire, since they're unambiguous; the
// separator's level is only the fallback for a heading with neither signal
// — a plain Title Case line set off purely by a divider's length, with no
// configured prefix for it.
function classifyHeading(
  text: string,
  structuralLevel: HeadingLevel | undefined,
  headingPrefixes: string[],
  ignoreHeadingWords: string[] = []
): HeadingLevel {
  // Still has to be a single line/paragraph either way — this just decides
  // which signal gets to skip the length/punctuation shape check below, not
  // whether a shape check happens at all.
  if (!text || text.includes("\n")) return null;
  // Checked before every other signal, including ALL-CAPS: a configured
  // "never a heading" word (e.g. a dialogue speaker label) must be able to
  // override isAllCapsHeading, which has no way to know a short ALL-CAPS
  // line is meant to stay inline rather than start a new section.
  if (
    ignoreHeadingWords.length &&
    (matchesHeadingPrefixLabel(text, ignoreHeadingWords) || matchesHeadingPrefix(text, ignoreHeadingWords))
  ) {
    return null;
  }
  // A "Prefix:" label inherits the level of whatever separator bounds it
  // (long divider = "section", anything else = "list" — see
  // matchesHeadingPrefixLabel) rather than being hardcoded to "list", so
  // e.g. "Q:" sitting right after a long divider can outrank "Instructor:"/
  // "Student:" turn labels sitting only between blank lines further in,
  // instead of both colliding at the same level.
  if (matchesHeadingPrefixLabel(text, headingPrefixes)) return structuralLevel ?? "list";
  if (!isHeadingShaped(text)) return null;
  if (isAllCapsHeading(text)) return "section";
  if (matchesHeadingPrefix(text, headingPrefixes)) return "list";
  if (structuralLevel) return structuralLevel;
  return null;
}

// The document's own title (e.g. "HOW TO SOURCE FOR FARMERS - INTRODUCTION")
// is just the first heading-shaped line in the whole text. Unlike a section
// sub-heading, it never changes as sections pass — every chunk in the
// document, including a trailing "CLOSING" section, should still carry it.
function extractMainHeading(text: string): string | null {
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  return isHeadingShaped(firstLine) && isAllCapsHeading(firstLine) ? firstLine : null;
}

// Bakes the carried-forward heading(s) directly into the chunk's own
// content (as bracketed prefix lines) rather than adding them as separate
// metadata — so they're embedded as part of the chunk's meaning, with no
// changes needed to Chunk's shape or anything downstream that consumes
// chunk.content. Up to three levels, outermost first: the document title,
// the section heading, the list-item heading. Any may be absent, and a
// level collapses against an outer one it's identical to (e.g. right under
// the title before any section heading appears) so it isn't shown twice.
function withHeading(
  content: string,
  mainHeading: string | null,
  sectionHeading: string | null,
  listHeading: string | null
): string {
  const seen = new Set<string>();
  const headings = [mainHeading, sectionHeading, listHeading].filter((h): h is string => {
    // Whole-line check, not a plain substring prefix: body content starting
    // with the same *word* as the heading (e.g. heading "Oven", content
    // "Oven is for those of you...") would otherwise falsely count as
    // already carrying it and get its bracket suppressed.
    const alreadyPresent = !!h && (content === h || content.startsWith(h + "\n"));
    if (!h || alreadyPresent || seen.has(h)) return false;
    seen.add(h);
    return true;
  });
  if (headings.length === 0) return content;
  return headings.map((h) => `[${h}]`).join("\n") + "\n" + content;
}

function fixedWindows(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const step = Math.max(1, chunkSize - chunkOverlap);
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += step) {
    chunks.push(text.slice(start, start + chunkSize));
    if (start + chunkSize >= text.length) break;
  }
  return chunks;
}

function splitWithSeparator(text: string, sep: SeparatorSpec): string[] {
  const re = sep.isRegex ? new RegExp(sep.pattern, "gm") : sep.pattern;
  return text.split(re);
}

// Picks the first separator that actually occurs in `text` — one that
// doesn't occur (split produces 0-1 pieces) is skipped in favor of the
// next, rather than being treated as "used".
function pickSeparator(
  text: string,
  separators: SeparatorSpec[]
): { sep: SeparatorSpec; rest: SeparatorSpec[] } | null {
  for (let i = 0; i < separators.length; i++) {
    if (splitWithSeparator(text, separators[i]).length > 1) {
      return { sep: separators[i], rest: separators.slice(i + 1) };
    }
  }
  return null;
}

// Splits `text` using the first applicable separator, then merges the
// resulting pieces back up to chunkSize *at this level*, joined with that
// separator's own joiner — carrying chunkOverlap characters into the next
// merged chunk. A piece still too big on its own is recursively re-split
// with the remaining, lower-priority separators. This mirrors LangChain's
// RecursiveCharacterTextSplitter: merging happens once per recursion level,
// using that level's separator, rather than flattening every level (down
// to word or character pieces) into one array and merging it all at the
// end with a single fixed joiner — which would glue e.g. word-level splits
// back together with blank lines instead of spaces.
function recursiveSplit(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
  separators: SeparatorSpec[],
  // The document's title, constant across the whole call tree (see
  // extractMainHeading) — passed down unchanged, never reassigned here.
  mainHeading: string | null = null,
  // The nearest section heading seen so far above this text's position,
  // inherited from the caller and carried into every chunk produced here
  // (and passed further down into recursive calls) until a new one
  // overrides it. This is what makes a heading survive onto *every* chunk
  // of an oversized section, not just the first.
  ambientSectionHeading: string | null = null,
  // The nearest list-item heading (e.g. "Category 4: ..."), same carry
  // behavior as section headings, but reset whenever a new *section*
  // heading appears (see classifyHeading) — a new section starts a new
  // list, so the old list-item heading no longer applies.
  ambientListHeading: string | null = null,
  headingPrefixes: string[] = [],
  ignoreHeadingWords: string[] = []
): string[] {
  if (text.length <= chunkSize) {
    return [withHeading(text, mainHeading, ambientSectionHeading, ambientListHeading)];
  }

  const picked = pickSeparator(text, separators);
  if (!picked) {
    const pieces: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) pieces.push(text.slice(i, i + chunkSize));
    return pieces.map((p) => withHeading(p, mainHeading, ambientSectionHeading, ambientListHeading));
  }

  const { sep, rest } = picked;
  const rawParts = splitWithSeparator(text, sep)
    .map((s) => s.trim())
    .filter(Boolean);

  const result: string[] = [];
  let buffer: string[] = [];
  let currentSectionHeading = ambientSectionHeading;
  let currentListHeading = ambientListHeading;

  const flush = (carryOverlap: boolean) => {
    if (buffer.length === 0) return;
    const merged = buffer.join(sep.joinWith);
    result.push(withHeading(merged, mainHeading, currentSectionHeading, currentListHeading));
    buffer = [];
    if (carryOverlap && chunkOverlap > 0) {
      const overlapText = merged.slice(Math.max(0, merged.length - chunkOverlap));
      if (overlapText) buffer.push(overlapText);
    }
  };

  const applyHeading = (level: HeadingLevel, line: string) => {
    flush(false);
    if (level === "section") {
      currentSectionHeading = line;
      currentListHeading = null;
    } else {
      currentListHeading = line;
    }
  };

  for (let part of rawParts) {
    const level = classifyHeading(part, sep.headingLevel, headingPrefixes, ignoreHeadingWords);
    if (level) {
      // A standalone title line: stop treating it as body content to
      // merge into a chunk, and start carrying it forward as context for
      // whatever comes next, instead.
      applyHeading(level, part);
      continue;
    }

    // A heading can also arrive glued to its own body as one rawPart (e.g.
    // a divider-delimited block: "Category 6: Solid Minerals\n\nLithium,
    // beryl..." as a single piece) when that combined block is short enough
    // to never get recursed into for size reasons — in which case the
    // heading-shaped check above never even looks at just the first line.
    // Peel it off here instead, independent of size, so a short section
    // doesn't silently keep its heading as unbracketed inline text.
    const firstBreak = part.indexOf("\n");
    if (firstBreak !== -1) {
      const firstLine = part.slice(0, firstBreak).trim();
      const firstLineLevel = classifyHeading(firstLine, sep.headingLevel, headingPrefixes, ignoreHeadingWords);
      if (firstLineLevel) {
        applyHeading(firstLineLevel, firstLine);
        part = part.slice(firstBreak).trim();
        if (!part) continue;
      }
    }

    if (part.length > chunkSize) {
      flush(false);
      result.push(
        ...recursiveSplit(
          part,
          chunkSize,
          chunkOverlap,
          rest,
          mainHeading,
          currentSectionHeading,
          currentListHeading,
          headingPrefixes,
          ignoreHeadingWords
        )
      );
      continue;
    }
    const candidateLen = buffer.length
      ? buffer.join(sep.joinWith).length + sep.joinWith.length + part.length
      : part.length;
    if (candidateLen > chunkSize && buffer.length) {
      flush(true);
    }
    buffer.push(part);
  }
  flush(false);

  return result;
}

export function chunkText(text: string, options: ChunkOptions): Chunk[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const raw =
    options.strategy === "fixed"
      ? fixedWindows(clean, options.chunkSize, options.chunkOverlap)
      : recursiveSplit(
          clean,
          options.chunkSize,
          options.chunkOverlap,
          options.separators ?? DEFAULT_SEPARATORS,
          options.carryMainHeading ? extractMainHeading(clean) : null,
          null,
          null,
          options.headingPrefixes ?? [],
          options.ignoreHeadingWords ?? []
        );

  return raw
    .map((content) => content.trim())
    .filter(Boolean)
    .map((content, index) => ({
      index,
      content,
      charCount: content.length,
      approxTokens: approxTokens(content),
    }));
}
