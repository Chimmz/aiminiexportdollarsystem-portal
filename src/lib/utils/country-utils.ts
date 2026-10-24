// Country-name/alias/region resolution for search-contacts-tool.ts's
// `locations` argument -- split out of contacts-utils.ts since this is
// its own concern (country name normalization) rather than a contacts-
// domain shape, and nothing here touches ContactCard, directory rows, or
// the DB. See contacts-actions.ts's searchContacts for the one call site.

// Hand-picked, deliberately scoped to just the countries actually in
// international_buyer_contacts right now (see contacts-actions.ts's
// getKnownCountries) -- NOT a general-purpose "every alias for every
// country on Earth" table, which is exactly the kind of thing that's
// always missing an entry someone forgot. A real destination list this
// small (currently 51 countries, see the directory) is small enough to
// review by eye and keep complete; it only needs a new line the rare time
// a brand-new destination country gets added on a re-ingest. Countries
// with no common informal alternate name (e.g. "Germany", "India") simply
// aren't in this table -- the exact-match fallback in resolveLocationTerm
// below handles those.
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'United States',
  us: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  america: 'United States',
  'united states of america': 'United States',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  britain: 'United Kingdom',
  'great britain': 'United Kingdom',
  england: 'United Kingdom',
  gb: 'United Kingdom',
  uae: 'United Arab Emirates',
  'u.a.e.': 'United Arab Emirates',
  emirates: 'United Arab Emirates',
  holland: 'Netherlands',
  czechia: 'Czech Republic',
  'hong-kong': 'Hong Kong',
  hongkong: 'Hong Kong',
  russia: 'Russia',
  'russian federation': 'Russia',
  's. africa': 'South Africa',
  's africa': 'South Africa',
  ksa: 'Saudi Arabia',
  saudi: 'Saudi Arabia',
  turkiye: 'Turkey',
  türkiye: 'Turkey',
  prc: 'China',
  "people's republic of china": 'China',
  iom: 'Isle of Man',
};

// Common-usage regions, not a strict geopolitical atlas -- picked for what
// a user would plausibly mean by "Europe" or "the Middle East" in a
// casual message, not transcontinental precision. A country can carry
// more than one tag (e.g. Turkey reads as both). Same scoping rule as
// COUNTRY_ALIASES above: only the 51 countries actually in the directory
// today, revisited on the same re-ingest cadence.
const COUNTRY_REGIONS: Record<string, string[]> = {
  Albania: ['Europe'],
  Armenia: ['Europe', 'Asia'],
  Austria: ['Europe'],
  Azerbaijan: ['Europe', 'Asia'],
  Belgium: ['Europe'],
  Bulgaria: ['Europe'],
  Croatia: ['Europe'],
  Cyprus: ['Europe'],
  'Czech Republic': ['Europe'],
  Denmark: ['Europe'],
  Estonia: ['Europe'],
  Finland: ['Europe'],
  France: ['Europe'],
  Germany: ['Europe'],
  Greece: ['Europe'],
  'Isle of Man': ['Europe'],
  Hungary: ['Europe'],
  Ireland: ['Europe'],
  Italy: ['Europe'],
  Latvia: ['Europe'],
  Lithuania: ['Europe'],
  Luxembourg: ['Europe'],
  Netherlands: ['Europe'],
  Norway: ['Europe'],
  Poland: ['Europe'],
  Portugal: ['Europe'],
  Romania: ['Europe'],
  Russia: ['Europe'],
  Serbia: ['Europe'],
  Slovakia: ['Europe'],
  Slovenia: ['Europe'],
  Spain: ['Europe'],
  Sweden: ['Europe'],
  Switzerland: ['Europe'],
  Ukraine: ['Europe'],
  'United Kingdom': ['Europe'],
  China: ['Asia'],
  'Hong Kong': ['Asia'],
  India: ['Asia'],
  Kazakhstan: ['Asia'],
  Singapore: ['Asia'],
  Taiwan: ['Asia'],
  Turkey: ['Asia', 'Middle East'],
  Lebanon: ['Middle East'],
  'Saudi Arabia': ['Middle East'],
  'United Arab Emirates': ['Middle East'],
  'South Africa': ['Africa'],
  Canada: ['Americas'],
  'United States': ['Americas'],
  Australia: ['Oceania'],
};

const REGION_KEYWORDS: Record<string, string> = {
  europe: 'Europe',
  eu: 'Europe',
  'the eu': 'Europe',
  asia: 'Asia',
  'middle east': 'Middle East',
  gulf: 'Middle East',
  gcc: 'Middle East',
  africa: 'Africa',
  americas: 'Americas',
  'north america': 'Americas',
  oceania: 'Oceania',
};

// One raw location term (whatever the model passed straight through from
// the user's own wording) resolved against the real, current
// knownCountries list -- a region keyword expands to every matching known
// country, a recognized alias/abbreviation resolves to its canonical
// DB-stored name, an exact (case-insensitive) country match is
// canonicalized, and anything else (a Nigerian state or city, e.g.
// "Lagos") passes through completely unchanged, since those are matched
// as free-text substrings against state/city fields elsewhere, not
// against this country list at all. This is what replaced asking the
// model to do all of this itself from a country list embedded in the
// tool schema -- see search-contacts-tool.ts.
export function resolveLocationTerm(term: string, knownCountries: string[]): string[] {
  const trimmed = term.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();

  const region = REGION_KEYWORDS[lower];
  if (region) {
    return knownCountries.filter((country) => COUNTRY_REGIONS[country]?.includes(region));
  }

  const alias = COUNTRY_ALIASES[lower];
  if (alias) {
    return knownCountries.includes(alias) ? [alias] : [trimmed];
  }

  const exactMatch = knownCountries.find((country) => country.toLowerCase() === lower);
  if (exactMatch) return [exactMatch];

  return [trimmed];
}

// Applied once, up front, in contacts-actions.ts's searchContacts -- every
// entry in `locations` runs through resolveLocationTerm above, and a
// region expanding into several countries gets flattened into the one
// array matchesAnyLocation (contacts-utils.ts) already knows how to OR
// across. Deduped since two different input terms (e.g. "USA" and
// "America" in the same array, unlikely but possible across a carried-
// over conversation) could resolve to the same country.
export function resolveLocations(
  locations: string[] | null,
  knownCountries: string[]
): string[] | null {
  if (!locations || locations.length === 0) return locations;
  return [...new Set(locations.flatMap((loc) => resolveLocationTerm(loc, knownCountries)))];
}
