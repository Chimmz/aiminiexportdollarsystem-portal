import { tool, generateText, Output, type ModelMessage } from 'ai';
import { z } from 'zod';
import { ALL_CONTACT_TYPES, type ContactType } from '@/lib/utils/contacts-utils';
import { searchContacts, getKnownProductVocabulary } from '@/lib/actions/contacts-actions';
import { extractTextHistory } from '@/lib/utils/conversation-utils';
import { queryRewriteModel } from '@/lib/ai/models';

const CONTACT_TYPE_VALUES = ALL_CONTACT_TYPES as [ContactType, ...ContactType[]];

const RegroundedQuerySchema = z.object({
  term: z
    .string()
    .nullable()
    .describe(
      `The single concrete product/material/service term to search for
        next, picked from the real vocabulary list (or a close variant of
        one of its entries) -- never a term that isn't represented there
        in some form. Null if nothing in the conversation or the
        vocabulary list genuinely fits.`
    ),
});

// Runs only when a search has already come back empty after the full
// location/contactTypes relaxation cascade in searchContacts() -- rare by
// construction, so the extra model call doesn't touch the common case
// (concrete queries like "crayfish" never reach this). Fixes a failure
// mode a looser query or dropped filter can't: the model's own `query`
// argument can be too abstract to match anything, e.g. "small-scale
// packaging" when the directories store "Ziploc bags" and "jute bags" as
// separate, concrete rows -- see contacts-utils.ts's getKnownProductVocabulary.
// This is a semantic re-read of the conversation grounded in real stored
// wording, not another guess from the abstract phrase alone: it has to
// resolve which specific thing the user actually settled on (e.g.
// ziplock, not jute, if they picked small-scale over large-scale) and
// then match that against words that actually exist in the data.
async function regroundQueryFromHistory(
  originalQuery: string,
  conversationHistory: string
): Promise<string | null> {
  try {
    const vocabulary = await getKnownProductVocabulary();
    if (vocabulary.length === 0) return null;

    const { output } = await generateText({
      model: queryRewriteModel,
      output: Output.object({ schema: RegroundedQuerySchema }),
      prompt: `A search for "${originalQuery}" against local supplier and
        logistics/packaging contact directories came back with nothing.

        Conversation so far:
        ${conversationHistory}

        Real product/service terms actually stored in those directories (pick
        one of these, or a close variant of one, don't invent a term that isn't
        represented here):
        ${vocabulary.join(', ')}

        Re-read the conversation and work out specifically what this user
        actually settled on, not just anything that was mentioned in passing --
        if they were offered a choice and picked one option, use that option, not
        the one(s) they didn't pick. Then name the one term from the list above
        most likely to match what they settled on.`,
    });
    return output.term;
  } catch (err) {
    console.error('[mentor] searchContacts query reground failed:', err);
    return null;
  }
}

// Same factory shape as search-kb-tool.ts. Unlike that tool,
// conversationHistory here is actually used, two ways: logged, to make a
// specific failure mode visible ("I want to export crayfish to Canada"
// followed by an unqualified "show me 5 contacts that buy from me" needs
// query/location resolved from the first message, not the second -- the
// query/location descriptions below tell the model to do that, this log is
// how to confirm it actually did), and passed into regroundQueryFromHistory
// above, which is a different problem entirely: not "which messages are
// relevant" but "is this search term too abstract to match anything in the
// directory," re-deriving a real vocabulary-matching term when it is.
//
// `messages` is the working-memory-trimmed set by the time it reaches this
// factory (see route.ts's buildWorkingMemoryMessages / getTools call), not
// the full raw conversation -- same bounded recent-window-plus-relevant-
// older-messages window the main model itself answers from, not a wider
// one just for this tool.
//
// Not async anymore -- country alias/abbreviation/region resolution
// ("USA" -> "United States", "Europe" -> every matching known country)
// used to require fetching the full country list here just to spell it
// out in the locations field's description below, costing several
// hundred tokens on every single turn whether or not a location was ever
// mentioned. It's resolved server-side now instead, in
// contacts-actions.ts's searchContacts (see contacts-utils.ts's
// resolveLocations) against that same live list -- the model just passes
// the user's own wording through unchanged.
export function createSearchContactsTool(messages: ModelMessage[]) {
  const conversationHistory = extractTextHistory(messages);

  return tool({
    description: `Look up real contacts from the course's bonus contact
      directories. Call this whenever the user wants actual contacts, not
      general advice. The product, service, or location may have been
      established earlier in the conversation, not just the latest
      message.`,
    inputSchema: z.object({
      query: z.string().describe(
        `The product to search for, for
          international_buyers_of_food_products and
          local_raw_processed_food_product_suppliers. The service to
          search for, for local_packaging_shipping_logistics and
          local_documentation_regulatory_contacts -- those two have no
          product field, only a service description, so a product name
          matches nothing there. Resolve from earlier in the conversation
          if the latest message doesn't repeat it.`
      ),
      locations: z
        .array(z.string())
        .nullable()
        .describe(
          `Countries for international_buyers_of_food_products, or
          Nigerian states/cities for the other three directories, which
          are already exclusively Nigerian -- never pass "Nigeria" itself
          for them. Resolve from earlier in the conversation if the latest
          message doesn't repeat it. Null or empty if no location was
          actually named -- never invent one. Pass the user's own wording
          straight through, including an abbreviation or a region --
          resolving it happens on the server, not here.`
        ),
      contactTypes: z
        .array(z.enum(CONTACT_TYPE_VALUES))
        .nullable()
        .describe('Which directories to search. Null or empty searches all four.'),
    }),
    execute: async ({ query, locations, contactTypes }) => {
      console.log('[mentor] searchContacts call:', {
        query,
        locations,
        contactTypes,
        conversationHistory,
      });
      // Structured, not a formatted string -- the chat UI reads this same
      // output to render the contacts as a carousel (see
      // mentor-chat-client.tsx's 'tool-searchContacts' case), and the model
      // reads the JSON directly just fine without needing it pre-formatted.
      try {
        const resolvedContactTypes =
          contactTypes && contactTypes.length > 0 ? contactTypes : ALL_CONTACT_TYPES;

        let { contacts, relaxedLocation, relaxedContactTypes } = await searchContacts({
          query,
          locations,
          contactTypes: resolvedContactTypes,
        });

        // The DB-side relaxation cascade above only ever loosens filters
        // (location, then contactTypes) -- it can't recover from the query
        // term itself being too abstract to match anything. Try once to
        // reground it against real directory vocabulary before giving up.
        if (contacts.length === 0) {
          const regroundedTerm = await regroundQueryFromHistory(
            query,
            conversationHistory
          );
          if (regroundedTerm && regroundedTerm.toLowerCase() !== query.toLowerCase()) {
            console.log('[mentor] searchContacts query reground:', {
              from: query,
              to: regroundedTerm,
            });
            ({ contacts, relaxedLocation, relaxedContactTypes } = await searchContacts({
              query: regroundedTerm,
              locations,
              contactTypes: resolvedContactTypes,
            }));
          }
        }

        if (contacts.length === 0) {
          return {
            contacts: [],
            note: 'No matching contacts were found in the directories for this search, even after dropping the location, searching every directory, and trying a related term.',
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
