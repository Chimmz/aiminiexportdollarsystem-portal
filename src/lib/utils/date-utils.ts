// The contact directories (local_supplier_contacts, shipping_logistics_
// contacts, documentation_contacts -- see contacts-utils.ts) store a
// handful of month fields (last_listed, price_month, month_posted) as
// sortable "YYYY-MM" strings. That's the right shape to store, but wrong
// to show -- "2025-10" reads like a sortable key, not something a person
// wrote. This turns it into "Oct 2025" for display.
const YEAR_MONTH = /^(\d{4})-(\d{2})$/;

export function formatMonthYear(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(YEAR_MONTH);
  if (!match) return raw;

  const [, year, month] = match;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
