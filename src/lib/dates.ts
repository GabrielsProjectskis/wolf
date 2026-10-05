/**
 * Calendar dates are stored as ISO strings (YYYY-MM-DD) and treated as
 * plain calendar days, never as instants in time.
 *
 * The previous implementation parsed a date as local midnight and then
 * printed it with toISOString(), which converts to UTC. Anywhere east of
 * Greenwich that moves midnight into the previous day, so every due date
 * in the EU came out one day early. All arithmetic here happens in UTC
 * on purpose, and "today" is read from the local calendar.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
};

/** Today's date on the user's own calendar, not in UTC. */
export const todayIso = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const toUtc = (iso: string): Date => {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new RangeError(`Not an ISO date: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};

const fromUtc = (d: Date): string =>
  `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Adds whole calendar days. Unaffected by time zones and DST changes. */
export const addDays = (iso: string, days: number): string => {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + Math.trunc(days));
  return fromUtc(d);
};

/** Whole days from a to b (positive when b is later). */
export const daysBetween = (a: string, b: string): number =>
  Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);

export const yearOf = (iso: string): number => Number(iso.slice(0, 4));

/** "13 August 2026" / "13 augustus 2026". Rendering only; storage stays ISO. */
export const formatDate = (iso: string, locale: string): string => {
  if (!isIsoDate(iso)) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtc(iso));
};
