import { formatMonthYear } from './date-utils';

// The four bonus contact directories (see supabase/migrations/
// 0003_contact_directories.sql) as one searchable surface. The actual
// queries live in lib/actions/contacts-actions.ts -- this file is just the
// shared shapes (ContactType, ContactCard) and the pure transforms over
// them (row -> card mapping, location matching, the model-facing summary),
// none of which touch the database themselves.

// Named for exactly what each directory is, not a short code -- a vague
// name like "local_suppliers" or "logistics_packaging" left the model
// guessing by surface wording ("supplier" -> local_suppliers even for a
// packaging-materials request, which actually lives in the logistics
// directory). A self-explanatory name removes that whole class of
// mistake instead of trying to prompt-engineer around it.
export type ContactType =
  | 'international_buyers_of_food_products'
  | 'local_raw_processed_food_product_suppliers'
  | 'local_packaging_shipping_logistics'
  | 'local_documentation_regulatory_contacts';

export const ALL_CONTACT_TYPES: ContactType[] = [
  'international_buyers_of_food_products',
  'local_raw_processed_food_product_suppliers',
  'local_packaging_shipping_logistics',
  'local_documentation_regulatory_contacts',
];

// A technical safety ceiling on the raw DB fetch, not a product-visible
// limit -- searchContacts always returns every matching contact, no
// partial/capped results, ever. This only exists so a single query can't
// pull an unbounded number of rows if a directory ever grows far past
// today's size.
export const FETCH_CAP = 2000;

function includesCaseInsensitive(haystack: string | null, needle: string): boolean {
  return Boolean(haystack) && haystack!.toLowerCase().includes(needle.toLowerCase());
}

function matchesAny(fields: (string | null)[], needle: string): boolean {
  const trimmed = needle.trim();
  if (!trimmed) return true;
  return fields.some((f) => includesCaseInsensitive(f, trimmed));
}

// A row matches if ANY requested location matches ANY of its location
// fields -- "Europe" arrives here as every individual European country
// country-utils.ts's resolveLocations expanded it into, not as one term,
// so this is an OR across the whole array, not an AND. Used by
// contacts-actions.ts to filter rows in JS after the DB-side text search
// has already narrowed things down.
export function matchesAnyLocation(
  fields: (string | null)[],
  locations: string[] | null
): boolean {
  if (!locations || locations.length === 0) return true;
  return locations.some((loc) => matchesAny(fields, loc));
}

// A products/service/offer cell is itself a delimited list, e.g. "Cartons
// | Ziploc bags | Dehydrators" (see the pipe-separated badge rendering in
// tools-ui/contacts-carousel.tsx) -- split and dedupe into individual
// terms instead of handing back whole raw cells. Used by
// summarizeContactsForModel below.
export function splitVocabularyTerms(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[|,;/]+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

// One normalized shape across all three directories, so both the model
// (reading this as the tool result) and the chat UI (rendering it as a
// carousel, see src/components/tools-ui/contacts-carousel.tsx) have a
// single structure to work with instead of three different ones.
export interface ContactCard {
  type: ContactType;
  name: string;
  location: string | null;
  summary: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  priceNote: string | null;
  extra: string | null;
}

export interface IntlBuyerRow {
  part: string | null;
  country: string | null;
  buyer_type: string | null;
  name_or_company: string | null;
  contact_person: string | null;
  job_title: string | null;
  place_or_address: string | null;
  phones: string | null;
  emails: string | null;
  website: string | null;
  instagram: string | null;
  products: string | null;
  notes: string | null;
}

export interface LocalSupplierRow {
  supplier_group: string | null;
  supplier: string | null;
  city: string | null;
  state: string | null;
  products: string | null;
  phone_1: string | null;
  phone_2: string | null;
  email: string | null;
  social: string | null;
  price_listed: string | null;
  price_month: string | null;
  minimum_order: string | null;
  delivery_note: string | null;
  last_listed: string | null;
}

export interface LogisticsRow {
  service: string | null;
  name: string | null;
  state: string | null;
  place: string | null;
  offer: string | null;
  price_noted: string | null;
  month_posted: string | null;
  phones: string | null;
  email: string | null;
}

// Same shape as LogisticsRow -- documentation_contacts (migration 0008)
// mirrors shipping_logistics_contacts column for column, since it's the
// same kind of listing: a provider, what they offer, and how to reach
// them. Kept as its own type/table instead of folding into
// logistics_packaging because "moving/packing goods" and "paperwork that
// makes the export legal" are different enough needs that a user asking
// for one usually isn't asking for the other.
export type DocumentationRow = LogisticsRow;

export function toIntlBuyerCard(row: IntlBuyerRow): ContactCard {
  return {
    type: 'international_buyers_of_food_products',
    name: row.name_or_company ?? 'Unnamed contact',
    location: row.country,
    summary: row.products ? `Buys: ${row.products}` : row.buyer_type,
    phone: row.phones,
    email: row.emails,
    website: row.website,
    instagram: row.instagram,
    priceNote: null,
    extra:
      [
        row.contact_person
          ? `Contact: ${row.contact_person}${row.job_title ? `, ${row.job_title}` : ''}`
          : null,
        row.place_or_address,
        row.notes,
      ]
        .filter(Boolean)
        .join(' | ') || null,
  };
}

export function toLocalSupplierCard(row: LocalSupplierRow): ContactCard {
  return {
    type: 'local_raw_processed_food_product_suppliers',
    name: row.supplier ?? 'Unnamed supplier',
    location: [row.city, row.state].filter(Boolean).join(', ') || null,
    summary: row.products ? `Supplies: ${row.products}` : row.supplier_group,
    phone: [row.phone_1, row.phone_2].filter(Boolean).join(' / ') || null,
    email: row.email,
    website: null,
    instagram: row.social,
    priceNote: row.price_listed
      ? `${row.price_listed}${row.price_month ? ` (as of ${formatMonthYear(row.price_month)})` : ''}`
      : null,
    extra:
      [
        row.minimum_order ? `Minimum order: ${row.minimum_order}` : null,
        row.delivery_note,
        row.last_listed ? `Last listed ${formatMonthYear(row.last_listed)}` : null,
      ]
        .filter(Boolean)
        .join(' | ') || null,
  };
}

export function toLogisticsCard(row: LogisticsRow): ContactCard {
  return {
    type: 'local_packaging_shipping_logistics',
    name: row.name ?? 'Unnamed provider',
    location: [row.place, row.state].filter(Boolean).join(', ') || null,
    summary: row.offer ?? row.service,
    phone: row.phones,
    email: row.email,
    website: null,
    instagram: null,
    priceNote: row.price_noted
      ? `${row.price_noted}${row.month_posted ? ` (as of ${formatMonthYear(row.month_posted)})` : ''}`
      : null,
    extra: row.offer && row.service ? `Service: ${row.service}` : null,
  };
}

export function toDocumentationCard(row: DocumentationRow): ContactCard {
  return {
    type: 'local_documentation_regulatory_contacts',
    name: row.name ?? 'Unnamed provider',
    location: [row.place, row.state].filter(Boolean).join(', ') || null,
    summary: row.offer ?? row.service,
    phone: row.phones,
    email: row.email,
    website: null,
    instagram: null,
    priceNote: row.price_noted
      ? `${row.price_noted}${row.month_posted ? ` (as of ${formatMonthYear(row.month_posted)})` : ''}`
      : null,
    extra: row.offer && row.service ? `Service: ${row.service}` : null,
  };
}

// What the model gets to see of a searchContacts result for the REST of
// the conversation, in place of the real contacts array -- see route.ts's
// prepareStep, which swaps this in right before every step after the
// tool call. The chat UI never sees this: it reads the full ContactCard[]
// straight off the tool-output-available stream event, which already
// happened before prepareStep ever runs.
//
// This exists because telling the model "don't list the contacts in
// text" was not reliable enough on its own -- a cheaper model, given the
// full names/phones/emails in its own context right next to a card it
// knows renders them, still echoed them back as a bulleted recap often
// enough to be a real, repeated bug. Removing the literal data from what
// the model reads removes its ability to do that, the same way a person
// can't recite a phone number they were never shown. It's left with only
// what it actually needs to write one honest framing sentence: how many,
// where, and roughly what.
export interface ContactsSummaryForModel {
  count: number;
  locations: string[];
  products: string[];
  note: string;
}

const SUMMARY_LOCATIONS_CAP = 10;
const SUMMARY_PRODUCTS_CAP = 10;

export function summarizeContactsForModel(
  contacts: ContactCard[]
): ContactsSummaryForModel {
  const locations = [
    ...new Set(contacts.map((c) => c.location).filter((l): l is string => Boolean(l))),
  ].slice(0, SUMMARY_LOCATIONS_CAP);

  const products = [
    ...new Set(
      contacts.flatMap((c) =>
        splitVocabularyTerms(c.summary?.replace(/^[^:]+:\s*/, '') ?? null)
      )
    ),
  ].slice(0, SUMMARY_PRODUCTS_CAP);

  return {
    count: contacts.length,
    locations,
    products,
    note: `The ${contacts.length} actual contacts (names, phone numbers, emails, prices) are already shown to the user as cards in the UI, deliberately left out of this result so you can't recite them. Don't try to reconstruct or list them out, individually or in a recap. Write one short sentence about what was found using this summary (roughly how many, where, what), then stop.`,
  };
}
