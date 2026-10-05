import { todayIso } from "./dates";
import { balanceDue, displayStatus, grossOf, isCreditNote } from "./document";
import type { WolfDocument } from "../types";

export interface CurrencySummary {
  currency: string;
  outstandingCents: number;
  outstandingCount: number;
  overdueCents: number;
  overdueCount: number;
  /** Paid invoices settled in the current calendar year, net of refunds. */
  paidThisYearCents: number;
}

/**
 * Money owed to the user, per currency. A business that changed its
 * currency at some point has invoices in two, and adding euros to
 * zloty would produce a meaningless number.
 */
export const summarise = (documents: WolfDocument[], today = todayIso()): CurrencySummary[] => {
  const year = today.slice(0, 4);
  const byCurrency = new Map<string, CurrencySummary>();
  const get = (currency: string) => {
    let s = byCurrency.get(currency);
    if (!s) {
      s = {
        currency,
        outstandingCents: 0,
        outstandingCount: 0,
        overdueCents: 0,
        overdueCount: 0,
        paidThisYearCents: 0,
      };
      byCurrency.set(currency, s);
    }
    return s;
  };

  for (const doc of documents) {
    if (doc.kind !== "invoice" || doc.status === "draft") continue;
    const s = get(doc.currency);

    if (doc.status === "paid" && doc.settledAt?.startsWith(year)) {
      s.paidThisYearCents += grossOf(doc);
      continue;
    }
    if (isCreditNote(doc)) continue;

    const due = balanceDue(doc, documents);
    if (due <= 0) continue;
    s.outstandingCents += due;
    s.outstandingCount += 1;
    if (displayStatus(doc, documents, today) === "overdue") {
      s.overdueCents += due;
      s.overdueCount += 1;
    }
  }

  return [...byCurrency.values()].sort((a, b) => b.outstandingCents - a.outstandingCents);
};
