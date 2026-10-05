/* ─────────────────────────────────────────────────────────────
   EU member states: VAT rates, currency, VAT-number prefix.

   Rates change by national budget. This is reference data, not
   tax advice: it seeds the dropdown of rates offered on a line.
   Last reviewed: October 2026 (Finland 13.5% and Lithuania 12% from
   1 January 2026; Bulgaria uses the euro from 1 January 2026).
   ───────────────────────────────────────────────────────────── */

export interface Country {
  code: string;
  name: string;
  currency: string;
  /** Prefix used in the country's VAT identification number. */
  vatPrefix: string;
  /** Standard rate first, then reduced rates in descending order. */
  vatRates: number[];
}

export const EU_COUNTRIES: Country[] = [
  { code: "AT", name: "Austria", currency: "EUR", vatPrefix: "ATU", vatRates: [20, 13, 10] },
  { code: "BE", name: "Belgium", currency: "EUR", vatPrefix: "BE", vatRates: [21, 12, 6] },
  { code: "BG", name: "Bulgaria", currency: "EUR", vatPrefix: "BG", vatRates: [20, 9] },
  { code: "HR", name: "Croatia", currency: "EUR", vatPrefix: "HR", vatRates: [25, 13, 5] },
  { code: "CY", name: "Cyprus", currency: "EUR", vatPrefix: "CY", vatRates: [19, 9, 5, 3] },
  { code: "CZ", name: "Czechia", currency: "CZK", vatPrefix: "CZ", vatRates: [21, 12] },
  { code: "DK", name: "Denmark", currency: "DKK", vatPrefix: "DK", vatRates: [25] },
  { code: "EE", name: "Estonia", currency: "EUR", vatPrefix: "EE", vatRates: [24, 13, 9] },
  { code: "FI", name: "Finland", currency: "EUR", vatPrefix: "FI", vatRates: [25.5, 13.5, 10] },
  { code: "FR", name: "France", currency: "EUR", vatPrefix: "FR", vatRates: [20, 10, 5.5, 2.1] },
  { code: "DE", name: "Germany", currency: "EUR", vatPrefix: "DE", vatRates: [19, 7] },
  { code: "GR", name: "Greece", currency: "EUR", vatPrefix: "EL", vatRates: [24, 13, 6] },
  { code: "HU", name: "Hungary", currency: "HUF", vatPrefix: "HU", vatRates: [27, 18, 5] },
  { code: "IE", name: "Ireland", currency: "EUR", vatPrefix: "IE", vatRates: [23, 13.5, 9, 4.8] },
  { code: "IT", name: "Italy", currency: "EUR", vatPrefix: "IT", vatRates: [22, 10, 5, 4] },
  { code: "LV", name: "Latvia", currency: "EUR", vatPrefix: "LV", vatRates: [21, 12, 5] },
  { code: "LT", name: "Lithuania", currency: "EUR", vatPrefix: "LT", vatRates: [21, 12, 5] },
  { code: "LU", name: "Luxembourg", currency: "EUR", vatPrefix: "LU", vatRates: [17, 14, 8, 3] },
  { code: "MT", name: "Malta", currency: "EUR", vatPrefix: "MT", vatRates: [18, 12, 7, 5] },
  { code: "NL", name: "Netherlands", currency: "EUR", vatPrefix: "NL", vatRates: [21, 9] },
  { code: "PL", name: "Poland", currency: "PLN", vatPrefix: "PL", vatRates: [23, 8, 5] },
  { code: "PT", name: "Portugal", currency: "EUR", vatPrefix: "PT", vatRates: [23, 13, 6] },
  { code: "RO", name: "Romania", currency: "RON", vatPrefix: "RO", vatRates: [21, 11] },
  { code: "SK", name: "Slovakia", currency: "EUR", vatPrefix: "SK", vatRates: [23, 19, 5] },
  { code: "SI", name: "Slovenia", currency: "EUR", vatPrefix: "SI", vatRates: [22, 9.5, 5] },
  { code: "ES", name: "Spain", currency: "EUR", vatPrefix: "ES", vatRates: [21, 10, 4] },
  { code: "SE", name: "Sweden", currency: "SEK", vatPrefix: "SE", vatRates: [25, 12, 6] },
];

export const COUNTRY_BY_CODE = new Map(EU_COUNTRIES.map((c) => [c.code, c]));

export const isEuCountry = (code: string): boolean => COUNTRY_BY_CODE.has(code);

/** Country code used for a client outside the EU. Never printed. */
export const OUTSIDE_EU = "XX";

/** "PL" -> "Poland" / "Polen", in the language the document is printed in. */
export const countryName = (code: string, locale: string): string => {
  if (!code || code === OUTSIDE_EU) return "";
  try {
    const name = new Intl.DisplayNames([locale], { type: "region" }).of(code);
    if (name && name !== code) return name;
  } catch {
    // Older engines without DisplayNames fall through to the English table.
  }
  return COUNTRY_BY_CODE.get(code)?.name ?? code;
};

export interface Currency {
  code: string;
  symbol: string;
  /** Number of minor-unit digits. HUF has none in practice. */
  decimals: number;
}

export const CURRENCIES: Currency[] = [
  { code: "EUR", symbol: "€", decimals: 2 },
  { code: "BGN", symbol: "лв", decimals: 2 },
  { code: "CZK", symbol: "Kč", decimals: 2 },
  { code: "DKK", symbol: "kr", decimals: 2 },
  { code: "HUF", symbol: "Ft", decimals: 0 },
  { code: "PLN", symbol: "zł", decimals: 2 },
  { code: "RON", symbol: "lei", decimals: 2 },
  { code: "SEK", symbol: "kr", decimals: 2 },
];

export const CURRENCY_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

/** Rates offered for a country, always including 0 for exempt lines. */
export const vatRatesFor = (countryCode: string): number[] => {
  const country = COUNTRY_BY_CODE.get(countryCode);
  const rates = country ? [...country.vatRates] : [21, 9];
  return [...rates, 0];
};
