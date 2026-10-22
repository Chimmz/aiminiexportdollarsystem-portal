export const starterPrompts = [
  'Draft a follow-up email for a slow-paying buyer',
  'What documents do I need to export from Nigeria?',
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
