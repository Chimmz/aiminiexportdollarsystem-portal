import { tokenize } from '@/lib/rag/retrieval';

// Visual reference media for the mentor chat (see media-actions.ts) --
// product-in-packaging photos and general packaging/labeling-rules
// examples, pulled from Cloudinary's "Exportation Media" folder. This
// file is just the pure shapes and filename-derived matching logic;
// media-actions.ts owns the actual Cloudinary fetch and caching.

// Scoped under this one root -- the same Cloudinary account also holds
// "businesses"/"cities"/"users"/"samples" folders for an unrelated
// project, so every path here is pinned under this prefix, never a bare
// folder name that could collide.
export const MEDIA_ROOT = 'Exportation Media';

export type MediaFolder = 'Packaged Products' | 'Packaging Rules';

export const MEDIA_FOLDER_PATHS: Record<MediaFolder, string> = {
  'Packaged Products': `${MEDIA_ROOT}/Packaged Products`,
  'Packaging Rules': `${MEDIA_ROOT}/Packaging Rules`,
};

export interface MediaItem {
  publicId: string;
  url: string;
  width: number;
  height: number;
  folder: MediaFolder;
  // Human-readable, derived from the filename -- what the gallery UI
  // shows as a caption/alt text, not used for matching itself.
  label: string;
  // Tokenized filename, stopword-stripped -- the BM25 side of matching
  // (see media-actions.ts's searchMedia). Also what's embedded for the
  // semantic side; this file doesn't do any embedding itself (pure, no
  // I/O), that's media-actions.ts's job.
  tokens: string[];
  // Tokens with PACKAGING_VOCABULARY also stripped out -- what's left is
  // treated as "which product this image is of," for diversity grouping
  // (see selectDiverseTopMatches). Heuristic, not a real classification:
  // built by hand against the ~87 filenames actually in this Cloudinary
  // folder as of writing (see fx-actions.ts-style honesty about
  // unverified estimates -- same spirit here, this is a best-effort
  // grouping, not a guarantee). Revisit PACKAGING_VOCABULARY if new media
  // gets added with different presentation-word conventions.
  productKey: string;
}

// Words that describe HOW a product is presented/packaged, not WHAT the
// product is -- stripped out when deriving productKey (below) so two
// filenames for the same product in different packaging shots group
// together, regardless of which of these words each one happens to use.
// Includes real typos observed in the actual data ("desig", "pacakge",
// "pakaging") since those need stripping too, not just the correct
// spelling.
const PACKAGING_VOCABULARY = new Set([
  'package',
  'packaged',
  'packaging',
  'pacakge',
  'pakaging',
  'branded',
  'brand',
  'pouch',
  'bottle',
  'container',
  'containers',
  'design',
  'designs',
  'desig',
  'print',
  'prints',
  'printing',
  'bag',
  'bags',
  'sachet',
  'box',
  'jar',
  'wrap',
  'wrapped',
  'front',
  'back',
  'view',
  'custom',
  'standard',
  'modern',
  'shaped',
  'cover',
  'removebg',
  'preview',
]);

// "Exportation Media/Packaged Products/palm-oil-package-branded-bottle"
// -> "palm oil package branded bottle". Cloudinary's public_id already
// has no extension; this just drops the folder prefix and turns
// separators (hyphens, underscores, spaces -- the raw data uses a mix of
// all three) into plain words.
function stripFolderPrefix(publicId: string, folder: MediaFolder): string {
  const prefix = MEDIA_FOLDER_PATHS[folder] + '/';
  return publicId.startsWith(prefix) ? publicId.slice(prefix.length) : publicId;
}

function toLabel(filenameOnly: string): string {
  return filenameOnly
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deriveMediaFields(
  publicId: string,
  folder: MediaFolder
): Pick<MediaItem, 'label' | 'tokens' | 'productKey'> {
  const filenameOnly = stripFolderPrefix(publicId, folder);
  const tokens = tokenize(filenameOnly);
  const productTokens = tokens.filter((t) => !PACKAGING_VOCABULARY.has(t));
  return {
    label: toLabel(filenameOnly),
    tokens,
    // Sorted so word order in the filename doesn't matter for grouping
    // ("oil palm" and "palm oil" group together); falls back to the full
    // token set on the rare filename that's nothing but packaging words
    // (nothing left to group by otherwise).
    productKey: (productTokens.length > 0 ? productTokens : tokens).sort().join(' '),
  };
}

// "Favor variety across products" (see media-actions.ts's packaging-style
// search): walk `ranked` in its given order (already relevance-sorted by
// the caller) and take the first occurrence of each distinct productKey
// until `cap` is reached. If there aren't enough distinct products to
// fill the cap, a second pass allows repeats (still in relevance order)
// rather than returning fewer than `cap` items just because one product
// dominates the top of the ranking.
export function selectDiverseTopMatches<T extends { productKey: string }>(
  ranked: T[],
  cap: number
): T[] {
  const selected: T[] = [];
  const usedProductKeys = new Set<string>();

  for (const item of ranked) {
    if (selected.length >= cap) break;
    if (usedProductKeys.has(item.productKey)) continue;
    selected.push(item);
    usedProductKeys.add(item.productKey);
  }

  if (selected.length < cap) {
    for (const item of ranked) {
      if (selected.length >= cap) break;
      if (selected.includes(item)) continue;
      selected.push(item);
    }
  }

  return selected;
}
