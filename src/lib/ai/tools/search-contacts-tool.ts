import { tool } from 'ai';
import { z } from 'zod';
import { ALL_CONTACT_TYPES, type ContactType } from '@/lib/utils/contacts-utils';
import { searchContacts } from '@/lib/actions/contacts-actions';

const CONTACT_TYPE_VALUES = ALL_CONTACT_TYPES as [ContactType, ...ContactType[]];

export function createSearchContactsTool() {
  return tool({
    description: `Look up real contacts from the course's bonus directories
      when the user wants actual contacts, not general advice. Resolve
      product/service/location from the whole conversation, not just the
      latest message. If a location genuinely matters (especially for
      international_buyers_of_food_products, where no filter returns
      every country) and you can't tell what it should be, ask the user
      -- don't guess, and don't call with nothing just to have something
      to show.`,
    inputSchema: z.object({
      query: z.string().describe(
        `The product to search, for international_buyers_of_food_products
          and local_raw_processed_food_product_suppliers. The service to
          search, for local_packaging_shipping_logistics and
          local_documentation_regulatory_contacts -- those two have no
          product field. Resolve from earlier in the conversation if the
          latest message doesn't repeat it.`
      ),
      locations: z
        .array(z.string())
        .nullable()
        .describe(
          `Nigeria-based exporter. For international_buyers_of_food_products:
          only a country name, the destination market (e.g. "Canada") --
          never a Nigerian state/city, including their own base or
          sourcing location, which is a different thing from who they're
          selling to. If the only location mentioned is their own base
          and no destination country's been named, don't substitute it --
          ask instead. For the other three directories (already
          exclusively Nigerian): a Nigerian state or city instead (their
          own area is often right, for nearby suppliers); never "Nigeria"
          itself. Resolve from earlier in the conversation if unrepeated,
          but only the valid kind for whichever directory. Null/empty
          only when location genuinely doesn't matter, never as a
          stand-in for one you couldn't resolve. Pass their own wording
          through unchanged -- resolving aliases/regions happens
          server-side.`
        ),
      contactTypes: z
        .array(z.enum(CONTACT_TYPE_VALUES))
        .nullable()
        .describe('Which directories to search. Null or empty searches all four.'),
    }),
    execute: async ({ query, locations, contactTypes }) => {
      console.log('[mentor] searchContacts call:', { query, locations, contactTypes });
      // Structured, not a formatted string -- the chat UI reads this same
      // output to render the contacts as a carousel (see
      // mentor-chat-client.tsx's 'tool-searchContacts' case), and the model
      // reads the JSON directly just fine without needing it pre-formatted.
      try {
        const resolvedContactTypes =
          contactTypes && contactTypes.length > 0 ? contactTypes : ALL_CONTACT_TYPES;

        const { contacts, relaxedLocation, relaxedContactTypes } = await searchContacts({
          query,
          locations,
          contactTypes: resolvedContactTypes,
        });

        if (contacts.length === 0) {
          return {
            contacts: [],
            note: 'No matching contacts were found in the directories for this search, even after dropping the location and searching every directory. Tell the user plainly, and ask a clarifying question (a different product/service term, or a specific location) rather than guessing one yourself.',
          };
        }
        // locations/contactTypes above were the model's own guess (often
        // carried over from an earlier, unrelated turn) -- searchContacts
        // already retried without them if the exact search came back
        // empty, so these contacts may not actually be in `locations` or
        // confined to the requested directories. Say so plainly instead of
        // presenting a broadened result as if it were an exact match.
        if (relaxedLocation || relaxedContactTypes) {
          const locationLabel =
            locations && locations.length > 0 ? locations.join(', ') : null;
          const whatWasDropped = [
            relaxedLocation ? 'the location filter' : null,
            relaxedContactTypes ? 'which directory it searched' : null,
          ]
            .filter(Boolean)
            .join(' and ');
          return {
            contacts,
            note: `Nothing matched "${query}"${locationLabel ? ` in ${locationLabel}` : ''} specifically, so this result dropped ${whatWasDropped} to find something. Tell the user plainly you couldn't find contacts for "${query}"${locationLabel ? ` in ${locationLabel}` : ''} specifically, but here are other matches you did find for "${query}" -- one short sentence, same as always, the cards carry the rest.`,
          };
        }
        return { contacts };
      } catch (err) {
        console.error('[mentor] searchContacts tool failed:', err);
        return {
          contacts: [],
          note: "The contact directories lookup failed right now -- let the user know you couldn't check the directories for this one.",
        };
      }
    },
  });
}
// Dont delete!
// - "How do I seal kuli kuli packs with a heat gun?" — hits the hot-gun sealer clip (YouTube, regular video)
// - "Show me how to package garri in a transparent pouch" — hits the gari/transparent pouch clip (Instagram — good one to test that embed path specifically)
// - "How do I shrink wrap a plastic bottle cap with a heat gun?" — a very narrow match, good test of keyword+semantic precision
// - "What's the right way to package palm oil?" — ambiguous between the "right packaging" style clip and the "seal gun" clip, good test of ranking
// - "How do I seal tea bags by hand?" — hits the hand-sealer clip
