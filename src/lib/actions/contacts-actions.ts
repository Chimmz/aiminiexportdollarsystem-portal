import { createServiceClient } from '@/lib/supabase/service';
import {
  ALL_CONTACT_TYPES,
  FETCH_CAP,
  matchesAnyLocation,
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

  const countries = [
    ...new Set(
      (data ?? []).map((row) => row.country).filter((c): c is string => Boolean(c))
    ),
  ];
  countries.sort();
  cachedCountries = countries;
  return countries;
}

async function searchIntlBuyers(
  query: string,
  locations: string[] | null
): Promise<ContactCard[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('international_buyer_contacts')
    .select(
      'part, country, buyer_type, name_or_company, contact_person, job_title, place_or_address, phones, emails, website, instagram, products, notes'
    );
  if (query.trim()) {
    q = q.textSearch('search_tsv', query.trim(), {
      type: 'websearch',
      config: 'english',
    });
  }

  const { data, error } = await q.limit(FETCH_CAP);
  if (error) throw new Error(`intl buyer contacts: ${error.message}`);

  return (data ?? [])
    .filter((row) => matchesAnyLocation([row.country], locations))
    .map(toIntlBuyerCard);
}

async function searchLocalSuppliers(
  query: string,
  locations: string[] | null
): Promise<ContactCard[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('local_supplier_contacts')
    .select(
      'supplier_group, supplier, city, state, products, phone_1, phone_2, email, social, price_listed, price_month, minimum_order, delivery_note, last_listed'
    );
  if (query.trim()) {
    q = q.textSearch('search_tsv', query.trim(), {
      type: 'websearch',
      config: 'english',
    });
  }

  const { data, error } = await q.limit(FETCH_CAP);
  if (error) throw new Error(`local supplier contacts: ${error.message}`);

  return (data ?? [])
    .filter((row) => matchesAnyLocation([row.state, row.city], locations))
    .map(toLocalSupplierCard);
}

// Deliberately never filtered by location, unlike the other three
// directories -- most rows here either ship nationwide or simply never
// recorded a state/place at all, and a null field can never satisfy
// matchesAnyLocation (see that function's own comment), so applying the
// usual location filter would silently drop most of this directory the
// moment a user names a city. Searching it nationwide every time is the
// correct behavior for this data, not a fallback -- each card still
// carries whatever location it does have (toLogisticsCard), so nothing is
// hidden from the model or the UI.
async function searchLogistics(query: string): Promise<ContactCard[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('shipping_logistics_contacts')
    .select(
      'service, name, state, place, offer, price_noted, month_posted, phones, email'
    );
  if (query.trim()) {
    q = q.textSearch('search_tsv', query.trim(), {
      type: 'websearch',
      config: 'english',
    });
  }

  const { data, error } = await q.limit(FETCH_CAP);
  if (error) throw new Error(`logistics contacts: ${error.message}`);

  return (data ?? []).map(toLogisticsCard);
}

async function searchDocumentation(
  query: string,
  locations: string[] | null
): Promise<ContactCard[]> {
  const supabase = createServiceClient();
  let q = supabase
    .from('documentation_contacts')
    .select(
      'service, name, state, place, offer, price_noted, month_posted, phones, email'
    );
  if (query.trim()) {
    q = q.textSearch('search_tsv', query.trim(), {
      type: 'websearch',
      config: 'english',
    });
  }

  const { data, error } = await q.limit(FETCH_CAP);
  if (error) throw new Error(`documentation contacts: ${error.message}`);

  return (data ?? [])
    .filter((row) => matchesAnyLocation([row.state, row.place], locations))
    .map(toDocumentationCard);
}

// Each selected type is capped at `limit` on its own, then the combined
// Every selected type is searched in full and the results combined --
// no truncation, no favoring one type over another on overflow. Every
// contact that matches gets shown, every time.
async function runSearch(
  query: string,
  locations: string[] | null,
  contactTypes: ContactType[]
): Promise<ContactCard[]> {
  const searchesByType: Record<ContactType, () => Promise<ContactCard[]>> = {
    international_buyers_of_food_products: () => searchIntlBuyers(query, locations),
    local_raw_processed_food_product_suppliers: () =>
      searchLocalSuppliers(query, locations),
    local_packaging_shipping_logistics: () => searchLogistics(query),
    local_documentation_regulatory_contacts: () => searchDocumentation(query, locations),
  };

  const resultsPerType = await Promise.all(
    contactTypes.map((type) => searchesByType[type]())
  );
  return resultsPerType.flat();
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
}: SearchContactsParams): Promise<SearchContactsResult> {
  // Resolved once, up front, against the real live country list -- every
  // search attempt below (exact, then the relaxation cascade) works off
  // this resolved array, never the model's raw wording.
  const resolvedLocations = resolveLocations(locations, await getKnownCountries());

  const exact = await runSearch(query, resolvedLocations, contactTypes);
  if (exact.length > 0) {
    return { contacts: exact, relaxedLocation: false, relaxedContactTypes: false };
  }

  const hasLocations = Boolean(resolvedLocations && resolvedLocations.length > 0);
  if (hasLocations) {
    const withoutLocation = await runSearch(query, null, contactTypes);
    if (withoutLocation.length > 0) {
      return {
        contacts: withoutLocation,
        relaxedLocation: true,
        relaxedContactTypes: false,
      };
    }
  }

  const alreadySearchedEveryType = contactTypes.length === ALL_CONTACT_TYPES.length;
  if (!alreadySearchedEveryType) {
    // Only widen into international_buyers_of_food_products if the
    // caller actually wanted it -- it's categorically different from the
    // other three (who BUYS from this exporter abroad, not who locally
    // PROVIDES them a product/service/paperwork). The stale/wrong
    // contactType guess this cascade exists to recover from (see this
    // function's own comment) is realistically a mix-up between those
    // three local directories, never a mix-up with buyers -- so a
    // service/supplier search that comes up empty should never widen
    // into a directory of buyers, which could never have answered it
    // anyway.
    const wantedBuyers = contactTypes.includes('international_buyers_of_food_products');
    const widenedTypes = wantedBuyers
      ? ALL_CONTACT_TYPES
      : ALL_CONTACT_TYPES.filter((t) => t !== 'international_buyers_of_food_products');

    const everyType = await runSearch(query, null, widenedTypes);
    if (everyType.length > 0) {
      return {
        contacts: everyType,
        relaxedLocation: hasLocations,
        relaxedContactTypes: true,
      };
    }
  }

  return { contacts: [], relaxedLocation: false, relaxedContactTypes: false };
}
