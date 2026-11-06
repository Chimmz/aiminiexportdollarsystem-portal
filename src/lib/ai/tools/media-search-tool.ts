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
      packaging looks like in text. See intent for which of two things
      applies.`,
    inputSchema: z.object({
      intent: z.enum(['product_or_style_example', 'packaging_rules']).describe(
        `"product_or_style_example": the user wants to see a specific
            product's packaging, or a packaging style (pouch, bottle,
            container) in general -- fill product and/or packagingStyle.
            "packaging_rules": the conversation's about general front/back
            label rules, not one product or style -- these pull from a
            different photo set (front+back shots teaching the standard,
            not a finished package look).`
      ),
      product: z
        .string()
        .nullable()
        .describe(
          `The specific product being discussed, resolved from the
            conversation if not in the latest message, e.g. "kilishi".
            Set this even for intent "packaging_rules" (narrows which
            example shows, if one exists). Null if no specific product is
            the focus.`
        ),
      packagingStyle: z
        .string()
        .nullable()
        .describe(
          `The packaging style discussed, e.g. "pouch", "bottle" -- only
            meaningful when product is null (a product's own style shows
            automatically once product is set). Null otherwise.`
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

          return {
            images: [],
            note: 'No packaging-rules reference photos available right now.',
          };
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
