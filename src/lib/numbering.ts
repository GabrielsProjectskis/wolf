import type { Counter, DocKind, WolfDocument } from "../types";
import { todayIso, yearOf } from "./dates";

/**
 * Invoice numbers must be sequential and gapless; that is a legal
 * requirement across the EU, not a nicety. The counter is therefore
 * only ever advanced by issueNumber(), and only at the moment a
 * document leaves draft. Drafts have no number at all.
 */

export const formatNumber = (counter: Counter, sequence: number): string =>
  `${counter.prefix}${counter.year}-${String(sequence).padStart(counter.pad, "0")}`;

const currentYear = () => yearOf(todayIso());

/** Sequences restart at 1 in a new calendar year. */
export const rollYear = (counter: Counter, year = currentYear()): Counter =>
  counter.year >= year ? counter : { ...counter, year, next: 1 };

/** What the next number will look like, without consuming it. */
export const previewNumber = (counter: Counter, year = currentYear()): string => {
  const rolled = rollYear(counter, year);
  return formatNumber(rolled, rolled.next);
};

export interface IssuedNumber {
  number: string;
  sequence: number;
  counter: Counter;
}

/** Consumes the next number and returns the advanced counter. */
export const issueNumber = (counter: Counter, year = currentYear()): IssuedNumber => {
  const rolled = rollYear(counter, year);
  return {
    number: formatNumber(rolled, rolled.next),
    sequence: rolled.next,
    counter: { ...rolled, next: rolled.next + 1 },
  };
};

/** Highest sequence already issued under this counter's prefix and year. */
export const highestIssued = (documents: WolfDocument[], kind: DocKind, counter: Counter): number => {
  const stem = `${counter.prefix}${counter.year}-`;
  return documents
    .filter((d) => d.kind === kind && d.number?.startsWith(stem) && d.sequence !== null)
    .reduce((max, d) => Math.max(max, d.sequence ?? 0), 0);
};

export const PREFIX_PATTERN = /^[A-Za-z0-9]{0,8}$/;
