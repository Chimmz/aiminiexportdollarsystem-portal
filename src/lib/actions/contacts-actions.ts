import { createServiceClient } from '@/lib/supabase/service';
import {
  ALL_CONTACT_TYPES,
  FETCH_CAP,
  matchesAnyLocation,
  splitVocabularyTerms,
  toIntlBuyerCard,
  toLocalSupplierCard,
  toLogisticsCard,
  toDocumentationCard,
  type ContactType,
  type ContactCard,
} from '@/lib/utils/contacts-utils';
import { resolveLocations } from '@/lib/utils/country-utils';

// The product/service dimension (`query`) is matched with Postgres
// full-text search against each table's generated `search_tsv` column
// (see migration 0007) rather than a plain substring check. A substring
// match is too literal for this data in practice -- a search for
// "cartons" missed a real row whose offer field only said "carton"
// (singular). Stemmed full-text search handles that for free.
//
// Location is still a plain case-insensitive substring filter, applied in
// JS on whatever the text search already narrowed down to -- it's a much
// smaller field (a country name, or a Nigerian state/city). Country
// aliases, abbreviations, and regions ("USA", "Europe") used to be
// resolved by the model itself, fed the entire known-countries list in
// the tool schema to do it -- that cost several hundred prompt tokens on
// every single turn. searchContacts below now resolves them itself via
// country-utils.ts's resolveLocations, against the same live
// getKnownCountries list, before this substring filter ever runs -- see
// that function's own comment for why a hand-scoped alias/region table
// (bounded by the ~51 countries actually in this directory, not every
// country on Earth) is tractable where a general one wouldn't be.
//
// `locations` stays an array, not a single string, because a region like
// "Europe" still expands into several country entries -- just in code
// now (resolveLocations) instead of by the model -- a row matches if ANY
// entry in the array matches.

export interface SearchContactsParams {
  query: string;
  locations: string[] | null;
  contactTypes: ContactType[];
  limit: number;
}

// Cached for the process's lifetime, not per request — the country list
// changes only when the directory is re-ingested (rare, manual), so there
// is no need to hit the DB on every single chat message just to hand the
// model the same list it already saw last time.
let cachedCountries: string[] | null = null;

// The live list resolveLocations (contacts-utils.ts) resolves a region
// against (which of these known countries actually falls in "Europe")
// and validates an alias's canonical target against (so a stale alias
// pointing at a country no longer in the directory never gets returned).
// No longer fed into the tool schema itself -- see search-contacts-tool.ts.
export async function getKnownCountries(): Promise<string[]> {
  if (cachedCountries) return cachedCountries;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('international_buyer_contacts')
    .select('country')
    .limit(FETCH_CAP);
  if (error) throw new Error(`known countries: ${error.message}`);

  const countries = [...new Set((data ?? []).map((row) => row.country).filter((c): c is string => Boolean(c)))];
  countries.sort();
  cachedCountries = countries;
  return countries;
}

// Cached for the process's lifetime, same reason as cachedCountries above
// -- directory content only changes on a manual re-ingest. Used only by
// search-contacts-tool.ts's rare "nothing matched even after the full
// relaxation cascade, try regrounding the query against real vocabulary"
// fallback, not the main tool schema -- this is free-text product/service
// wording, not a small closed set like countries, so it would be too
// noisy to put in front of the model on every single message the way
// getKnownCountries is.
let cachedProductVocabulary: string[] | null = null;

// Capped defensively so this stays bounded in prompt size even if the
// directories grow substantially later -- this is deduped distinct terms,
// not raw rows, so the cap is generous relative to today's ~760 combined
// rows across the two directories it reads from.
const VOCABULARY_CAP = 3000;

// The real, literal product/service wording stored in the two
// sourcing-side directories -- local suppliers and logistics/packaging.
// international_buyer_contacts.products describes buyer demand instead,
// a different axis that isn't useful grounding for "what's actually
// sourceable" questions.
export async function getKnownProductVocabulary(): Promise<string[]> {
  if (cachedProductVocabulary) return cachedProductVocabulary;

  const supabase = createServiceClient();
  const [suppliers, logistics] = await Promise.all([
    supabase.from('local_supplier_contacts').select('products').limit(FETCH_CAP),
    supabase.from('shipping_logistics_contacts').select('service, offer').limit(FETCH_CAP),
  ]);
  if (suppliers.error) throw new Error(`product vocabulary (suppliers): ${suppliers.error.message}`);
  if (logistics.error) throw new Error(`product vocabulary (logistics): ${logistics.error.message}`);

  const terms = new Set<string>();
  for (const row of suppliers.data ?? []) {
    splitVocabularyTerms(row.products).forEach((t) => terms.add(t));
  }
  for (const row of logistics.data ?? []) {
    splitVocabularyTerms(row.service).forEach((t) => terms.add(t));
    splitVocabularyTerms(row.offer).forEach((t) => terms.add(t));
  }

  const vocabulary = [...terms].sort((a, b) => a.localeCompare(b)).slice(0, VOCABULARY_CAP);
  cachedProductVocabulary = vocabulary;
  return vocabulary;
}

async function searchIntlBuyers(
  query: string,
  locations: string[] | null,
  limit: number
): Promise<ContactCard[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('international_buyer_contacts')
    .select(
      'part, country, buyer_type, name_or_company, contact_person, job_title, place_or_address, phones, emails, website, instagram, products, notes'
    );
  if (query.trim()) {
    q = q.textSearch('search_tsv', query.trim(), { type: 'websearch', config: 'english' });
  }

  const { data, error } = await q.limit(locations && locations.length > 0 ? FETCH_CAP : limit);
  if (error) throw new Error(`intl buyer contacts: ${error.message}`);

  return (data ?? [])
    .filter((row) => matchesAnyLocation([row.country], locations))
    .slice(0, limit)
    .map(toIntlBuyerCard);
}

async function searchLocalSuppliers(
  query: string,
  locations: string[] | null,
  limit: number
): Promise<ContactCard[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('local_supplier_contacts')
    .select(
      'supplier_group, supplier, city, state, products, phone_1, phone_2, email, social, price_listed, price_month, minimum_order, delivery_note, last_listed'
    );
  if (query.trim()) {
    q = q.textSearch('search_tsv', query.trim(), { type: 'websearch', config: 'english' });
  }

  const { data, error } = await q.limit(locations && locations.length > 0 ? FETCH_CAP : limit);
  if (error) throw new Error(`local supplier contacts: ${error.message}`);

  return (data ?? [])
    .filter((row) => matchesAnyLocation([row.state, row.city], locations))
    .slice(0, limit)
    .map(toLocalSupplierCard);
}

async function searchLogistics(
  query: string,
  locations: string[] | null,
  limit: number
): Promise<ContactCard[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('shipping_logistics_contacts')
    .select('service, name, state, place, offer, price_noted, month_posted, phones, email');
  if (query.trim()) {
    q = q.textSearch('search_tsv', query.trim(), { type: 'websearch', config: 'english' });
  }

  const { data, error } = await q.limit(locations && locations.length > 0 ? FETCH_CAP : limit);
  if (error) throw new Error(`logistics contacts: ${error.message}`);

  return (data ?? [])
    .filter((row) => matchesAnyLocation([row.state, row.place], locations))
    .slice(0, limit)
    .map(toLogisticsCard);
}

async function searchDocumentation(
  query: string,
  locations: string[] | null,
  limit: number
): Promise<ContactCard[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('documentation_contacts')
    .select('service, name, state, place, offer, price_noted, month_posted, phones, email');
  if (query.trim()) {
    q = q.textSearch('search_tsv', query.trim(), { type: 'websearch', config: 'english' });
  }

  const { data, error } = await q.limit(locations && locations.length > 0 ? FETCH_CAP : limit);
  if (error) throw new Error(`documentation contacts: ${error.message}`);

  return (data ?? [])
    .filter((row) => matchesAnyLocation([row.state, row.place], locations))
    .slice(0, limit)
    .map(toDocumentationCard);
}

// Each selected type is capped at `limit` on its own, then the combined
// list is capped at `limit` again — so a single-type search returns up to
// `limit` results from that type, and a multi-type search returns up to
// `limit` total, favoring whichever types come first in ALL_CONTACT_TYPES
// order when there's overflow.
async function runSearch(
  query: string,
  locations: string[] | null,
  contactTypes: ContactType[],
  limit: number
): Promise<ContactCard[]> {
  const searchesByType: Record<ContactType, () => Promise<ContactCard[]>> = {
    intl_buyers: () => searchIntlBuyers(query, locations, limit),
    local_suppliers: () => searchLocalSuppliers(query, locations, limit),
    logistics_packaging: () => searchLogistics(query, locations, limit),
    documentation: () => searchDocumentation(query, locations, limit),
  };

  const resultsPerType = await Promise.all(contactTypes.map((type) => searchesByType[type]()));
  return resultsPerType.flat().slice(0, limit);
}

export interface SearchContactsResult {
  contacts: ContactCard[];
  // True when these contacts only turned up after dropping a constraint
  // the caller actually asked for -- lets the tool tell the model what
  // got relaxed, so it can say so honestly instead of presenting a
  // broadened result as an exact match.
  relaxedLocation: boolean;
  relaxedContactTypes: boolean;
}

// locations and contactTypes are the model's own best guess at what the
// user meant, carried over from earlier turns when not restated (see
// search-contacts-tool.ts) -- which means they can be wrong in exactly
// the way a guess can be wrong, e.g. still scoped to an unrelated earlier
// search's location or directory. Rather than trying to prompt-engineer
// the model into never getting this wrong, this retries with constraints
// progressively dropped whenever the stricter search comes back empty,
// and reports what it had to drop so the caller can be upfront about it
// instead of silently presenting a broadened result as an exact match.
export async function searchContacts({
  query,
  locations,
  contactTypes,
  limit,
}: SearchContactsParams): Promise<SearchContactsResult> {
  // Resolved once, up front, against the real live country list -- every
  // search attempt below (exact, then the relaxation cascade) works off
  // this resolved array, never the model's raw wording.
  const resolvedLocations = resolveLocations(locations, await getKnownCountries());

  const exact = await runSearch(query, resolvedLocations, contactTypes, limit);
  if (exact.length > 0) {
    return { contacts: exact, relaxedLocation: false, relaxedContactTypes: false };
  }

  const hasLocations = Boolean(resolvedLocations && resolvedLocations.length > 0);
  if (hasLocations) {
    const withoutLocation = await runSearch(query, null, contactTypes, limit);
    if (withoutLocation.length > 0) {
      return { contacts: withoutLocation, relaxedLocation: true, relaxedContactTypes: false };
    }
  }

  const alreadySearchedEveryType = contactTypes.length === ALL_CONTACT_TYPES.length;
  if (!alreadySearchedEveryType) {
    const everyType = await runSearch(query, null, ALL_CONTACT_TYPES, limit);
    if (everyType.length > 0) {
      return { contacts: everyType, relaxedLocation: hasLocations, relaxedContactTypes: true };
    }
  }

  return { contacts: [], relaxedLocation: false, relaxedContactTypes: false };
}
