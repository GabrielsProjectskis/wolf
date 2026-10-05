import { COUNTRY_BY_CODE } from "../data/eu";

/**
 * Format checks for the fields where a typo costs real money: an IBAN
 * with a wrong digit sends a client's payment nowhere. These are
 * advisory (shown next to the field), not blocking, because there are
 * edge cases (a new country format, a test account) Wolf can't know.
 */

const compact = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/** ISO 13616 mod-97 check. */
export const isValidIban = (input: string): boolean => {
  const iban = compact(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "A" ? ch.charCodeAt(0) - 55 : Number(ch);
    remainder = Number(`${remainder}${value}`) % 97;
  }
  return remainder === 1;
};

/** "nl91abna0417164300" -> "NL91 ABNA 0417 1643 00" */
export const formatIban = (input: string): string => compact(input).replace(/(.{4})(?=.)/g, "$1 ");

export const isValidBic = (input: string): boolean =>
  /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(compact(input));

/**
 * Light structural check: the right country prefix followed by 2 to 13
 * letters or digits. Real validation needs the EU VIES service, which
 * Wolf deliberately doesn't call (it would send client data to a server).
 */
export const vatLooksValid = (input: string, country?: string): boolean => {
  const vat = compact(input);
  const prefix = country ? COUNTRY_BY_CODE.get(country)?.vatPrefix : undefined;
  if (prefix && !vat.startsWith(prefix)) return false;
  return /^[A-Z]{2,3}[A-Z0-9]{2,13}$/.test(vat);
};

export const isValidEmail = (input: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim());
