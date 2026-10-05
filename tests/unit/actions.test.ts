import { describe, expect, it } from "vitest";
import {
  ActionError,
  addDocument,
  convertQuote,
  counterEditable,
  createCreditNote,
  deleteClient,
  deleteDraft,
  duplicate,
  issue,
  markPaid,
  markUnpaid,
  setCounter,
  setQuoteOutcome,
  updateDraft,
  upsertClient,
} from "../../src/lib/actions";
import { balanceDue, displayStatus, grossOf } from "../../src/lib/document";
import { newDraft } from "../../src/lib/document";
import { baseData, issuedInvoice, line, polishClient, TODAY, withDraft } from "../fixtures";

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ActionError);
    expect((e as ActionError).code).toBe(code);
    return;
  }
  throw new Error(`expected ActionError ${code}`);
};

describe("issuing", () => {
  it("assigns the next number, snapshots the client and advances the counter in one step", () => {
    const { data, id, client } = issuedInvoice();
    const doc = data.documents.find((d) => d.id === id)!;
    expect(doc.number).toBe("F2026-001");
    expect(doc.sequence).toBe(1);
    expect(doc.status).toBe("sent");
    expect(doc.client).toMatchObject({ id: client.id, name: client.name });
    expect(data.counters.invoice.next).toBe(2);
  });

  it("can never issue the same draft twice (double click)", () => {
    const { data, id } = issuedInvoice();
    expectCode(() => issue(data, id, TODAY), "notDraft");
  });

  it("gives consecutive numbers to consecutive documents", () => {
    const base = baseData();
    const client = base.client;
    let data = base.data;
    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const created = withDraft(data, client.id);
      data = issue(created.data, created.id, TODAY);
      numbers.push(data.documents.find((d) => d.id === created.id)!.number!);
    }
    expect(numbers).toEqual(["F2026-001", "F2026-002", "F2026-003"]);
  });

  it("refuses to issue when required details are missing, without consuming a number", () => {
    const { data } = baseData();
    const draft = newDraft("invoice", data.business, 21, TODAY);
    const withDoc = addDocument(data, draft);
    try {
      issue(withDoc, draft.id, TODAY);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ActionError).code).toBe("blocked");
      expect((e as ActionError).issues.map((i) => i.code)).toEqual(
        expect.arrayContaining(["client", "noLines"]),
      );
    }
    expect(withDoc.counters.invoice.next).toBe(1);
  });

  it("keeps the issued client details when the client is edited later", () => {
    const { data, id, client } = issuedInvoice();
    const edited = upsertClient(data, { ...client, name: "Renamed BV" }).data;
    expect(edited.documents.find((d) => d.id === id)!.client!.name).toBe("Bakkerij de Vries");
  });
});

describe("issued documents are immutable at the data layer", () => {
  it("rejects edits to an issued document", () => {
    const { data, id } = issuedInvoice();
    expectCode(() => updateDraft(data, id, { lines: [] }), "locked");
    expectCode(() => updateDraft(data, id, { issueDate: "2020-01-01" }), "locked");
  });

  it("rejects deleting an issued document", () => {
    const { data, id } = issuedInvoice();
    expectCode(() => deleteDraft(data, id), "locked");
  });

  it("ignores attempts to set protected fields through a draft patch", () => {
    const { data, client } = baseData();
    const { data: d1, id } = withDraft(data, client.id);
    const patched = updateDraft(d1, id, { notes: "hi", number: "F2026-999", status: "paid" } as never);
    const doc = patched.documents.find((d) => d.id === id)!;
    expect(doc.notes).toBe("hi");
    expect(doc.number).toBeNull();
    expect(doc.status).toBe("draft");
  });

  it("only accepts new documents as unnumbered drafts", () => {
    const { data } = issuedInvoice();
    const sneaky = {
      ...newDraft("invoice", data.business, 21, TODAY),
      status: "sent" as const,
      number: "F2026-002",
    };
    expectCode(() => addDocument(data, sneaky), "notDraft");
  });
});

describe("payment status", () => {
  it("marks paid and back", () => {
    const { data, id } = issuedInvoice();
    const paid = markPaid(data, id, "2026-08-20T10:00:00Z");
    expect(paid.documents.find((d) => d.id === id)).toMatchObject({
      status: "paid",
      settledAt: "2026-08-20T10:00:00Z",
    });
    const unpaid = markUnpaid(paid, id);
    expect(unpaid.documents.find((d) => d.id === id)).toMatchObject({ status: "sent", settledAt: null });
  });

  it("cannot mark a draft as paid", () => {
    const { data, client } = baseData();
    const { data: d1, id } = withDraft(data, client.id);
    expectCode(() => markPaid(d1, id), "invalidTransition");
  });
});

describe("credit notes", () => {
  it("creates a draft with every line negated, pointing at the invoice", () => {
    const { data, id } = issuedInvoice([
      line(),
      line({ description: "Hosting", quantity: 1, unitPriceCents: 2000, vatRate: 21 }),
    ]);
    const created = createCreditNote(data, id, TODAY);
    const note = created.data.documents.find((d) => d.id === created.id)!;
    expect(note.status).toBe("draft");
    expect(note.correctsDocumentId).toBe(id);
    expect(note.lines.map((l) => l.quantity)).toEqual([-7.5, -1]);
    expect(grossOf(note)).toBe(-grossOf(data.documents.find((d) => d.id === id)!));
  });

  it("issues in the invoice sequence and settles the balance", () => {
    const { data, id } = issuedInvoice();
    const created = createCreditNote(data, id, TODAY);
    const issued = issue(created.data, created.id, TODAY);
    const note = issued.documents.find((d) => d.id === created.id)!;
    const invoice = issued.documents.find((d) => d.id === id)!;
    expect(note.number).toBe("F2026-002");
    expect(balanceDue(invoice, issued.documents)).toBe(0);
    expect(displayStatus(invoice, issued.documents, TODAY)).toBe("credited");
    expectCode(() => createCreditNote(issued, id, TODAY), "nothingToCredit");
  });

  it("supports a partial credit and refuses to credit more than the invoice", () => {
    const { data, id } = issuedInvoice(); // 7.5h x 85 + 21% = 771.38
    const created = createCreditNote(data, id, TODAY);
    const partial = updateDraft(created.data, created.id, { lines: [line({ quantity: -2 })] });
    const issued = issue(partial, created.id, TODAY);
    const invoice = issued.documents.find((d) => d.id === id)!;
    expect(balanceDue(invoice, issued.documents)).toBe(77138 - 20570);

    const second = createCreditNote(issued, id, TODAY);
    const tooMuch = updateDraft(second.data, second.id, { lines: [line({ quantity: -10 })] });
    try {
      issue(tooMuch, second.id, TODAY);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ActionError).issues.map((i) => i.code)).toContain("creditExceeds");
    }
  });

  it("keeps the client of the original invoice", () => {
    const { data, id, client } = issuedInvoice();
    const created = createCreditNote(data, id, TODAY);
    const moved = updateDraft(created.data, created.id, { clientId: "someone-else" });
    expect(moved.documents.find((d) => d.id === created.id)!.clientId).toBe(client.id);
  });

  it("cannot credit a draft or a quote", () => {
    const { data, client } = baseData();
    const { data: d1, id } = withDraft(data, client.id);
    expectCode(() => createCreditNote(d1, id, TODAY), "invalidTransition");
  });
});

describe("quotes", () => {
  it("converts an issued quote into an invoice draft and marks it accepted", () => {
    const { data, client } = baseData();
    const { data: d1, id } = withDraft(data, client.id, "quote");
    const issued = issue(d1, id, TODAY);
    expect(issued.documents.find((d) => d.id === id)!.number).toBe("OFF2026-001");

    const converted = convertQuote(issued, id, "2026-08-20");
    const invoice = converted.data.documents.find((d) => d.id === converted.id)!;
    expect(invoice).toMatchObject({
      kind: "invoice",
      status: "draft",
      number: null,
      fromQuoteId: id,
      dueDate: "2026-09-19",
    });
    expect(converted.data.documents.find((d) => d.id === id)!.status).toBe("accepted");
    expect(converted.data.counters.invoice.next).toBe(1); // no number until issued
  });

  it("records declined and can reopen", () => {
    const { data, client } = baseData();
    const { data: d1, id } = withDraft(data, client.id, "quote");
    const declined = setQuoteOutcome(issue(d1, id, TODAY), id, "declined");
    expect(declined.documents.find((d) => d.id === id)!.status).toBe("declined");
    expect(setQuoteOutcome(declined, id, "sent").documents.find((d) => d.id === id)!.status).toBe("sent");
  });

  it("expires after its valid-until date", () => {
    const { data, client } = baseData();
    const { data: d1, id } = withDraft(data, client.id, "quote");
    const issued = issue(d1, id, TODAY);
    const quote = issued.documents.find((d) => d.id === id)!;
    expect(displayStatus(quote, issued.documents, "2026-12-01")).toBe("expired");
  });
});

describe("duplicate", () => {
  it("copies into a fresh, unnumbered draft dated today", () => {
    const { data, id } = issuedInvoice();
    const copy = duplicate(data, id, "2026-09-01");
    const doc = copy.data.documents.find((d) => d.id === copy.id)!;
    expect(doc).toMatchObject({
      status: "draft",
      number: null,
      client: null,
      issueDate: "2026-09-01",
      dueDate: "2026-10-01",
    });
    expect(doc.lines[0].id).not.toBe(data.documents.find((d) => d.id === id)!.lines[0].id);
  });
});

describe("overdue", () => {
  it("is overdue after the due date and not after payment", () => {
    const { data, id } = issuedInvoice();
    const doc = data.documents.find((d) => d.id === id)!;
    expect(displayStatus(doc, data.documents, "2026-09-12")).toBe("sent");
    expect(displayStatus(doc, data.documents, "2026-09-13")).toBe("overdue");
    const paid = markPaid(data, id);
    expect(
      displayStatus(
        paid.documents.find((d) => d.id === id)!,
        paid.documents,
        "2026-12-01",
      ),
    ).toBe("paid");
  });
});

describe("clients", () => {
  it("edits in place, keeping id and creation date", () => {
    const { data, client } = baseData();
    const { data: edited, client: after } = upsertClient(data, {
      ...client,
      city: undefined,
      name: "  De Vries BV ",
    } as never);
    expect(after.id).toBe(client.id);
    expect(after.createdAt).toBe(client.createdAt);
    expect(after.name).toBe("De Vries BV");
    expect(edited.clients).toHaveLength(1);
  });

  it("refuses to delete a client used on a document", () => {
    const { data, client } = baseData();
    const { data: d1 } = withDraft(data, client.id);
    expectCode(() => deleteClient(d1, client.id), "clientInUse");
    expect(deleteClient(data, client.id).clients).toHaveLength(0);
  });
});

describe("numbering settings", () => {
  it("can be changed before the first document of the year, and not after", () => {
    const { data, client } = baseData();
    const changed = setCounter(data, "invoice", { prefix: "INV", next: 15 }, TODAY);
    const { data: d1, id } = withDraft(changed, client.id);
    const issued = issue(d1, id, TODAY);
    expect(issued.documents.find((d) => d.id === id)!.number).toBe("INV2026-015");
    expect(counterEditable(issued, "invoice", TODAY)).toBe(false);
    expectCode(() => setCounter(issued, "invoice", { prefix: "X", next: 1 }, TODAY), "counterInUse");
  });

  it("validates the prefix and start number", () => {
    const { data } = baseData();
    expectCode(() => setCounter(data, "invoice", { prefix: "../x", next: 1 }, TODAY), "invalidCounter");
    expectCode(() => setCounter(data, "invoice", { prefix: "F", next: 0 }, TODAY), "invalidCounter");
  });
});

describe("cross-border VAT", () => {
  it("issues a reverse-charge invoice to an EU business with a VAT number", () => {
    const { data } = baseData();
    const { data: withPl, client } = upsertClient(data, polishClient);
    const { data: d1, id } = withDraft(withPl, client.id);
    const ready = updateDraft(d1, id, { vatTreatment: "reverse_charge" });
    const issued = issue(ready, id, TODAY);
    expect(grossOf(issued.documents.find((d) => d.id === id)!)).toBe(63750);
  });
});
