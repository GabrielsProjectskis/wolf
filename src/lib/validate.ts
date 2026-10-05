import { isIsoDate } from "./dates";
import { MAX_QUANTITY, MAX_UNIT_PRICE_CENTS } from "./money";
import { PREFIX_PATTERN } from "./numbering";
import {
  DATA_VERSION,
  emptyData,
  VAT_TREATMENTS,
  type Address,
  type Business,
  type Client,
  type Counter,
  type LineItem,
  type WolfData,
  type WolfDocument,
} from "../types";

/**
 * Everything that enters Wolf from outside (the data file at start-up,
 * a backup someone imports) passes through here first. A file that
 * doesn't match the schema is rejected as a whole with a list of what
 * is wrong, instead of being half-loaded into a state the app was never
 * written to handle.
 */

export type ValidationResult =
  { ok: true; data: WolfData; warnings: string[] } | { ok: false; errors: string[] };

/** Backups larger than this are refused before parsing. */
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const MAX_LOGO_CHARS = 2 * 1024 * 1024;
const MAX_TEXT = 5_000;
const LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

class Collector {
  errors: string[] = [];
  warnings: string[] = [];
  fail(path: string, problem: string) {
    if (this.errors.length < 50) this.errors.push(`${path}: ${problem}`);
  }
}

const str = (c: Collector, o: Obj, key: string, path: string, fallback = ""): string => {
  const v = o[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "string") {
    c.fail(`${path}.${key}`, "expected text");
    return fallback;
  }
  if (v.length > MAX_TEXT) c.fail(`${path}.${key}`, "text is too long");
  return v;
};

const num = (
  c: Collector,
  o: Obj,
  key: string,
  path: string,
  opts: { min: number; max: number; integer?: boolean; fallback?: number },
): number => {
  const v = o[key];
  if (v === undefined && opts.fallback !== undefined) return opts.fallback;
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < opts.min ||
    v > opts.max ||
    (opts.integer && !Number.isInteger(v))
  ) {
    c.fail(
      `${path}.${key}`,
      `expected a ${opts.integer ? "whole " : ""}number from ${opts.min} to ${opts.max}`,
    );
    return opts.fallback ?? opts.min;
  }
  return v;
};

const oneOf = <T extends string>(
  c: Collector,
  o: Obj,
  key: string,
  path: string,
  allowed: readonly T[],
  fallback?: T,
): T => {
  const v = o[key];
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    c.fail(`${path}.${key}`, `expected one of ${allowed.join(", ")}`);
    return fallback ?? allowed[0];
  }
  return v as T;
};

const address = (c: Collector, v: unknown, path: string): Address => {
  if (!isObj(v)) {
    c.fail(path, "missing address");
    return { line1: "", line2: "", postcode: "", city: "", country: "NL" };
  }
  const country = str(c, v, "country", path, "NL");
  if (!/^[A-Z]{2}$/.test(country)) c.fail(`${path}.country`, "expected a two-letter country code");
  return {
    line1: str(c, v, "line1", path),
    line2: str(c, v, "line2", path),
    postcode: str(c, v, "postcode", path),
    city: str(c, v, "city", path),
    country,
  };
};

const business = (c: Collector, v: unknown): Business => {
  const base = emptyData().business;
  if (!isObj(v)) {
    c.fail("business", "missing");
    return base;
  }
  let logo: string | null = null;
  if (typeof v.logo === "string" && v.logo) {
    if (v.logo.length <= MAX_LOGO_CHARS && LOGO_PATTERN.test(v.logo)) logo = v.logo;
    else c.warnings.push("The logo in this file was not a PNG, JPEG or WebP image and was removed.");
  }
  const currency = str(c, v, "currency", "business", base.currency);
  if (!CURRENCY_PATTERN.test(currency)) c.fail("business.currency", "expected a currency code");
  return {
    name: str(c, v, "name", "business"),
    address: address(c, v.address, "business.address"),
    logo,
    vatNumber: str(c, v, "vatNumber", "business"),
    regNumber: str(c, v, "regNumber", "business"),
    iban: str(c, v, "iban", "business"),
    bic: str(c, v, "bic", "business"),
    email: str(c, v, "email", "business"),
    phone: str(c, v, "phone", "business"),
    website: str(c, v, "website", "business"),
    currency,
    vatExempt: v.vatExempt === true,
    vatExemptNote: str(c, v, "vatExemptNote", "business"),
    paymentTermDays: num(c, v, "paymentTermDays", "business", {
      min: 0,
      max: 365,
      integer: true,
      fallback: 30,
    }),
    defaultNotes: str(c, v, "defaultNotes", "business"),
    documentLanguage: oneOf(c, v, "documentLanguage", "business", ["en", "nl"] as const, "en"),
  };
};

const client = (c: Collector, v: unknown, path: string): Client | null => {
  if (!isObj(v)) {
    c.fail(path, "not a client record");
    return null;
  }
  const id = str(c, v, "id", path);
  if (!id) c.fail(`${path}.id`, "missing");
  return {
    id,
    name: str(c, v, "name", path),
    address: address(c, v.address, `${path}.address`),
    vatNumber: str(c, v, "vatNumber", path),
    email: str(c, v, "email", path),
    reference: str(c, v, "reference", path),
    createdAt: str(c, v, "createdAt", path, new Date(0).toISOString()),
  };
};

const line = (c: Collector, v: unknown, path: string): LineItem => {
  if (!isObj(v)) {
    c.fail(path, "not a line item");
    return { id: "", description: "", quantity: 0, unit: "", unitPriceCents: 0, vatRate: 0 };
  }
  return {
    id: str(c, v, "id", path) || `${path}`,
    description: str(c, v, "description", path),
    quantity: num(c, v, "quantity", path, { min: -MAX_QUANTITY, max: MAX_QUANTITY }),
    unit: str(c, v, "unit", path),
    unitPriceCents: num(c, v, "unitPriceCents", path, {
      min: -MAX_UNIT_PRICE_CENTS,
      max: MAX_UNIT_PRICE_CENTS,
      integer: true,
    }),
    vatRate: num(c, v, "vatRate", path, { min: 0, max: 100 }),
  };
};

const STATUSES = {
  invoice: ["draft", "sent", "paid"],
  quote: ["draft", "sent", "accepted", "declined"],
} as const;

const document = (c: Collector, v: unknown, path: string): WolfDocument | null => {
  if (!isObj(v)) {
    c.fail(path, "not a document");
    return null;
  }
  const kind = oneOf(c, v, "kind", path, ["invoice", "quote"] as const);
  const status = oneOf(c, v, "status", path, STATUSES[kind]);
  const number = v.number === null || v.number === undefined ? null : str(c, v, "number", path);
  if (number !== null && !NUMBER_PATTERN.test(number)) c.fail(`${path}.number`, "unexpected characters");
  if ((status === "draft") !== (number === null)) {
    c.fail(path, status === "draft" ? "a draft cannot have a number" : "an issued document needs a number");
  }
  const sequence =
    v.sequence === null || v.sequence === undefined
      ? null
      : num(c, v, "sequence", path, { min: 1, max: 99_999, integer: true });
  const issueDate = str(c, v, "issueDate", path);
  const dueDate = str(c, v, "dueDate", path);
  if (!isIsoDate(issueDate)) c.fail(`${path}.issueDate`, "expected a date as YYYY-MM-DD");
  if (!isIsoDate(dueDate)) c.fail(`${path}.dueDate`, "expected a date as YYYY-MM-DD");
  if (!Array.isArray(v.lines)) c.fail(`${path}.lines`, "expected a list");
  const lines = Array.isArray(v.lines)
    ? v.lines.slice(0, 500).map((l, i) => line(c, l, `${path}.lines[${i}]`))
    : [];
  const snapshot = v.client === null || v.client === undefined ? null : client(c, v.client, `${path}.client`);
  if (status !== "draft" && !snapshot)
    c.fail(`${path}.client`, "an issued document needs its client details");
  const currency = str(c, v, "currency", path, "EUR");
  if (!CURRENCY_PATTERN.test(currency)) c.fail(`${path}.currency`, "expected a currency code");

  const id = str(c, v, "id", path);
  if (!id) c.fail(`${path}.id`, "missing");

  const doc: WolfDocument = {
    id,
    kind,
    number,
    sequence,
    status,
    issueDate,
    dueDate,
    clientId: typeof v.clientId === "string" ? v.clientId : null,
    client: snapshot ? (({ createdAt: _omit, ...rest }) => rest)(snapshot) : null,
    lines,
    currency,
    vatTreatment: oneOf(c, v, "vatTreatment", path, VAT_TREATMENTS, "standard"),
    language: oneOf(c, v, "language", path, ["en", "nl"] as const, "en"),
    notes: str(c, v, "notes", path),
    createdAt: str(c, v, "createdAt", path, new Date(0).toISOString()),
    issuedAt: typeof v.issuedAt === "string" ? v.issuedAt : null,
    settledAt: typeof v.settledAt === "string" ? v.settledAt : null,
  };
  if (typeof v.correctsDocumentId === "string") doc.correctsDocumentId = v.correctsDocumentId;
  if (typeof v.fromQuoteId === "string") doc.fromQuoteId = v.fromQuoteId;
  return doc;
};

const counter = (c: Collector, v: unknown, path: string, fallback: Counter): Counter => {
  if (v === undefined) return fallback;
  if (!isObj(v)) {
    c.fail(path, "expected numbering settings");
    return fallback;
  }
  const prefix = str(c, v, "prefix", path, fallback.prefix);
  if (!PREFIX_PATTERN.test(prefix)) c.fail(`${path}.prefix`, "up to 8 letters or digits");
  return {
    prefix,
    next: num(c, v, "next", path, { min: 1, max: 100_000, integer: true }),
    year: num(c, v, "year", path, { min: 2000, max: 9999, integer: true }),
    pad: num(c, v, "pad", path, { min: 1, max: 6, integer: true, fallback: 3 }),
  };
};

const duplicates = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) (seen.has(id) ? dupes : seen).add(id);
  return [...dupes];
};

export const validateData = (input: unknown): ValidationResult => {
  const c = new Collector();
  if (!isObj(input)) return { ok: false, errors: ["This is not a Wolf data file."] };
  if (typeof input.version !== "number") {
    return { ok: false, errors: ["This is not a Wolf data file (no version number)."] };
  }
  if (input.version > DATA_VERSION) {
    return { ok: false, errors: ["This file was made by a newer version of Wolf. Update Wolf to open it."] };
  }

  const base = emptyData();
  const clients = Array.isArray(input.clients)
    ? input.clients.map((x, i) => client(c, x, `clients[${i}]`)).filter((x): x is Client => x !== null)
    : input.clients === undefined
      ? []
      : (c.fail("clients", "expected a list"), []);
  const documents = Array.isArray(input.documents)
    ? input.documents
        .map((x, i) => document(c, x, `documents[${i}]`))
        .filter((x): x is WolfDocument => x !== null)
    : input.documents === undefined
      ? []
      : (c.fail("documents", "expected a list"), []);

  for (const id of duplicates(clients.map((x) => x.id))) c.fail("clients", `duplicate id ${id}`);
  for (const id of duplicates(documents.map((x) => x.id))) c.fail("documents", `duplicate id ${id}`);
  for (const kind of ["invoice", "quote"] as const) {
    const numbers = documents.filter((d) => d.kind === kind && d.number).map((d) => d.number!);
    for (const n of duplicates(numbers)) c.fail("documents", `number ${n} is used twice`);
  }

  const counters = isObj(input.counters) ? input.counters : {};
  const prefs = isObj(input.preferences) ? input.preferences : {};

  const data: WolfData = {
    version: DATA_VERSION,
    business: business(c, input.business),
    clients,
    documents,
    counters: {
      invoice: counter(c, counters.invoice, "counters.invoice", base.counters.invoice),
      quote: counter(c, counters.quote, "counters.quote", base.counters.quote),
    },
    preferences: {
      theme: oneOf(c, prefs, "theme", "preferences", ["dark", "light"] as const, "dark"),
      language: oneOf(c, prefs, "language", "preferences", ["en", "nl"] as const, "en"),
    },
    initialised: input.initialised === true,
  };

  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, data, warnings: c.warnings };
};

/** Parses and validates the text of a data file or backup. */
export const parseDataFile = (text: string): ValidationResult => {
  if (text.length > MAX_BACKUP_BYTES)
    return { ok: false, errors: ["The file is too large to be a Wolf backup."] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON. It may be damaged or incomplete."] };
  }
  return validateData(parsed);
};
