// The first two used to assume things a brand-new user hasn't gotten to
// yet -- a slow-paying buyer presupposes a buyer at all, and "...from
// Nigeria" is redundant since this course (and Eva) only ever exports from
// Nigeria, never a variable worth asking about.
export const starterPrompts = [
  'Help me decide what to export first',
  'What documents do I need to export?',
  'Help me price a container of raw cashew nuts',
];

// Shown one at a time while Eva's working on a reply, the same spirit as
// Claude Code's own rotating loading word (Thinking, Cooking, Vibing...)
// but themed to this course instead of generic. A mix of real export-world
// verbs and a few playful ones for personality, same register as Eva's own
// voice (see ../../api/mentor/chat/config.ts) -- plainspoken with the odd
// bit of flavor, never corporate.
const LOADING_WORDS = [
  'Sourcing',
  'Pricing',
  'Quoting',
  'Negotiating',
  'Documenting',
  'Customsclearing',
  'Containerizing',
  'Packaging',
  'Branding',
  'Shipping',
  'Buyerhunting',
  'Invoicing',
  'Forexing',
  'Consolidating',
  'Wholesaling',
  'Exporting',
  'Hustling',
  'Letterheading',
  'Nairadodging',
  'Dollarchasing',
];

export function pickLoadingWord(): string {
  return LOADING_WORDS[Math.floor(Math.random() * LOADING_WORDS.length)];
}
