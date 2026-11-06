// Shorthand for a chat message's own timestamp -- deliberately not a
// generic "time ago" library's minute/hour granularity (nothing here
// needs to say "3 minutes ago"): today shows the actual clock time,
// the past week shows which day plus the time, and anything further
// back shrinks to the coarsest unit that still reads naturally, since
// the exact hour of something from 3 weeks ago isn't useful to know.
//
// now is a parameter (not always `new Date()` internally) so this stays
// a pure function callers can test against a fixed instant, same
// reasoning as passing `since` around in token-usage-actions.ts.
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatClock(date: Date): string {
  const hours24 = date.getHours();
  const period = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 || 12;
  return `${pad2(hours12)}:${pad2(date.getMinutes())}${period}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatMessageTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const dayDiff = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / MS_PER_DAY
  );

  // <= 0 (not just === 0) absorbs minor clock skew between client and
  // server rather than showing a message as being from "the future."
  if (dayDiff <= 0) return formatClock(date);
  if (dayDiff <= 6) return `${WEEKDAY_SHORT[date.getDay()]}, ${formatClock(date)}`;
  if (dayDiff <= 13) return `${dayDiff}d ago`;
  if (dayDiff <= 29) return `${Math.floor(dayDiff / 7)}w ago`;
  return `${Math.floor(dayDiff / 30)}mo ago`;
}
