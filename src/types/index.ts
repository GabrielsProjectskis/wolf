/* ─────────────────────────────────────────────────────────────
   Wolf data model

   Two rules this model exists to enforce:

   1. Money is NEVER a float. All amounts are integer minor units
      (cents). 19.99 EUR is 1999. Floats silently corrupt totals.

   2. An issued document is immutable. Once it leaves draft it
      carries a frozen copy of the client's details, so editing a
      client later cannot rewrite a document that was already sent.
      The rule is enforced in lib/actions.ts, not only in the UI.
   ───────────────────────────────────────────────────────────── */

import { todayIso } from "../lib/dates";

export type UILanguage = "en" | "nl";
export type Theme = "light" | "dark";

export type DocKind = "invoice" | "quote";

export type InvoiceStatus = "draft" | "sent" | "paid";
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";
export type DocStatus = InvoiceStatus | QuoteStatus;

/** How VAT is treated on a document as a whole. */
export type VatTreatment =
  /** Normal domestic VAT at the rates on each line. */
  | "standard"
  /** Intra-EU B2B supply. VAT 0%, both VAT numbers required, note on invoice. */
  | "reverse_charge"
  /** Supplier is under a national small-business scheme (KOR, Kleinunternehmer...). */
  | "exempt_small_business"
  /** Customer is outside the EU. */
  | "export";

export const VAT_TREATMENTS: VatTreatment[] = [
  "standard",
  "reverse_charge",
  "exempt_small_business",
  "export",
];

export interface Address {
  line1: string;
  line2: string;
  postcode: string;
  city: string;
  /** ISO 3166-1 alpha-2, or "XX" for a country outside the EU. */
  country: string;
}

export interface Business {
  name: string;
  address: Address;
  /** PNG/JPEG/WebP data URL. Embedded so the data file stays self-contained. */
  logo: string | null;
  /** e.g. NL123456789B01 */
  vatNumber: string;
  /** National registration number: KVK, Handelsregister, SIREN... */
  regNumber: string;
  iban: string;
  bic: string;
  email: string;
  phone: string;
  website: string;
  /** ISO 4217. Not all EU members use EUR. */
  currency: string;
  /** True when trading under a small-business exemption scheme. */
  vatExempt: boolean;
  /** Legally required wording naming the exemption, printed on the document. */
  vatExemptNote: string;
  /** Default payment window in days. */
  paymentTermDays: number;
  /** Boilerplate appended to every new document. */
  defaultNotes: string;
  /** Language new documents are printed in. */
  documentLanguage: UILanguage;
}

export interface Client {
  id: string;
  name: string;
  address: Address;
  vatNumber: string;
  email: string;
  /** Purchase order / cost centre the client wants quoted back. */
  reference: string;
  createdAt: string;
}

/** A client's details frozen at the moment a document was issued. */
export type ClientSnapshot = Omit<Client, "createdAt">;

export interface LineItem {
  id: string;
  description: string;
  /** Supports fractional hours; 1.5 is legitimate. Negative on a credit note. */
  quantity: number;
  /** "hours", "pcs", "days"... free text, printed as-is. */
  unit: string;
  /** Integer minor units. */
  unitPriceCents: number;
  /** Percentage, e.g. 21 or 9 or 0. */
  vatRate: number;
}

export interface WolfDocument {
  id: string;
  kind: DocKind;
  /** Rendered human number, e.g. "F2026-001". Assigned on issue. */
  number: string | null;
  /** Position in the gapless sequence. Assigned on issue. */
  sequence: number | null;
  status: DocStatus;

  /** ISO date (YYYY-MM-DD). */
  issueDate: string;
  /** Payment due (invoice) or valid-until (quote). */
  dueDate: string;

  clientId: string | null;
  /** Populated on issue and never touched again. */
  client: ClientSnapshot | null;

  lines: LineItem[];
  currency: string;
  vatTreatment: VatTreatment;
  /** Language the PDF is rendered in, independent of the UI language. */
  language: UILanguage;
  notes: string;

  createdAt: string;
  issuedAt: string | null;
  settledAt: string | null;

  /** Set on a credit note to point at the invoice it corrects. */
  correctsDocumentId?: string;
  /** Set on an invoice created from an accepted quote. */
  fromQuoteId?: string;
}

export interface Counter {
  prefix: string;
  /** Next value to be handed out. */
  next: number;
  /** Year the sequence belongs to; resets `next` when the year rolls over. */
  year: number;
  /** Zero-padding width, e.g. 3 -> 001. */
  pad: number;
}

export interface Preferences {
  theme: Theme;
  language: UILanguage;
}

export const DATA_VERSION = 1 as const;

export interface WolfData {
  version: number;
  business: Business;
  clients: Client[];
  documents: WolfDocument[];
  counters: {
    invoice: Counter;
    quote: Counter;
  };
  preferences: Preferences;
  /** True once the setup screen has been completed. */
  initialised: boolean;
}

/* ── Factories ────────────────────────────────────────────── */

export const emptyAddress = (country = "NL"): Address => ({
  line1: "",
  line2: "",
  postcode: "",
  city: "",
  country,
});

export const emptyBusiness = (): Business => ({
  name: "",
  address: emptyAddress(),
  logo: null,
  vatNumber: "",
  regNumber: "",
  iban: "",
  bic: "",
  email: "",
  phone: "",
  website: "",
  currency: "EUR",
  vatExempt: false,
  vatExemptNote: "",
  paymentTermDays: 30,
  defaultNotes: "",
  documentLanguage: "en",
});

export const emptyData = (): WolfData => {
  const year = Number(todayIso().slice(0, 4));
  return {
    version: DATA_VERSION,
    business: emptyBusiness(),
    clients: [],
    documents: [],
    counters: {
      invoice: { prefix: "F", next: 1, year, pad: 3 },
      quote: { prefix: "OFF", next: 1, year, pad: 3 },
    },
    preferences: { theme: "dark", language: "en" },
    initialised: false,
  };
};
