import { tool } from 'ai';
import { z } from 'zod';
import {
  getMediaForPackagingStyle,
  getMediaForProduct,
  getPackagingRulesMedia,
} from '@/lib/actions/media-actions';

// Visual reference photos from the course's real Cloudinary media library
// (see media-actions.ts/media-utils.ts), shown as actual image cards in
// the chat, not described in text -- packaging/labeling is exactly the
// kind of topic where a real photo teaches something a paragraph can't.
export function createMediaSearchTool() {
  return tool({
    description: `Show real reference photos of product packaging when the
      conversation is actually about packaging, labeling, product design,
      or branding -- call this instead of only describing what good
      packaging looks like in text. Covers two different things, see the
      intent field for which one applies.`,
    inputSchema: z.object({
      intent: z
        .enum(['product_or_style_example', 'packaging_rules'])
        .describe(
          `"product_or_style_example": the user wants to see what a
            specific product's packaging looks like, or what a specific
            packaging style (pouch, bottle, container, etc.) looks like in
            general -- fill product and/or packagingStyle below.
            "packaging_rules": the conversation is about the general rules
            for what information goes on a package (front vs back label
            content, what's required, how to lay it out) -- not about one
            product or style specifically. These pull from two different
            photo sets and shouldn't be mixed up: rules examples are
            front+back label shots meant to teach the general standard,
            product/style examples are just what a finished package looks
            like.`
        ),
      product: z
        .string()
        .nullable()
        .describe(
          `The specific product being discussed, resolved from the
            conversation if not in the latest message, e.g. "kilishi" or
            "palm oil". Set this whenever a specific product is in
            context, even for intent "packaging_rules" (it narrows which
            rules example gets shown, if one for that product exists).
            Null if no specific product is the focus.`
        ),
      packagingStyle: z
        .string()
        .nullable()
        .describe(
          `The packaging style being discussed, e.g. "pouch", "bottle",
            "container" -- only meaningful when product is null (a
            specific product's own packaging style is shown automatically
            once product is set, this field is for "what does a pouch
            look like" with no product in mind). Null otherwise.`
        ),
    }),
    execute: async ({ intent, product, packagingStyle }) => {
      console.log('[mentor] searchMedia call:', { intent, product, packagingStyle });
      try {
        if (intent === 'packaging_rules') {
          const images = await getPackagingRulesMedia(product ?? packagingStyle ?? null);
          if (images.length > 0) return { images };

          // The Packaging Rules folder is only 12 images -- a specific
          // product named here often has no dedicated front+back example
          // in it at all (verified live: "bitterkola" is a real product
          // with real photos in Packaged Products, but zero match in
          // Packaging Rules). Rather than show nothing, fall back to that
          // product's own packaging -- not a generic rules illustration,
          // but still a real, relevant photo, which beats an empty
          // result for a question that was specifically about that
          // product. Only when a product was actually named: a fully
          // generic rules request (no product, no style) already got a
          // representative handful from getPackagingRulesMedia above and
          // never reaches here.
          if (product) {
            const fallbackImages = await getMediaForProduct(product);
            if (fallbackImages.length > 0) return { images: fallbackImages };
          }

          return { images: [], note: 'No packaging-rules reference photos available right now.' };
        }

        if (product) {
          const images = await getMediaForProduct(product);
          if (images.length === 0) {
            return {
              images: [],
              note: `No reference photos found for "${product}" specifically -- don't invent or describe one that isn't shown, just continue without a visual.`,
            };
          }
          return { images };
        }

        if (packagingStyle) {
          const images = await getMediaForPackagingStyle(packagingStyle);
          if (images.length === 0) {
            return {
              images: [],
              note: `No reference photos found for "${packagingStyle}" packaging -- don't invent or describe one that isn't shown, just continue without a visual.`,
            };
          }
          return { images };
        }

        return {
          images: [],
          note: 'Neither a product nor a packaging style was given -- nothing to search for.',
        };
      } catch (err) {
        console.error('[mentor] searchMedia tool failed:', err);
        return {
          images: [],
          note: "The media library lookup failed right now -- continue without a visual, don't mention the failure.",
        };
      }
    },
  });
}
