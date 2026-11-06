'use client';

import {
  extractYouTubeId,
  toInstagramEmbedUrl,
  type RetrievedVideo,
} from '@/lib/utils/video-utils';

// Rendered for the searchVideos tool's output (see
// conversation-messages.tsx's 'tool-searchVideos' case) -- real demo
// clips, playing inline, not described in text or linked out.
//
// Every card renders at the same CARD_HEIGHT, with width derived from its
// own aspect ratio (not the other way around) -- a mixed strip of
// horizontal clips and vertical Shorts/Reels at a shared *width* instead
// produces wildly different heights per card (a vertical clip at the same
// width as a horizontal one is nearly 3x taller), which is exactly what
// read as "wrapping ugly": ragged row heights as the gallery wraps.
// Fixing the height instead and letting width follow is the same trick a
// photo contact sheet uses for mixed-orientation shots.
const CARD_HEIGHT = 380;

function cardWidth(isVertical: boolean): number {
  const ratio = isVertical ? 9 / 16 : 16 / 9;
  return Math.round(CARD_HEIGHT * ratio);
}

function VideoCard({
  video,
  isVertical,
  children,
}: {
  video: RetrievedVideo;
  isVertical: boolean;
  children: React.ReactNode;
}) {
  const width = cardWidth(isVertical);
  return (
    <div className="flex shrink-0 flex-col gap-1.5" style={{ width }}>
      <div
        className="overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10"
        style={{ height: CARD_HEIGHT, width }}
      >
        {children}
      </div>
      {video.title ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">{video.title}</p>
      ) : null}
    </div>
  );
}

// A plain public iframe -- covers Shorts too, same /embed/<id> endpoint
// as a regular video.
function YouTubePlayer({ video }: { video: RetrievedVideo }) {
  const id = extractYouTubeId(video.videoUrl);
  if (!id) return null;

  const isVertical = video.videoUrl.includes('/shorts/');

  return (
    <VideoCard video={video} isVertical={isVertical}>
      <iframe
        src={`https://www.youtube.com/embed/${id}`}
        title={video.title ?? 'Reference video'}
        className="size-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </VideoCard>
  );
}

// toInstagramEmbedUrl's own comment covers why this is a plain iframe
// rather than their blockquote+embed.js widget -- same served content,
// but sized by us instead of by their script. What that content always
// includes (a small header with the poster's name/avatar, and a
// like/comment/share/bookmark icon row) is Instagram's own mandated
// embed chrome, not a parameter this app can turn off -- every reel
// still shows it, the same as every embedded Tweet/X post keeps its own
// branding bar. Reels are reliably vertical, so always treated as such
// (no per-video aspect info to check otherwise).
function InstagramPlayer({ video }: { video: RetrievedVideo }) {
  return (
    <VideoCard video={video} isVertical>
      <iframe
        src={toInstagramEmbedUrl(video.videoUrl)}
        title={video.title ?? 'Reference video'}
        className="size-full"
        allow="autoplay; encrypted-media"
      />
    </VideoCard>
  );
}

export function VideoGalleryPanel({ videos }: { videos: RetrievedVideo[] }) {
  if (videos.length === 0) return null;

  return (
    <div className="not-prose flex flex-wrap items-start gap-3 py-2">
      {videos.map((video) =>
        video.platform === 'youtube' ? (
          <YouTubePlayer key={video.id} video={video} />
        ) : (
          <InstagramPlayer key={video.id} video={video} />
        )
      )}
    </div>
  );
}
