// Okapi BM25 over the chunks already cached locally by the RAG lab — no
// embeddings, no vector math, just lexical term matching. Separate from
// rag/embed.ts/embedding-cache.ts on purpose: this answers "which chunks
// literally mention these words" as a baseline to compare retrieval
// quality against once vector search is wired up, not a replacement for it.

// Standard English stopword list. Stripped from both the query and every
// indexed chunk before scoring: BM25's IDF term already drives a word that
// appears in nearly every chunk toward ~0 weight on its own, but depending
// on the exact IDF variant a term in *more than half* the corpus can push
// IDF negative (actively penalizing a chunk for containing "the"). The IDF
// formula below is the safe, floored Lucene/BM25+ variant so that can't
// happen even without this list — stripping stopwords is extra insurance
// plus a smaller, cleaner vocabulary, not a correctness requirement.
const STOPWORDS = new Set([
  "a","about","above","after","again","against","all","am","an","and","any","are","aren't",
  "as","at","be","because","been","before","being","below","between","both","but","by",
  "can't","cannot","could","couldn't","did","didn't","do","does","doesn't","doing","don't",
  "down","during","each","few","for","from","further","had","hadn't","has","hasn't","have",
  "haven't","having","he","he'd","he'll","he's","her","here","here's","hers","herself","him",
  "himself","his","how","how's","i","i'd","i'll","i'm","i've","if","in","into","is","isn't",
  "it","it's","its","itself","let's","me","more","most","mustn't","my","myself","no","nor",
  "not","of","off","on","once","only","or","other","ought","our","ours","ourselves","out",
  "over","own","same","shan't","she","she'd","she'll","she's","should","shouldn't","so",
  "some","such","than","that","that's","the","their","theirs","them","themselves","then",
  "there","there's","these","they","they'd","they'll","they're","they've","this","those",
  "through","to","too","under","until","up","very","was","wasn't","we","we'd","we'll","we're",
  "we've","were","weren't","what","what's","when","when's","where","where's","which","while",
  "who","who's","whom","why","why's","with","won't","would","wouldn't","you","you'd","you'll",
  "you're","you've","your","yours","yourself","yourselves",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

export interface BM25Doc {
  id: string;
  tokens: string[];
}

export interface BM25Result {
  id: string;
  score: number;
}

const K1 = 1.2; // term-frequency saturation point
const B = 0.75; // strength of length normalization (0 = off, 1 = full)

// Ranks `docs` against `query`. Scores are relative to this call's corpus
// only (IDF is computed fresh from `docs` each time) — not comparable
// across separate searches with a different doc set.
export function bm25Search(query: string, docs: BM25Doc[]): BM25Result[] {
  const queryTerms = Array.from(new Set(tokenize(query)));
  if (queryTerms.length === 0 || docs.length === 0) return [];

  const N = docs.length;
  const termFreqs = docs.map((d) => {
    const freq = new Map<string, number>();
    for (const t of d.tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
    return freq;
  });
  const docLengths = docs.map((d) => d.tokens.length);
  const avgdl = docLengths.reduce((a, b) => a + b, 0) / N || 1;

  // Document frequency per query term: how many chunks contain it at all,
  // independent of how many times — that's what IDF is defined over.
  const idf = new Map<string, number>();
  for (const term of queryTerms) {
    const n = termFreqs.reduce((count, freq) => count + (freq.has(term) ? 1 : 0), 0);
    idf.set(term, Math.log(1 + (N - n + 0.5) / (n + 0.5)));
  }

  return docs
    .map((d, i) => {
      const freq = termFreqs[i];
      const dl = docLengths[i];
      let score = 0;
      for (const term of queryTerms) {
        const f = freq.get(term) ?? 0;
        if (f === 0) continue;
        const numerator = f * (K1 + 1);
        const denominator = f + K1 * (1 - B + (B * dl) / avgdl);
        score += (idf.get(term) ?? 0) * (numerator / denominator);
      }
      return { id: d.id, score };
    })
    .sort((a, b) => b.score - a.score);
}
