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

// "Today, 4:12 PM" / "Yesterday, 4:12 PM" / "Oct 28" (same year) /
// "Oct 28, 2025" (older) -- used by dashboard-home-client.tsx's "Continue
// where you left off" card to show when the most recent mentor message
// was sent, without a full timestamp library for just this one spot.
export function formatRecentTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}
