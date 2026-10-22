import { tool, generateText, Output, type ModelMessage } from 'ai';
import { z } from 'zod';
import {
  ALL_CONTACT_TYPES,
  FETCH_CAP,
  MAX_CONTACT_LIMIT,
  type ContactType,
} from '@/lib/utils/contacts-utils';
import {
  searchContacts,
  getKnownCountries,
  getKnownProductVocabulary,
} from '@/lib/actions/contacts-actions';
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

// Same factory shape as answer-question-tool.ts. Unlike that tool,
// conversationHistory here is actually logged (not left wired-but-unused)
// because this tool's whole reason for taking it is to make a specific
// failure mode visible: "I want to export crayfish to Canada" followed by
// an unqualified "show me 5 contacts that buy from me" needs query/
// location resolved from the first message, not the second. The model
// already sees the full conversation when it writes the tool call's
// arguments, so the real fix is the query/location descriptions below
// telling it to do that — this log is how to confirm it actually did.
//
// Async now because the locations field's description needs the real
// country list (see getKnownCountries) so the model can resolve "USA" ->
// "United States" itself before calling the tool, instead of a bare
// substring match failing on every alias/abbreviation nobody hardcoded.
// The same list is also how it expands a region like "Europe" into every
// matching country, since that's an array of countries, not a lookup this
// file hardcodes (see the locations field description below).
export async function createSearchContactsTool(messages: ModelMessage[]) {
  const conversationHistory = extractTextHistory(messages);
  const knownCountries = await getKnownCountries();

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
          `One or more countries (for international buyers) or Nigerian
          states/cities (for local suppliers, logistics/packaging, or
          documentation providers). Same rule as query -- resolve it from
          earlier in the conversation if it's not in the latest message.
          Null or an empty array if no location applies. Never invent or
          default to a location the user didn't actually name, directly or
          earlier in the conversation -- a question like "who buys my
          products abroad?" names no country, so locations should be null
          there (searching every country), not a guess like the United
          States. Guessing a location here is worse than searching
          everything: it silently narrows the search to one wrong place and
          then reports back as if that place meant something.

          local_suppliers, logistics_packaging, and documentation are
          already exclusively Nigerian directories -- every row in them is
          already in Nigeria, there's no row literally tagged "Nigeria".
          So never pass "Nigeria" itself as a location for those. If the
          user just says "in Nigeria" or names no specific place, leave
          locations null for those directories rather than passing the
          country name through -- it won't match anything and only makes
          the search look like it came back empty. Only pass a location
          for those three when the user names an actual Nigerian state or
          city, e.g. "Lagos" or "Oron".

          For international buyers specifically, the directory's country
          values are exactly these, nothing else: ${knownCountries.join(', ')}.
          If the user names a country by an abbreviation, alias, or informal
          name, such as "USA", "US", or "America" for "United States", or
          "UK" for "United Kingdom", resolve it to the exact matching value
          from that list before calling this tool, don't pass the alias
          through as-is.

          If the user names a broader region instead of a single country,
          such as "Europe", "the EU", "Middle East", or "Asia", this array
          is how you express that: pick out every country from the exact
          list above that belongs to that region yourself, using your own
          geography knowledge, and pass each one as its own entry in this
          array. There is no region-to-countries lookup on the other end of
          this tool -- if you pass the word "Europe" through as-is, it
          won't match anything, because no country is literally named
          "Europe". Expand it here instead.`
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
