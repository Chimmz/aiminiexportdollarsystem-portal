import { tool } from 'ai';
import { z } from 'zod';
import { retrieveRelatedVideos } from '@/lib/actions/video-actions';

// Short demo clips (hot-gun sealing, flat-bottom pouches, shrink wrap,
// etc.) from the course's curated video library (video_media,
// migration 0023) -- shown as a real inline player in the chat, not
// described in text. A how-to packaging *technique* is exactly the kind
// of thing a 30-second clip teaches better than a paragraph, same
// reasoning as searchMedia for reference photos, just for a hands-on
// process instead of a finished look.
export function createSearchVideosTool() {
  return tool({
    description: `Show a real demo video when the conversation is about
      how to physically do a packaging technique or process (sealing,
      using a heat gun, pouch-filling, shrink-wrapping) -- call this
      instead of only describing the steps in text. Not for what finished
      packaging looks like (that's searchMedia's photos) -- this is for
      how it's actually done.`,
    inputSchema: z.object({
      query: z.string().describe(
        `A clear, self-contained restatement of the technique or product
          in question, e.g. "sealing a pouch with a heat gun" or
          "packaging garri". Resolve from the conversation if the latest
          message doesn't repeat it.`
      ),
    }),
    execute: async ({ query }) => {
      console.log('[mentor] searchVideos call:', { query });
      try {
        const videos = await retrieveRelatedVideos(query);
        if (videos.length === 0) {
          return {
            videos: [],
            note: `No reference video found for "${query}" -- continue with text alone, don't mention the search.`,
          };
        }
        return { videos };
      } catch (err) {
        console.error('[mentor] searchVideos tool failed:', err);
        return {
          videos: [],
          note: "The video library lookup failed right now -- continue without a video, don't mention the failure.",
        };
      }
    },
  });
}
