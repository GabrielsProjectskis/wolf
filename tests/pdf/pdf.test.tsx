import { mkdirSync, writeFileSync } from "node:fs";
import { pdf } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { beforeAll, describe, expect, it } from "vitest";
import { DocumentPdf, pdfFileName, registerFonts } from "../../src/lib/pdf";
import { snapshotClient } from "../../src/lib/document";
import type { Business, WolfDocument } from "../../src/types";
import { business, line, polishClient } from "../fixtures";

/**
 * Renders real documents to PDF bytes and reads the text back out with
 * pdf.js. PDF generation is the piece most likely to break silently, so
 * these assert on what's actually on the page.
 */

beforeAll(() => registerFonts("public/fonts"));

const OUT = "tests/pdf/out";
mkdirSync(OUT, { recursive: true });

const render = async (doc: WolfDocument, b: Business = business(), correctsNumber: string | null = null) => {
  const stream = (await pdf(
    <DocumentPdf document={doc} business={b} correctsNumber={correctsNumber} />,
  ).toBuffer()) as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const bytes = Buffer.concat(chunks);
  const parsed = await getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
  }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= parsed.numPages; i++) {
    const content = await (await parsed.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return { bytes, pages, text: pages.join("\n") };
};

const client = snapshotClient({ ...polishClient, id: "c1", createdAt: "" });

const invoice = (patch: Partial<WolfDocument> = {}): WolfDocument => ({
  id: "d1",
  kind: "invoice",
  number: "F2026-001",
  sequence: 1,
  status: "sent",
  issueDate: "2026-08-13",
  dueDate: "2026-09-12",
  clientId: "c1",
  client,
  lines: [
    line({ id: "l1", description: "Interface design", quantity: 7.5 }),
    line({
      id: "l2",
      description: "Printed handbook",
      quantity: 40,
      unit: "pcs",
      unitPriceCents: 1250,
      vatRate: 9,
    }),
  ],
  currency: "EUR",
  vatTreatment: "reverse_charge",
  language: "en",
  notes: "Thanks for your business.",
  createdAt: "2026-08-13T09:00:00.000Z",
  issuedAt: "2026-08-13T09:10:00.000Z",
  settledAt: null,
  ...patch,
});

describe("invoice PDF", () => {
  it("is a valid PDF with embedded fonts", async () => {
    const { bytes } = await render(invoice());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.subarray(-1024).includes("%%EOF")).toBe(true);
    expect(bytes.includes("FontFile2")).toBe(true);
    writeFileSync(`${OUT}/sample-invoice.pdf`, bytes);
  });

  it("keeps Polish characters that Helvetica would drop", async () => {
    const { text } = await render(invoice());
    expect(text).toContain("Łódź");
    expect(text).toContain("Wydawnictwo Łódź Sp. z o.o.");
  });

  it("prints everything Art. 226 requires for a reverse-charge invoice", async () => {
    const { text } = await render(invoice());
    for (const expected of [
      "INVOICE",
      "F2026-001",
      "13 August 2026",
      "Stellera",
      "Coolsingel 1",
      "VAT NL123456789B01",
      "VAT PL1234567890",
      "Poland", // a country name, not "PL"
      "Art. 196",
      "€1,137.50",
      "NL91 ABNA 0417 1643 00",
      "Reference F2026-001",
      "Your reference",
      "PO-4471",
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(text).not.toMatch(/\bPL\b(?!\d)/);
  });

  it("numbers pages on long invoices", async () => {
    const lines = Array.from({ length: 70 }, (_, i) =>
      line({ id: `l${i}`, description: `Work item ${i + 1}`, quantity: 1 }),
    );
    const { pages, bytes } = await render(invoice({ lines, vatTreatment: "standard" }));
    writeFileSync(`${OUT}/sample-long.pdf`, bytes);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    pages.forEach((page, i) => expect(page).toContain(`Page ${i + 1} of ${pages.length}`));
    // Column headings repeat on every page.
    // Letter-spaced labels come out of pdf.js as "D E S C R I P T I O N".
    pages.forEach((page) => expect(page.replace(/(?<=\b\w) (?=\w\b)/g, "")).toMatch(/DESCRIPTION/));
  });

  it("renders in Dutch with Dutch dates, numbers and legal wording", async () => {
    const { text } = await render(invoice({ language: "nl" }));
    for (const expected of [
      "FACTUUR",
      "13 augustus 2026",
      "Polen",
      "Btw verlegd",
      "7,5 h",
      "Pagina 1 van 1",
    ]) {
      expect(text, expected).toContain(expected);
    }
  });

  it("prints a credit note without negative zero and with the invoice it corrects", async () => {
    const credit = invoice({
      id: "d2",
      number: "F2026-002",
      correctsDocumentId: "d1",
      vatTreatment: "standard",
      lines: [
        line({ quantity: -7.5 }),
        line({ id: "z", description: "Zero line", quantity: -1, unitPriceCents: 0, vatRate: 9 }),
      ],
    });
    const { text, bytes } = await render(credit, business(), "F2026-001");
    expect(text).toContain("CREDIT NOTE");
    expect(text).toContain("Corrects");
    expect(text).toContain("F2026-001");
    expect(text).toContain("-€771.38");
    expect(text).not.toContain("-€0.00");
    expect(text).not.toContain("Please pay by");
    writeFileSync(`${OUT}/sample-credit-note.pdf`, bytes);
  });

  it("marks drafts clearly", async () => {
    const { text } = await render(invoice({ status: "draft", number: null, sequence: null }));
    expect(text).toContain("DRAFT");
    expect(text).toContain("not a valid invoice until issued");
  });

  it("prints the exemption wording under the small-business scheme", async () => {
    const b = business({ vatExempt: true, vatExemptNote: "Vrijgesteld van btw (KOR)" });
    const { text } = await render(invoice({ vatTreatment: "exempt_small_business" }), b);
    expect(text).toContain("Vrijgesteld van btw (KOR)");
  });

  it("writes the demo samples used in the README", async () => {
    const { demoData } = await import("../e2e/demo-data");
    const demo = demoData();
    const pick = (n: string) => demo.documents.find((d) => d.number === n)!;
    writeFileSync(`${OUT}/demo-reverse-charge.pdf`, (await render(pick("F2026-003"), demo.business)).bytes);
    writeFileSync(
      `${OUT}/demo-credit-note.pdf`,
      (await render(pick("F2026-005"), demo.business, "F2026-004")).bytes,
    );
    const nl = { ...pick("F2026-007"), language: "nl" as const };
    writeFileSync(`${OUT}/demo-dutch.pdf`, (await render(nl, demo.business)).bytes);
  });

  it("writes a Dutch sample for the README", async () => {
    const { bytes } = await render(
      invoice({
        language: "nl",
        vatTreatment: "standard",
        client: snapshotClient({
          id: "c2",
          createdAt: "",
          name: "Bakkerij de Vries",
          address: { line1: "Markt 4", line2: "", postcode: "3011 AA", city: "Rotterdam", country: "NL" },
          vatNumber: "",
          email: "",
          reference: "",
        }),
      }),
    );
    writeFileSync(`${OUT}/sample-invoice-nl.pdf`, bytes);
  });
});

describe("PDF file names", () => {
  it("keeps accented letters whole, including decomposed ones from macOS", () => {
    expect(pdfFileName({ number: "F2026-001", client: { ...client, name: "Łódź Sp. z o.o." } })).toBe(
      "F2026-001-Łódź-Sp-z-o-o.pdf",
    );
    expect(pdfFileName({ number: "F1", client: { ...client, name: "Lódź" } })).toBe("F1-Lódź.pdf");
  });
  it("cannot be used to escape the folder", () => {
    expect(pdfFileName({ number: "../../x", client: { ...client, name: "../evil" } })).toBe("x-evil.pdf");
  });
  it("names drafts", () => {
    expect(pdfFileName({ number: null, client: null })).toBe("draft.pdf");
  });
});
