import { isEuCountry } from "../data/eu";
import { addDays, todayIso } from "./dates";
import { newId } from "./id";
import { calculateTotals } from "./money";
import type {
  Business,
  Client,
  ClientSnapshot,
  DocKind,
  LineItem,
  VatTreatment,
  WolfDocument,
} from "../types";

export const emptyLine = (vatRate: number): LineItem => ({
  id: newId(),
  description: "",
  quantity: 1,
  unit: "",
  unitPriceCents: 0,
  vatRate,
});

/**
 * Works out which VAT regime applies, so the user doesn't have to know
 * the rules. Always overridable: Wolf suggests, it doesn't decide.
 *
 * Order matters: a supplier under a small-business scheme charges no
 * VAT to anyone, so that test comes before any cross-border logic.
 */
export const suggestVatTreatment = (
  business: Business,
  client: Pick<Client, "vatNumber" | "address"> | null,
): VatTreatment => {
  if (business.vatExempt) return "exempt_small_business";
  if (!client) return "standard";

  const home = business.address.country;
  const there = client.address.country;
  if (!there || there === home) return "standard";
  if (!isEuCountry(there)) return "export";

  // Intra-EU B2B: reverse charge only if the customer is VAT-registered.
  return client.vatNumber.trim() ? "reverse_charge" : "standard";
};

export const snapshotClient = (client: Client | ClientSnapshot): ClientSnapshot => ({
  id: client.id,
  name: client.name,
  address: { ...client.address },
  vatNumber: client.vatNumber,
  email: client.email,
  reference: client.reference,
});

export const newDraft = (
  kind: DocKind,
  business: Business,
  defaultVatRate: number,
  today = todayIso(),
): WolfDocument => ({
  id: newId(),
  kind,
  number: null,
  sequence: null,
  status: "draft",
  issueDate: today,
  dueDate: addDays(today, kind === "invoice" ? business.paymentTermDays : 30),
  clientId: null,
  client: null,
  lines: [emptyLine(business.vatExempt ? 0 : defaultVatRate)],
  currency: business.currency,
  vatTreatment: business.vatExempt ? "exempt_small_business" : "standard",
  language: business.documentLanguage ?? "en",
  notes: business.defaultNotes,
  createdAt: new Date().toISOString(),
  issuedAt: null,
  settledAt: null,
});

export const isCreditNote = (doc: Pick<WolfDocument, "correctsDocumentId">): boolean =>
  Boolean(doc.correctsDocumentId);

export const isIssued = (doc: Pick<WolfDocument, "status">): boolean => doc.status !== "draft";

export const grossOf = (doc: Pick<WolfDocument, "lines" | "vatTreatment">): number =>
  calculateTotals(doc.lines, doc.vatTreatment).grossCents;

/** Issued credit notes that correct the given invoice. */
export const creditNotesFor = (invoice: WolfDocument, all: WolfDocument[]): WolfDocument[] =>
  all.filter((d) => d.correctsDocumentId === invoice.id && isIssued(d));

/**
 * What the client still owes on an invoice: its total minus any credit
 * notes issued against it. Zero once paid, and never negative.
 */
export const balanceDue = (invoice: WolfDocument, all: WolfDocument[]): number => {
  if (invoice.kind !== "invoice" || isCreditNote(invoice) || invoice.status !== "sent") return 0;
  const credited = creditNotesFor(invoice, all).reduce((sum, d) => sum + grossOf(d), 0);
  return Math.max(0, grossOf(invoice) + credited);
};

/** How much of an invoice can still be credited (positive cents). */
export const creditableAmount = (invoice: WolfDocument, all: WolfDocument[]): number => {
  const credited = creditNotesFor(invoice, all).reduce((sum, d) => sum + grossOf(d), 0);
  return Math.max(0, grossOf(invoice) + credited);
};

export type DisplayStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "credited"
  | "accepted"
  | "declined"
  | "expired"
  | "issued"
  | "refunded";

export const displayStatus = (doc: WolfDocument, all: WolfDocument[], today = todayIso()): DisplayStatus => {
  if (doc.status === "draft") return "draft";
  if (isCreditNote(doc)) return doc.status === "paid" ? "refunded" : "issued";
  if (doc.kind === "quote") {
    if (doc.status === "sent" && doc.dueDate < today) return "expired";
    return doc.status as DisplayStatus;
  }
  if (doc.status === "paid") return "paid";
  if (creditNotesFor(doc, all).length > 0 && balanceDue(doc, all) === 0) return "credited";
  if (doc.dueDate < today) return "overdue";
  return "sent";
};

export const isOverdue = (doc: WolfDocument, all: WolfDocument[], today = todayIso()): boolean =>
  displayStatus(doc, all, today) === "overdue";

export const statusColour = (status: DisplayStatus): string => {
  switch (status) {
    case "overdue":
    case "declined":
      return "var(--status-overdue)";
    case "draft":
    case "expired":
    case "credited":
      return "var(--status-draft)";
    case "paid":
    case "accepted":
    case "refunded":
      return "var(--status-paid)";
    default:
      return "var(--status-sent)";
  }
};
