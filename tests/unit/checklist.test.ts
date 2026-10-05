import { describe, expect, it } from "vitest";
import { hasBlockingIssues, runChecklist } from "../../src/lib/checklist";
import { newDraft } from "../../src/lib/document";
import type { Client, WolfDocument } from "../../src/types";
import { business, dutchClient, line, polishClient, TODAY } from "../fixtures";

const client = (c = dutchClient): Client => ({ ...c, id: "c1", createdAt: "" });
const draft = (patch: Partial<WolfDocument> = {}): WolfDocument => ({
  ...newDraft("invoice", business(), 21, TODAY),
  clientId: "c1",
  lines: [line()],
  ...patch,
});
const codes = (doc: WolfDocument, b = business(), c: Client | null = client()) =>
  runChecklist(doc, b, c, [], TODAY).map((i) => `${i.severity}:${i.code}`);

describe("pre-issue checklist", () => {
  it("passes a complete domestic invoice", () => {
    expect(codes(draft())).toEqual([]);
  });

  it("requires a client with an address", () => {
    expect(codes(draft(), business(), null)).toContain("error:client");
    expect(
      codes(draft(), business(), client({ ...dutchClient, address: { ...dutchClient.address, city: "" } })),
    ).toContain("error:clientAddress");
  });

  it("requires the supplier's VAT number unless exempt, and treats a bare prefix as missing", () => {
    expect(codes(draft(), business({ vatNumber: "NL" }))).toContain("error:businessVat");
    expect(
      codes(
        draft({ vatTreatment: "exempt_small_business" }),
        business({ vatNumber: "", vatExempt: true, vatExemptNote: "KOR" }),
      ),
    ).not.toContain("error:businessVat");
  });

  it("requires the client's VAT number for reverse charge", () => {
    const rc = draft({ vatTreatment: "reverse_charge" });
    expect(codes(rc, business(), client({ ...polishClient, vatNumber: "" }))).toContain(
      "error:clientVatReverseCharge",
    );
    expect(codes(rc, business(), client(polishClient))).toEqual([]);
  });

  it("requires exemption wording under the small-business scheme", () => {
    expect(codes(draft({ vatTreatment: "exempt_small_business" }), business({ vatExempt: true }))).toContain(
      "error:exemptNote",
    );
  });

  it("requires described lines and sane dates", () => {
    expect(codes(draft({ lines: [line({ description: "" })] }))).toEqual(
      expect.arrayContaining(["error:noLines", "error:lineDescription"]),
    );
    expect(codes(draft({ dueDate: "2026-08-01" }))).toContain("error:dueBeforeIssue");
    expect(codes(draft({ issueDate: "nope" }))).toContain("error:invalidDate");
  });

  it("refuses a negative invoice (that's a credit note)", () => {
    expect(codes(draft({ lines: [line({ quantity: -1 })] }))).toContain("error:negativeInvoice");
  });

  it("warns, without blocking, about advisable details", () => {
    const issues = runChecklist(draft(), business({ iban: "", regNumber: "" }), client(), [], TODAY);
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["noIban", "noRegNumber"]));
    expect(hasBlockingIssues(issues)).toBe(false);
    expect(codes(draft({ issueDate: "2026-08-20", dueDate: "2026-09-20" }))).toContain("warning:futureDate");
    expect(codes(draft({ issueDate: "2025-12-30", dueDate: "2026-01-30" }))).toContain("warning:issueYear");
  });

  it("asks less of a quote", () => {
    const quote = { ...draft(), kind: "quote" as const };
    expect(codes(quote, business({ iban: "", regNumber: "", vatNumber: "" }))).toEqual([]);
  });
});
