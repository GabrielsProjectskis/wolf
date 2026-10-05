import { CURRENCY_BY_CODE } from "../data/eu";
import type { LineItem, VatTreatment } from "../types";

/* ─────────────────────────────────────────────────────────────
   All amounts are integer minor units (cents). Parsing works on
   the digits of the string and multiplication happens in BigInt,
   so no float rounding error can reach a total.
   ───────────────────────────────────────────────────────────── */

/** Largest quantity accepted on a line. */
export const MAX_QUANTITY = 1_000_000;
/** Largest unit price accepted on a line: 1 billion in major units. */
export const MAX_UNIT_PRICE_CENTS = 100_000_000_000;
/** Quantities are kept to three decimals (minutes as fractions of an hour, grams...). */
export const QUANTITY_DECIMALS = 3;

export const decimalsFor = (currency: string): number => CURRENCY_BY_CODE.get(currency)?.decimals ?? 2;

/** Round half away from zero, the commercial convention. */
export const roundHalfUp = (value: number): number => (value < 0 ? -Math.round(-value) : Math.round(value));

/** Integer division of a by b (b > 0) rounding half away from zero. */
const divRound = (a: bigint, b: bigint): bigint => {
  const negative = a < 0n;
  const abs = negative ? -a : a;
  const q = (abs * 2n + b) / (2n * b);
  return negative ? -q : q;
};

/**
 * Normalises what a person types into a plain decimal string, or null.
 *
 *   "1.234,56"  -> "1234.56"   (Dutch/German grouping)
 *   "1,234.56"  -> "1234.56"   (English grouping)
 *   "7,5"       -> "7.5"       (a lone comma is a decimal comma)
 *   "€ 85"      -> "85"
 */
export const normaliseDecimal = (
  input: string,
  /**
   * For money: a single separator followed by exactly three digits
   * ("1.500", "2,750") is read as thousands grouping, because nobody
   * prices to a tenth of a cent. Quantities keep it as a decimal.
   */
  moneyGrouping = false,
): string | null => {
  let s = input.replace(/[\s\u00a0\u202f']/g, "").replace(/[^\d.,-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return null;

  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: whichever comes last is the decimal separator.
    const decimal = lastComma > lastDot ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    s = s.split(grouping).join("").replace(decimal, ".");
  } else {
    const sep = lastComma !== -1 ? "," : lastDot !== -1 ? "." : null;
    if (sep) {
      const parts = s.split(sep);
      const groupedThousands =
        parts.length > 2 ||
        (moneyGrouping && parts.length === 2 && /^[1-9]\d{0,2}$/.test(parts[0]) && /^\d{3}$/.test(parts[1]));
      s = groupedThousands ? parts.join("") : parts.join(".");
    }
  }

  if (!/^\d*\.?\d*$/.test(s) || s === ".") return null;
  if (s.startsWith(".")) s = `0${s}`;
  if (s.endsWith(".")) s = s.slice(0, -1);
  return negative ? `-${s}` : s;
};

/** Converts a normalised decimal string to an integer scaled by 10^decimals. */
const toScaledInteger = (decimal: string, decimals: number): number => {
  const negative = decimal.startsWith("-");
  const [whole, frac = ""] = decimal.replace("-", "").split(".");
  const kept = (frac + "0".repeat(decimals)).slice(0, decimals);
  let value = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(kept || "0");
  // Round on the first discarded digit.
  if (Number(frac.charAt(decimals) || "0") >= 5) value += 1n;
  return Number(negative ? -value : value);
};

/** "1234,56" -> 123456 for a 2-decimal currency. Unparseable input -> null. */
export const parseAmount = (input: string, currency = "EUR"): number | null => {
  const s = normaliseDecimal(input, true);
  return s === null ? null : toScaledInteger(s, decimalsFor(currency));
};

/** Like parseAmount, but treats anything unparseable as zero. */
export const parseAmountToCents = (input: string, currency = "EUR"): number =>
  parseAmount(input, currency) ?? 0;

/** "7,5" -> 7.5, kept to three decimals. Unparseable input -> null. */
export const parseQuantity = (input: string): number | null => {
  const s = normaliseDecimal(input);
  if (s === null) return null;
  return toScaledInteger(s, QUANTITY_DECIMALS) / 10 ** QUANTITY_DECIMALS;
};

/** 123456 -> "1234.56". Plain, for use inside editable inputs. */
export const centsToInput = (cents: number, currency = "EUR"): string => {
  const decimals = decimalsFor(currency);
  return (cents / 10 ** decimals).toFixed(decimals);
};

/** 123456 -> "€ 1.234,56", localised. For display only. */
export const formatMoney = (cents: number, currency = "EUR", locale = "nl-NL"): string => {
  const decimals = decimalsFor(currency);
  // -0 would otherwise print as "-€0.00" on a credit note.
  const value = cents === 0 ? 0 : cents / 10 ** decimals;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

/** 7.5 -> "7,5" in Dutch, "7.5" in English. */
export const formatQuantity = (quantity: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: QUANTITY_DECIMALS }).format(
    quantity === 0 ? 0 : quantity,
  );

/** 21 -> "21%", 25.5 -> "25,5%" in Dutch. */
export const formatRate = (rate: number, locale: string): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(rate)}%`;

/* ── Totals ───────────────────────────────────────────────── */

export interface VatGroup {
  rate: number;
  netCents: number;
  vatCents: number;
}

export interface Totals {
  netCents: number;
  vatCents: number;
  grossCents: number;
  /** One entry per distinct VAT rate present, ascending. */
  groups: VatGroup[];
}

/** Net for a single line: quantity x unit price, rounded once. */
export const lineNetCents = (line: Pick<LineItem, "quantity" | "unitPriceCents">): number => {
  const milli = BigInt(Math.round(line.quantity * 1000));
  const price = BigInt(Math.round(line.unitPriceCents));
  return Number(divRound(milli * price, 1000n));
};

/** VAT on a net amount. Rates like 25.5 or 2.1 are handled in basis points. */
export const vatOn = (netCents: number, rate: number): number => {
  const basisPoints = BigInt(Math.round(rate * 100));
  return Number(divRound(BigInt(netCents) * basisPoints, 10_000n));
};

/**
 * VAT is computed per rate group, not per line. Summing per-line
 * rounded VAT drifts by a cent or two on long invoices, which is
 * exactly the kind of thing an accountant notices.
 *
 * Under reverse charge, export, or a small-business exemption the
 * whole document carries 0% regardless of what the lines say.
 */
export const calculateTotals = (
  lines: Pick<LineItem, "quantity" | "unitPriceCents" | "vatRate">[],
  treatment: VatTreatment = "standard",
): Totals => {
  const zeroRated = treatment !== "standard";
  const byRate = new Map<number, number>();

  for (const line of lines) {
    const rate = zeroRated ? 0 : line.vatRate;
    byRate.set(rate, (byRate.get(rate) ?? 0) + lineNetCents(line));
  }

  const groups: VatGroup[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, netCents]) => ({ rate, netCents, vatCents: vatOn(netCents, rate) }));

  const netCents = groups.reduce((sum, g) => sum + g.netCents, 0);
  const vatCents = groups.reduce((sum, g) => sum + g.vatCents, 0);

  return { netCents, vatCents, grossCents: netCents + vatCents, groups };
};
