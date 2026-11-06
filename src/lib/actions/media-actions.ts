import { v2 as cloudinary } from 'cloudinary';
import { embedChunks } from '@/lib/rag/embed';
import {
  bm25Search,
  keywordSearch,
  rankBySimilarity,
  rerank,
  semanticSearch,
  tokenize,
  type BM25Doc,
} from '@/lib/rag/retrieval';
import {
  deriveMediaFields,
  MEDIA_FOLDER_PATHS,
  selectDiverseTopMatches,
  type MediaFolder,
  type MediaItem,
} from '@/lib/utils/media-utils';

// Cloudinary is the single source of truth, not a table this app ingests
// into (unlike kb_chunks/contact directories) -- deliberately, since
// these images can be deleted at any time, and a Postgres-stored
// embedding for a since-deleted image would silently go stale. So no
// migration, no admin ingestion UI: every search re-derives its index
// from whatever is actually in Cloudinary right now, just cached
// in-process for a bounded window rather than re-fetched on every turn.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface FolderIndex {
  items: MediaItem[];
  // Parallel to items -- embedding i is items[i]'s. Recomputed whenever
  // the cache refreshes, never persisted, for the same stale-after-
  // deletion reason noted above.
  embeddings: number[][];
  cachedAt: number;
}

const folderIndexCache = new Map<MediaFolder, FolderIndex>();

interface CloudinaryResource {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
}

async function fetchFolderResources(folder: MediaFolder): Promise<CloudinaryResource[]> {
  const prefix = MEDIA_FOLDER_PATHS[folder] + '/';
  // max_results: 500 is the Admin API's own per-call ceiling (pagination
  // via next_cursor beyond that) -- not handled here since both folders
  // combined are under 100 images today; revisit if the library grows
  // into the hundreds.
  const res = await cloudinary.api.resources({
    type: 'upload',
    resource_type: 'image',
    prefix,
    max_results: 500,
  });
  return res.resources as CloudinaryResource[];
}

async function buildFolderIndex(folder: MediaFolder): Promise<FolderIndex> {
  const resources = await fetchFolderResources(folder);
  const items: MediaItem[] = resources.map((r) => {
    const { label, tokens, productKey } = deriveMediaFields(r.public_id, folder);
    return {
      publicId: r.public_id,
      url: r.secure_url,
      width: r.width,
      height: r.height,
      folder,
      label,
      tokens,
      productKey,
    };
  });

  // One batch call for the whole folder, not one embed per image -- same
  // reasoning as rag/embed.ts's embedChunks being batch-first. Only runs
  // once per CACHE_TTL_MS window, not per chat turn.
  const embeddings =
    items.length > 0 ? await embedChunks(items.map((item) => item.tokens.join(' '))) : [];

  return { items, embeddings, cachedAt: Date.now() };
}

async function getFolderIndex(folder: MediaFolder): Promise<FolderIndex> {
  const cached = folderIndexCache.get(folder);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached;

  const index = await buildFolderIndex(folder);
  folderIndexCache.set(folder, index);
  return index;
}

// A query with zero real match (e.g. a product this folder has no photos
// of) still gets a full ranking out of RRF -- cosine similarity never
// hits exactly zero, so semanticSearch always returns *something*, just
// ranked by "least unrelated." Verified live against the real corpus: a
// genuinely unrelated query topped out at 0.20 semantic similarity with
// zero BM25 overlap, while every real match (even a single shared word
// like "pouch") cleared 0.48 semantic or a positive BM25 score.
//
// 0.4, not the 0.3 that first measurement suggested: a product name the
// model wrote with a space ("bitter kola") where the real filename has
// none ("Bitterkola") loses BM25 entirely -- no token overlap at all --
// leaving semantic as the only signal, and unrelated items (palm oil,
// vegetable oil -- other food products) crept to 0.30-0.303 there,
// just over the original floor. When BM25 can confirm the true match,
// unrelated noise stays under 0.27; 0.4 is comfortably above that noise
// band and still well under every real match measured (0.48-0.67), so it
// closes this specific false-positive without a tokenizer-level fix for
// the no-space-vs-space mismatch itself.
//
// Below are a filter, not just a ranking: an item
// that clears neither threshold doesn't just rank lower, it's dropped
// from both lists before fusion, so a genuine non-match returns empty
// instead of RRF's "best of a bad bunch."
const MIN_SEMANTIC_SCORE = 0.4;

// BM25 (literal word overlap against the filename's tokens) + semantic
// (cosine similarity against the same tokens, embedded) fused via
// Reciprocal Rank Fusion -- the exact same three-step recipe
// chunks-actions.ts's retrieveRelatedChunks uses for the training
// material, just over an in-memory folder index instead of a DB RPC
// (rankBySimilarity/bm25Search are the generic, no-index building blocks
// those same primitives expose for exactly this case). Returns every
// item that clears at least one of the two relevance floors above,
// fused-ranked, most relevant first -- callers slice or diversify (see
// selectDiverseTopMatches) however their use case needs.
async function searchFolder(folder: MediaFolder, query: string): Promise<MediaItem[]> {
  const index = await getFolderIndex(folder);
  if (index.items.length === 0) return [];

  const bm25Docs: BM25Doc[] = index.items.map((item, i) => ({
    id: String(i),
    tokens: item.tokens,
  }));

  const [keywordResults, semanticResults] = await Promise.all([
    keywordSearch<MediaItem>(async () =>
      bm25Search(query, bm25Docs)
        .filter((r) => r.score > 0)
        .map((r) => ({ id: r.id, item: index.items[Number(r.id)], score: r.score }))
    ),
    semanticSearch<MediaItem>(query, async (queryEmbedding) =>
      rankBySimilarity(
        queryEmbedding,
        index.items.map((item, i) => ({
          id: String(i),
          vector: index.embeddings[i],
          item,
        }))
      ).filter((r) => (r.score ?? 0) >= MIN_SEMANTIC_SCORE)
    ),
  ]);

  return rerank(keywordResults, semanticResults, { limit: index.items.length });
}

// A specific product is in context -- show that product's own packaging,
// regardless of packaging style. Capped small (not the whole folder):
// several of this course's example products have 5-6 near-duplicate
// shots, and nobody needs to see all of them to get the idea.
export async function getMediaForProduct(product: string, cap = 5): Promise<MediaItem[]> {
  const ranked = await searchFolder('Packaged Products', product);
  return ranked.slice(0, cap);
}

// Filenames can carry Cloudinary processing artifacts that are never a
// real packaging descriptor -- stripped here specifically, not reused
// from media-utils.ts's PACKAGING_VOCABULARY, since that set mixes real
// material words (pouch, bottle, bag) in with presentation/process noise
// for a different purpose (grouping photos by product); this function
// wants the opposite split, keep material words, drop only genuine
// noise.
const FILENAME_NOISE_TOKENS = new Set(['removebg', 'preview', 'front', 'back', 'view']);

// searchKb has no per-product packaging-format coverage (confirmed
// against the real course material -- it just isn't there), so
// search-contacts-tool.ts falls back to this when it needs a specific
// packaging term (e.g. "ziplock") to search the logistics directory
// with, instead of a generic word like "packaging". Resolves it from the
// one place it's genuinely recorded instead: real product packaging
// photos already filed under that product. Finds the closest-matching
// photo for `product`, then returns whatever's left in its filename once
// the product's own name is subtracted out -- "crayfish-ziplock-pack"
// matched against "crayfish" returns "ziplock pack". Not built on
// PACKAGING_VOCABULARY (see FILENAME_NOISE_TOKENS above) -- that list is
// tuned to catch common cases, not guaranteed complete, and a real term
// like "ziplock" isn't in it; subtracting the known product name instead
// works for whatever word is actually there, no vocabulary to maintain.
export async function getPackagingTermForProduct(
  product: string
): Promise<string | null> {
  const ranked = await searchFolder('Packaged Products', product);
  if (ranked.length === 0) {
    console.log('[mentor] getPackagingTermForProduct: no photo matched', { product });
    return null;
  }

  const productTokens = new Set(tokenize(product));
  const leftover = ranked[0].tokens.filter(
    (t) => !productTokens.has(t) && !FILENAME_NOISE_TOKENS.has(t)
  );
  // ' or ', not a plain space: the caller sends this straight into a
  // Postgres websearch_to_tsquery, which ANDs space-separated terms by
  // default -- a two-word leftover like "ziplock pack" would then only
  // match a contact whose offer text happens to contain both words,
  // when really either one alone is a fine signal of the right contact.
  // websearch_to_tsquery recognizes the literal word "or" as its OR
  // operator, so this turns the same leftover into "ziplock or pack".
  const term = leftover.length > 0 ? leftover.join(' or ') : null;
  console.log('[mentor] getPackagingTermForProduct:', {
    product,
    matchedPublicId: ranked[0].publicId,
    matchedTokens: ranked[0].tokens,
    leftover,
    term,
  });
  return term;
}

// A packaging style is in context with no specific product -- show that
// style used across several different products, not several angles of
// the same one. selectDiverseTopMatches does the "one per product first"
// pass; ranked is already the full, relevance-ordered folder so it has
// everything to choose from.
export async function getMediaForPackagingStyle(
  style: string,
  cap = 4
): Promise<MediaItem[]> {
  const ranked = await searchFolder('Packaged Products', style);
  return selectDiverseTopMatches(ranked, cap);
}

// The Packaging Rules folder is small (12 images as of writing) and
// every image in it is already a general front+back labeling-rules
// example, not tied to the user's own product -- so a null/generic topic
// just returns a representative handful as-is, no search needed. A real
// topic (e.g. "tea", "kilishi") still searches normally, in case the
// user's question happens to center on a product this folder has an
// example of.
export async function getPackagingRulesMedia(
  topic: string | null,
  cap = 4
): Promise<MediaItem[]> {
  if (!topic) {
    const index = await getFolderIndex('Packaging Rules');
    return index.items.slice(0, cap);
  }
  const ranked = await searchFolder('Packaging Rules', topic);
  return ranked.slice(0, cap);
}
