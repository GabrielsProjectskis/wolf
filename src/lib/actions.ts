import { addDays, todayIso } from "./dates";
import { hasBlockingIssues, runChecklist, type CheckIssue } from "./checklist";
import { creditableAmount, isCreditNote, isIssued, snapshotClient } from "./document";
import { newId } from "./id";
import { highestIssued, issueNumber, PREFIX_PATTERN, rollYear } from "./numbering";
import type { Business, Client, DocKind, Preferences, WolfData, WolfDocument } from "../types";

/**
 * Every change to Wolf's data goes through one of these pure functions.
 *
 * They are where the business rules live: an issued document cannot be
 * edited, numbers are only consumed on issue, a client on an invoice
 * cannot be deleted. Keeping the rules here (rather than in the screens)
 * means a bug in the UI can't break them, and they can be tested without
 * rendering anything.
 */

export type ActionErrorCode =
  | "notFound"
  | "locked"
  | "notDraft"
  | "blocked"
  | "invalidTransition"
  | "clientInUse"
  | "nothingToCredit"
  | "counterInUse"
  | "invalidCounter";

export class ActionError extends Error {
  readonly code: ActionErrorCode;
  readonly issues: CheckIssue[];
  constructor(code: ActionErrorCode, message: string, issues: CheckIssue[] = []) {
    super(message);
    this.name = "ActionError";
    this.code = code;
    this.issues = issues;
  }
}

const find = (data: WolfData, id: string): WolfDocument => {
  const doc = data.documents.find((d) => d.id === id);
  if (!doc) throw new ActionError("notFound", `Document ${id} does not exist.`);
  return doc;
};

const replaceDoc = (data: WolfData, doc: WolfDocument): WolfData => ({
  ...data,
  documents: data.documents.map((d) => (d.id === doc.id ? doc : d)),
});

/** Fields a person may change while a document is a draft. */
export type DraftPatch = Partial<
  Pick<
    WolfDocument,
    "issueDate" | "dueDate" | "clientId" | "lines" | "currency" | "vatTreatment" | "language" | "notes"
  >
>;

const DRAFT_FIELDS: (keyof DraftPatch)[] = [
  "issueDate",
  "dueDate",
  "clientId",
  "lines",
  "currency",
  "vatTreatment",
  "language",
  "notes",
];

/* ── Documents ────────────────────────────────────────────── */

export const addDocument = (data: WolfData, doc: WolfDocument): WolfData => {
  if (doc.status !== "draft" || doc.number !== null) {
    throw new ActionError("notDraft", "New documents must start as unnumbered drafts.");
  }
  return { ...data, documents: [...data.documents, doc] };
};

export const updateDraft = (data: WolfData, id: string, patch: DraftPatch): WolfData => {
  const doc = find(data, id);
  if (doc.status !== "draft") {
    throw new ActionError("locked", `${doc.number ?? id} has been issued and cannot be edited.`);
  }
  const clean: DraftPatch = {};
  for (const key of DRAFT_FIELDS) {
    if (key in patch) (clean as Record<string, unknown>)[key] = patch[key];
  }
  // A credit note always belongs to the client of the invoice it corrects.
  if (isCreditNote(doc)) delete clean.clientId;
  return replaceDoc(data, { ...doc, ...clean });
};

export const deleteDraft = (data: WolfData, id: string): WolfData => {
  const doc = find(data, id);
  if (doc.status !== "draft") {
    throw new ActionError("locked", "Issued documents are corrected with a credit note, never deleted.");
  }
  return { ...data, documents: data.documents.filter((d) => d.id !== id) };
};

/**
 * Moves a draft to issued. This is the only place a number is assigned
 * and the only place a client snapshot is taken. The counter advances in
 * the same state update, so two rapid clicks can never hand out the
 * same number twice.
 */
export const issue = (data: WolfData, id: string, today = todayIso()): WolfData => {
  const doc = find(data, id);
  if (doc.status !== "draft") throw new ActionError("notDraft", "Already issued.");

  const original = doc.correctsDocumentId
    ? data.documents.find((d) => d.id === doc.correctsDocumentId)
    : undefined;
  const client: Client | WolfDocument["client"] =
    original?.client ?? data.clients.find((c) => c.id === doc.clientId) ?? null;

  const issues = runChecklist(doc, data.business, client, data.documents, today);
  if (hasBlockingIssues(issues)) {
    throw new ActionError("blocked", "This document is missing required details.", issues);
  }

  const year = Number(today.slice(0, 4));
  const issued = issueNumber(data.counters[doc.kind], year);
  const next: WolfDocument = {
    ...doc,
    number: issued.number,
    sequence: issued.sequence,
    status: "sent",
    client: snapshotClient(client!),
    clientId: client!.id,
    issuedAt: new Date().toISOString(),
  };
  return {
    ...replaceDoc(data, next),
    counters: { ...data.counters, [doc.kind]: issued.counter },
  };
};

export const markPaid = (data: WolfData, id: string, at = new Date().toISOString()): WolfData => {
  const doc = find(data, id);
  if (doc.kind !== "invoice" || doc.status !== "sent") {
    throw new ActionError("invalidTransition", "Only an issued, unpaid invoice can be marked paid.");
  }
  return replaceDoc(data, { ...doc, status: "paid", settledAt: at });
};

export const markUnpaid = (data: WolfData, id: string): WolfData => {
  const doc = find(data, id);
  if (doc.kind !== "invoice" || doc.status !== "paid") {
    throw new ActionError("invalidTransition", "Only a paid invoice can be marked unpaid.");
  }
  return replaceDoc(data, { ...doc, status: "sent", settledAt: null });
};

export const setQuoteOutcome = (
  data: WolfData,
  id: string,
  outcome: "accepted" | "declined" | "sent",
): WolfData => {
  const doc = find(data, id);
  if (doc.kind !== "quote" || doc.status === "draft") {
    throw new ActionError("invalidTransition", "Only an issued quote has an outcome.");
  }
  return replaceDoc(data, {
    ...doc,
    status: outcome,
    settledAt: outcome === "sent" ? null : new Date().toISOString(),
  });
};

export interface Created {
  data: WolfData;
  id: string;
}

/** An accepted quote becomes a fresh invoice draft carrying the same lines. */
export const convertQuote = (data: WolfData, quoteId: string, today = todayIso()): Created => {
  const quote = find(data, quoteId);
  if (quote.kind !== "quote" || !isIssued(quote)) {
    throw new ActionError("invalidTransition", "Only an issued quote can become an invoice.");
  }
  const invoice: WolfDocument = {
    ...quote,
    id: newId(),
    kind: "invoice",
    number: null,
    sequence: null,
    status: "draft",
    issueDate: today,
    dueDate: addDays(today, data.business.paymentTermDays),
    client: null,
    lines: quote.lines.map((line) => ({ ...line, id: newId() })),
    createdAt: new Date().toISOString(),
    issuedAt: null,
    settledAt: null,
    fromQuoteId: quote.id,
    correctsDocumentId: undefined,
  };
  const accepted = replaceDoc(data, {
    ...quote,
    status: "accepted",
    settledAt: quote.settledAt ?? new Date().toISOString(),
  });
  return { data: { ...accepted, documents: [...accepted.documents, invoice] }, id: invoice.id };
};

/**
 * A credit note reverses all or part of an issued invoice. It starts as
 * a draft with every line negated; delete or reduce lines for a partial
 * credit. It takes the next number in the invoice sequence.
 */
export const createCreditNote = (data: WolfData, invoiceId: string, today = todayIso()): Created => {
  const invoice = find(data, invoiceId);
  if (invoice.kind !== "invoice" || !isIssued(invoice) || isCreditNote(invoice)) {
    throw new ActionError("invalidTransition", "Only an issued invoice can be credited.");
  }
  if (creditableAmount(invoice, data.documents) <= 0) {
    throw new ActionError("nothingToCredit", "This invoice has already been fully credited.");
  }
  const note: WolfDocument = {
    ...invoice,
    id: newId(),
    number: null,
    sequence: null,
    status: "draft",
    issueDate: today,
    dueDate: today,
    lines: invoice.lines.map((line) => ({ ...line, id: newId(), quantity: -line.quantity })),
    notes: "",
    createdAt: new Date().toISOString(),
    issuedAt: null,
    settledAt: null,
    correctsDocumentId: invoice.id,
    fromQuoteId: undefined,
  };
  return { data: { ...data, documents: [...data.documents, note] }, id: note.id };
};

/** Copies any invoice or quote into a new, unnumbered draft dated today. */
export const duplicate = (data: WolfData, id: string, today = todayIso()): Created => {
  const source = find(data, id);
  if (isCreditNote(source)) {
    throw new ActionError("invalidTransition", "Credit notes are created from their invoice.");
  }
  const term = source.kind === "invoice" ? data.business.paymentTermDays : 30;
  const copy: WolfDocument = {
    ...source,
    id: newId(),
    number: null,
    sequence: null,
    status: "draft",
    issueDate: today,
    dueDate: addDays(today, term),
    client: null,
    clientId: data.clients.some((c) => c.id === source.clientId) ? source.clientId : null,
    lines: source.lines.map((line) => ({ ...line, id: newId() })),
    createdAt: new Date().toISOString(),
    issuedAt: null,
    settledAt: null,
    fromQuoteId: undefined,
    correctsDocumentId: undefined,
  };
  return { data: { ...data, documents: [...data.documents, copy] }, id: copy.id };
};

/* ── Clients ──────────────────────────────────────────────── */

export type ClientInput = Omit<Client, "id" | "createdAt"> & { id?: string };

export const upsertClient = (data: WolfData, input: ClientInput): { data: WolfData; client: Client } => {
  const existing = input.id ? data.clients.find((c) => c.id === input.id) : undefined;
  const client: Client = {
    id: existing?.id ?? newId(),
    name: input.name.trim(),
    address: { ...input.address },
    vatNumber: input.vatNumber.trim(),
    email: input.email.trim(),
    reference: input.reference,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  const clients = existing
    ? data.clients.map((c) => (c.id === client.id ? client : c))
    : [...data.clients, client];
  return { data: { ...data, clients }, client };
};

export const clientUsage = (data: WolfData, clientId: string): number =>
  data.documents.filter((d) => d.clientId === clientId).length;

export const deleteClient = (data: WolfData, id: string): WolfData => {
  if (clientUsage(data, id) > 0) {
    throw new ActionError("clientInUse", "This client appears on documents and cannot be deleted.");
  }
  return { ...data, clients: data.clients.filter((c) => c.id !== id) };
};

/* ── Business, preferences, numbering ─────────────────────── */

export const updateBusiness = (data: WolfData, patch: Partial<Business>): WolfData => ({
  ...data,
  business: { ...data.business, ...patch },
});

export const completeSetup = (data: WolfData, business: Business): WolfData => ({
  ...data,
  business,
  initialised: true,
});

export const updatePreferences = (data: WolfData, patch: Partial<Preferences>): WolfData => ({
  ...data,
  preferences: { ...data.preferences, ...patch },
});

/** True when the numbering for this kind can still be changed this year. */
export const counterEditable = (data: WolfData, kind: DocKind, today = todayIso()): boolean => {
  const counter = rollYear(data.counters[kind], Number(today.slice(0, 4)));
  return highestIssued(data.documents, kind, counter) === 0;
};

/**
 * Lets someone moving from another tool continue their numbering
 * (e.g. start at 015). Only allowed before the first document of the
 * year is issued, because changing it later would open a gap.
 */
export const setCounter = (
  data: WolfData,
  kind: DocKind,
  change: { prefix: string; next: number },
  today = todayIso(),
): WolfData => {
  if (!counterEditable(data, kind, today)) {
    throw new ActionError("counterInUse", "Numbering is fixed once a document is issued this year.");
  }
  if (
    !PREFIX_PATTERN.test(change.prefix) ||
    !Number.isInteger(change.next) ||
    change.next < 1 ||
    change.next > 99_999
  ) {
    throw new ActionError("invalidCounter", "Use up to 8 letters or digits, and a start number from 1.");
  }
  const counter = rollYear(data.counters[kind], Number(today.slice(0, 4)));
  return {
    ...data,
    counters: { ...data.counters, [kind]: { ...counter, prefix: change.prefix, next: change.next } },
  };
};
