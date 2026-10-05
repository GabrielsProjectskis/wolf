import {
  addDocument,
  convertQuote,
  createCreditNote,
  issue,
  markPaid,
  setQuoteOutcome,
  updateDraft,
  upsertClient,
} from "../../src/lib/actions";
import { addDays } from "../../src/lib/dates";
import { newDraft } from "../../src/lib/document";
import { newId } from "../../src/lib/id";
import { emptyData, type LineItem, type WolfData } from "../../src/types";

/** A believable, entirely fictional business for screenshots and demos. */
export const demoData = (today = "2026-10-05"): WolfData => {
  let data: WolfData = {
    ...emptyData(),
    initialised: true,
    business: {
      ...emptyData().business,
      name: "Studio Noord",
      address: { line1: "Westersingel 18", line2: "", postcode: "3014 GN", city: "Rotterdam", country: "NL" },
      vatNumber: "NL004495445B01",
      regNumber: "81234567",
      iban: "NL91 ABNA 0417 1643 00",
      bic: "ABNANL2A",
      email: "hallo@studionoord.example",
      website: "studionoord.example",
      paymentTermDays: 30,
      defaultNotes: "Thank you for working with Studio Noord.",
    },
    counters: {
      invoice: { prefix: "F", next: 1, year: 2026, pad: 3 },
      quote: { prefix: "OFF", next: 1, year: 2026, pad: 3 },
    },
  };

  const client = (c: Parameters<typeof upsertClient>[1]) => {
    const r = upsertClient(data, c);
    data = r.data;
    return r.client.id;
  };
  const vries = client({
    name: "Bakkerij de Vries",
    address: { line1: "Markt 4", line2: "", postcode: "3011 AA", city: "Rotterdam", country: "NL" },
    vatNumber: "",
    email: "info@bakkerijdevries.example",
    reference: "",
  });
  const lodz = client({
    name: "Wydawnictwo Łódź Sp. z o.o.",
    address: { line1: "ul. Piotrkowska 5", line2: "", postcode: "90-001", city: "Łódź", country: "PL" },
    vatNumber: "PL5260250995",
    email: "ksiegowosc@wydawnictwo.example",
    reference: "PO-4471",
  });
  const berlin = client({
    name: "Kranich Mobility GmbH",
    address: { line1: "Torstraße 140", line2: "", postcode: "10119", city: "Berlin", country: "DE" },
    vatNumber: "DE811569869",
    email: "ap@kranich.example",
    reference: "",
  });
  const gent = client({
    name: "Atelier Vandamme",
    address: { line1: "Veldstraat 22", line2: "", postcode: "9000", city: "Gent", country: "BE" },
    vatNumber: "BE0403170701",
    email: "",
    reference: "",
  });
  const nyc = client({
    name: "Harbor & Pine LLC",
    address: {
      line1: "55 Water Street",
      line2: "",
      postcode: "NY 10041",
      city: "New York, United States",
      country: "XX",
    },
    vatNumber: "",
    email: "",
    reference: "",
  });

  const l = (description: string, quantity: number, unit: string, euros: number, vatRate = 21): LineItem => ({
    id: newId(),
    description,
    quantity,
    unit,
    unitPriceCents: Math.round(euros * 100),
    vatRate,
  });

  const make = (
    kind: "invoice" | "quote",
    clientId: string,
    issueDate: string,
    lines: LineItem[],
    treatment: "standard" | "reverse_charge" | "export" = "standard",
  ) => {
    const draft = newDraft(kind, data.business, 21, issueDate);
    data = addDocument(data, draft);
    data = updateDraft(data, draft.id, {
      clientId,
      lines,
      vatTreatment: treatment,
      dueDate: addDays(issueDate, kind === "invoice" ? 30 : 30),
    });
    data = issue(data, draft.id, today);
    return draft.id;
  };

  const a = make("invoice", vries, "2026-06-02", [
    l("Brand identity: logo and type", 1, "", 2400),
    l("Packaging design, bread bags", 12, "h", 85),
  ]);
  data = markPaid(data, a, "2026-06-20T10:00:00Z");
  const b = make(
    "invoice",
    lodz,
    "2026-07-14",
    [l("Book cover series, 3 titles", 3, "pcs", 950), l("Interior layout", 22.5, "h", 85)],
    "reverse_charge",
  );
  data = markPaid(data, b, "2026-08-05T10:00:00Z");
  make(
    "invoice",
    berlin,
    "2026-08-20",
    [l("App onboarding redesign", 38, "h", 95), l("Usability test sessions", 5, "pcs", 180)],
    "reverse_charge",
  );
  const d = make(
    "invoice",
    gent,
    "2026-09-08",
    [l("Exhibition catalogue design", 1, "", 3200)],
    "reverse_charge",
  );
  const credit = createCreditNote(data, d, "2026-09-15");
  data = updateDraft(credit.data, credit.id, { lines: [l("Agreed discount, catalogue", -1, "", 400, 21)] });
  data = issue(data, credit.id, today);
  make("invoice", nyc, "2026-09-22", [l("Website illustrations", 8, "pcs", 220, 0)], "export");
  make("invoice", vries, "2026-10-01", [
    l("Seasonal posters, autumn", 6, "pcs", 140),
    l("Print management", 3, "h", 85, 21),
  ]);

  const q1 = make(
    "quote",
    berlin,
    "2026-09-25",
    [l("Design system, phase 2", 60, "h", 95)],
    "reverse_charge",
  );
  const q2 = make("quote", vries, "2026-08-01", [l("Shop signage", 1, "", 1800)]);
  data = convertQuote(data, q2, "2026-08-10").data;
  data = {
    ...data,
    documents: data.documents.filter((x) => !(x.fromQuoteId === q2 && x.status === "draft")),
  };
  const q3 = make("quote", gent, "2026-07-01", [l("Website refresh", 1, "", 5400)], "reverse_charge");
  data = setQuoteOutcome(data, q3, "declined");
  void q1;

  // One open draft.
  const draft = newDraft("invoice", data.business, 21, today);
  data = addDocument(data, draft);
  data = updateDraft(data, draft.id, {
    clientId: vries,
    lines: [l("Menu card redesign", 14, "h", 85), l("Photography, half day", 1, "", 450, 21)],
  });

  // Record each issue as happening on its issue date, as it would have.
  data = {
    ...data,
    documents: data.documents.map((x) =>
      x.issuedAt ? { ...x, issuedAt: `${x.issueDate}T09:00:00.000Z` } : x,
    ),
  };
  return data;
};
