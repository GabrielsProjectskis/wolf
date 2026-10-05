import { isEuCountry } from "../data/eu";
import { isIsoDate, todayIso, yearOf } from "./dates";
import { creditableAmount, isCreditNote } from "./document";
import { calculateTotals, lineNetCents } from "./money";
import type { Business, Client, ClientSnapshot, WolfDocument } from "../types";

/**
 * The pre-issue check. Article 226 of the EU VAT Directive lists what
 * an invoice must show; most of the "errors" below are items from that
 * list. Errors block issuing. Warnings are shown but don't block,
 * because there are legitimate reasons for each of them.
 */

export type CheckCode =
  | "businessIdentity"
  | "businessVat"
  | "client"
  | "clientAddress"
  | "clientVatReverseCharge"
  | "exemptNote"
  | "exportEu"
  | "noLines"
  | "lineDescription"
  | "zeroQuantity"
  | "zeroTotal"
  | "negativeInvoice"
  | "creditPositive"
  | "creditExceeds"
  | "invalidDate"
  | "dueBeforeIssue"
  | "noIban"
  | "noRegNumber"
  | "issueYear"
  | "futureDate";

export interface CheckIssue {
  code: CheckCode;
  severity: "error" | "warning";
}

export const runChecklist = (
  doc: WolfDocument,
  business: Business,
  client: Client | ClientSnapshot | null,
  allDocuments: WolfDocument[],
  today = todayIso(),
): CheckIssue[] => {
  const issues: CheckIssue[] = [];
  const error = (code: CheckCode) => issues.push({ code, severity: "error" });
  const warn = (code: CheckCode) => issues.push({ code, severity: "warning" });

  const isInvoice = doc.kind === "invoice";
  const credit = isCreditNote(doc);

  if (!business.name.trim() || !business.address.line1.trim() || !business.address.city.trim()) {
    error("businessIdentity");
  }
  if (!business.vatExempt && !business.vatNumber.trim().replace(/^[A-Z]{2,3}$/, "")) {
    if (isInvoice) error("businessVat");
  }
  if (isInvoice && !business.regNumber.trim()) warn("noRegNumber");

  if (!client) {
    error("client");
  } else {
    if (!client.address.line1.trim() || !client.address.city.trim()) error("clientAddress");
    if (doc.vatTreatment === "reverse_charge" && !client.vatNumber.trim()) {
      error("clientVatReverseCharge");
    }
    if (doc.vatTreatment === "export" && isEuCountry(client.address.country)) warn("exportEu");
  }

  if (doc.vatTreatment === "exempt_small_business" && !business.vatExemptNote.trim()) {
    error("exemptNote");
  }

  const described = doc.lines.filter((l) => l.description.trim());
  if (described.length === 0) error("noLines");
  if (doc.lines.some((l) => !l.description.trim() && lineNetCents(l) !== 0)) {
    error("lineDescription");
  }
  if (described.some((l) => l.quantity === 0)) warn("zeroQuantity");

  const total = calculateTotals(doc.lines, doc.vatTreatment).grossCents;
  if (credit) {
    if (total >= 0) {
      error("creditPositive");
    } else {
      const original = allDocuments.find((d) => d.id === doc.correctsDocumentId);
      if (original && -total > creditableAmount(original, allDocuments)) error("creditExceeds");
    }
  } else {
    if (total < 0) error("negativeInvoice");
    else if (total === 0 && described.length > 0) warn("zeroTotal");
  }

  if (!isIsoDate(doc.issueDate) || !isIsoDate(doc.dueDate)) {
    error("invalidDate");
  } else {
    if (doc.dueDate < doc.issueDate) error("dueBeforeIssue");
    if (yearOf(doc.issueDate) !== yearOf(today)) warn("issueYear");
    else if (doc.issueDate > today) warn("futureDate");
  }

  if (isInvoice && !credit && !business.iban.trim()) warn("noIban");

  return issues;
};

export const hasBlockingIssues = (issues: CheckIssue[]): boolean =>
  issues.some((i) => i.severity === "error");
