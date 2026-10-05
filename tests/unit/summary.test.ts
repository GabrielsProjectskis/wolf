import { describe, expect, it } from "vitest";
import { createCreditNote, issue, markPaid } from "../../src/lib/actions";
import { summarise } from "../../src/lib/summary";
import { baseData, line, TODAY, withDraft } from "../fixtures";

describe("outstanding and overdue totals", () => {
  it("adds up open invoices, splits out overdue ones, and nets credit notes", () => {
    const base = baseData();
    const client = base.client;
    let data = base.data;
    const ids: string[] = [];
    for (const [issueDate, cents] of [
      ["2026-06-01", 10000],
      ["2026-08-10", 20000],
      ["2026-08-11", 40000],
    ] as const) {
      const d = withDraft(data, client.id, "invoice", [
        line({ quantity: 1, unitPriceCents: cents, vatRate: 0 }),
      ]);
      data = {
        ...d.data,
        documents: d.data.documents.map((x) => (x.id === d.id ? { ...x, issueDate, dueDate: issueDate } : x)),
      };
      data = issue(data, d.id, TODAY);
      ids.push(d.id);
    }
    // Third one is paid; second is half credited.
    data = markPaid(data, ids[2], `${TODAY}T10:00:00Z`);
    const credit = createCreditNote(data, ids[1], TODAY);
    data = {
      ...credit.data,
      documents: credit.data.documents.map((x) =>
        x.id === credit.id ? { ...x, lines: [line({ quantity: -1, unitPriceCents: 10000, vatRate: 0 })] } : x,
      ),
    };
    data = issue(data, credit.id, TODAY);

    const [eur] = summarise(data.documents, "2026-08-20");
    expect(eur).toMatchObject({
      currency: "EUR",
      outstandingCents: 10000 + 10000,
      outstandingCount: 2,
      overdueCents: 20000,
      overdueCount: 2,
      paidThisYearCents: 40000,
    });
  });

  it("keeps currencies separate", () => {
    const base = baseData();
    const client = base.client;
    let data = base.data;
    const a = withDraft(data, client.id);
    data = issue(a.data, a.id, TODAY);
    const b = withDraft(data, client.id);
    data = issue(
      { ...b.data, documents: b.data.documents.map((x) => (x.id === b.id ? { ...x, currency: "PLN" } : x)) },
      b.id,
      TODAY,
    );
    expect(
      summarise(data.documents, TODAY)
        .map((s) => s.currency)
        .sort(),
    ).toEqual(["EUR", "PLN"]);
  });
});
