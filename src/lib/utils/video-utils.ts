import type { RankedResult } from '@/lib/rag/retrieval';

// The curated video library (video_media) as one retrievable item type,
// same split as chunks-utils.ts: this file owns the video-specific shapes
// and the pure row -> ranked-item mapping; the actual RPC calls
// (lib/actions/video-actions.ts) hand the real search work off to
// lib/rag/retrieval's generic keywordSearch()/semanticSearch()/rerank(),
// none of which know videos exist.

export type VideoPlatform = 'youtube' | 'instagram';

export interface RetrievedVideo {
  id: number;
  title: string | null;
  description: string | null;
  videoUrl: string;
  platform: VideoPlatform;
}

export interface VideoRow {
  id: number;
  title: string | null;
  description: string | null;
  video_url: string;
  platform: string;
}

export function toRankedVideos(rows: VideoRow[]): RankedResult<RetrievedVideo>[] {
  return rows.map((row) => ({
    id: String(row.id),
    item: {
      id: row.id,
      title: row.title,
      description: row.description,
      videoUrl: row.video_url,
      platform: row.platform as VideoPlatform,
    },
  }));
}

// Pulls a canonical embeddable id out of whichever of YouTube's three real
// URL shapes the sheet happened to use (watch?v=, youtu.be/, and
// youtube.com/shorts/ -- a Short embeds exactly like a normal video, same
// /embed/<id> endpoint) -- the video player needs this, the DB/search
// layer above never does. Null for anything it doesn't recognize (e.g. an
// Instagram link, or a malformed one), which the player treats as "can't
// embed this one."
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([^&?/]+)/,
    /youtu\.be\/([^&?/]+)/,
    /youtube\.com\/shorts\/([^&?/]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Instagram's own documented embed convention: appending /embed/ to a
// post/reel's permalink serves the same embeddable content their
// blockquote+embed.js widget ends up loading into an iframe anyway --
// just as a plain iframe src, so the video player can set its own fixed
// height instead of waiting on that widget's script to size it (which
// it does to fit its own header/icon-row chrome, not to the dimensions a
// consistent gallery grid actually needs). Query params (tracking params
// like ?psln=...) are stripped first -- harmless to the real page, but
// not meaningful on the embed path.
export function toInstagramEmbedUrl(url: string): string {
  const withoutQuery = url.split('?')[0];
  const withTrailingSlash = withoutQuery.endsWith('/') ? withoutQuery : `${withoutQuery}/`;
  return `${withTrailingSlash}embed/`;
}
