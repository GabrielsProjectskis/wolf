import { addDocument, issue, upsertClient } from "../src/lib/actions";
import { newDraft } from "../src/lib/document";
import { emptyData, type Business, type Client, type LineItem, type WolfData } from "../src/types";

export const TODAY = "2026-08-13";

export const business = (patch: Partial<Business> = {}): Business => ({
  ...emptyData().business,
  name: "Stellera",
  address: { line1: "Coolsingel 1", line2: "", postcode: "3012 AA", city: "Rotterdam", country: "NL" },
  vatNumber: "NL123456789B01",
  regNumber: "12345678",
  iban: "NL91 ABNA 0417 1643 00",
  bic: "ABNANL2A",
  email: "hello@stellera.nl",
  currency: "EUR",
  paymentTermDays: 30,
  ...patch,
});

export const dutchClient: Omit<Client, "id" | "createdAt"> = {
  name: "Bakkerij de Vries",
  address: { line1: "Markt 4", line2: "", postcode: "3011 AA", city: "Rotterdam", country: "NL" },
  vatNumber: "",
  email: "info@devries.nl",
  reference: "",
};

export const polishClient: Omit<Client, "id" | "createdAt"> = {
  name: "Wydawnictwo Łódź Sp. z o.o.",
  address: { line1: "ul. Piotrkowska 5", line2: "", postcode: "90-001", city: "Łódź", country: "PL" },
  vatNumber: "PL1234567890",
  email: "ksiegowosc@example.pl",
  reference: "PO-4471",
};

export const line = (patch: Partial<LineItem> = {}): LineItem => ({
  id: Math.random().toString(36).slice(2),
  description: "Interface design",
  quantity: 7.5,
  unit: "h",
  unitPriceCents: 8500,
  vatRate: 21,
  ...patch,
});

/** A set-up business with one client and nothing issued. */
export const baseData = (patch: Partial<Business> = {}): { data: WolfData; client: Client } => {
  const data: WolfData = {
    ...emptyData(),
    business: business(patch),
    initialised: true,
    counters: {
      invoice: { prefix: "F", next: 1, year: 2026, pad: 3 },
      quote: { prefix: "OFF", next: 1, year: 2026, pad: 3 },
    },
  };
  const { data: withClient, client } = upsertClient(data, dutchClient);
  return { data: withClient, client };
};

/** Adds a ready-to-issue draft and returns its id. */
export const withDraft = (
  data: WolfData,
  clientId: string,
  kind: "invoice" | "quote" = "invoice",
  lines: LineItem[] = [line()],
): { data: WolfData; id: string } => {
  const draft = { ...newDraft(kind, data.business, 21, TODAY), clientId, lines };
  return { data: addDocument(data, draft), id: draft.id };
};

export const issuedInvoice = (lines: LineItem[] = [line()]) => {
  const { data, client } = baseData();
  const { data: d1, id } = withDraft(data, client.id, "invoice", lines);
  return { data: issue(d1, id, TODAY), id, client };
};
