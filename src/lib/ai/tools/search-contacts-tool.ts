import { tool, generateText, Output, type ModelMessage } from 'ai';
import { z } from 'zod';
import {
  ALL_CONTACT_TYPES,
  FETCH_CAP,
  MAX_CONTACT_LIMIT,
  type ContactType,
} from '@/lib/utils/contacts-utils';
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
      directories: international buyers abroad, local Nigerian suppliers to
      source from, shipping/packaging/logistics providers, and
      documentation/regulatory paperwork providers. Call this whenever the
      user wants actual contacts, not general advice, such as "who can I
      sell crayfish to", "give me 5 suppliers of palm oil in Lagos", or "who
      can help me with my export license paperwork". The product, service,
      or location being asked about may have been established earlier in
      the conversation rather than repeated in the latest message.`,
    inputSchema: z.object({
      query: z.string().describe(
        `The product or service to search for, e.g. "crayfish", "palm oil",
          "air freight", "packaging materials", "cartons". If the latest message doesn't
          repeat it, resolve it from the rest of the conversation instead of
          guessing or leaving it generic -- a follow-up like "show me 5
          contacts that buy from me" after a message about crayfish still
          means query should be "crayfish".`
      ),
      locations: z
        .array(z.string())
        .nullable()
        .describe(
          `Countries (for international buyers) or Nigerian states/cities
          (for local suppliers, logistics/packaging, or documentation
          providers). Same rule as query -- resolve it from earlier in the
          conversation if it's not in the latest message. Null or an empty
          array if no location applies -- never invent or default to one
          the user didn't actually name; a question like "who buys my
          products abroad?" names no country, so this should be null
          (searching every country), not a guess.

          Pass the user's own wording straight through, including an
          abbreviation, alias, or a region like "Europe" or "Middle East"
          -- resolving that to the exact matching country or countries
          happens on the server, not here.

          local_suppliers, logistics_packaging, and documentation are
          already exclusively Nigerian directories -- every row in them is
          already in Nigeria, there's no row literally tagged "Nigeria".
          So never pass "Nigeria" itself as a location for those. Only pass
          a location for those three when the user names an actual
          Nigerian state or city, e.g. "Lagos" or "Oron".`
        ),
      contactTypes: z
        .array(z.enum(CONTACT_TYPE_VALUES))
        .nullable()
        .describe(
          `Which directories to search: intl_buyers (buyers abroad to sell
            to), local_suppliers (Nigerian suppliers to source from),
            logistics_packaging (shipping, packaging, freight providers),
            and/or documentation (export licenses, CAC/business
            registration, compliance and regulatory paperwork providers).
            Null or an empty list searches all four.`
        ),
      limit: z
        .number()
        .int()
        .nullable()
        .describe(
          `How many contacts to return, only when the user actually asked
            for a specific number, e.g. 5 for "give me 5 contacts". Leave
            this null otherwise -- null means every matching contact is
            returned, not some default handful, so don't invent a number
            just because the field exists.`
        ),
    }),
    execute: async ({ query, locations, contactTypes, limit }) => {
      console.log('[mentor] searchContacts call:', {
        query,
        locations,
        contactTypes,
        limit,
        conversationHistory,
      });
      // Structured, not a formatted string -- the chat UI reads this same
      // output to render the contacts as a carousel (see
      // mentor-chat-client.tsx's 'tool-searchContacts' case), and the model
      // reads the JSON directly just fine without needing it pre-formatted.
      try {
        const resolvedContactTypes =
          contactTypes && contactTypes.length > 0 ? contactTypes : ALL_CONTACT_TYPES;
        // No limit asked for -> return everything that matches (capped only
        // by FETCH_CAP's safety ceiling), not some arbitrary small default.
        const resolvedLimit = limit != null ? Math.min(limit, MAX_CONTACT_LIMIT) : FETCH_CAP;

        let { contacts, relaxedLocation, relaxedContactTypes } = await searchContacts({
          query,
          locations,
          contactTypes: resolvedContactTypes,
          limit: resolvedLimit,
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
              limit: resolvedLimit,
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
