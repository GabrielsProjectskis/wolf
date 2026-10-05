import { Document, Font, Image, Page as PdfPage, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import { countryName } from "../data/eu";
import { formatDate } from "./dates";
import { isCreditNote } from "./document";
import { calculateTotals, formatMoney, formatQuantity, formatRate, lineNetCents } from "./money";
import type { Address, Business, WolfDocument } from "../types";

/**
 * Fonts are embedded rather than using the PDF standard-14 Helvetica.
 * Helvetica's WinAnsi encoding has no ł ą ę (Polish), ě ř (Czech) or
 * ő ű (Hungarian); for an EU-wide tool those would silently vanish
 * from client names. IBM Plex covers Latin Extended.
 */
let fontsRegistered = false;
export const registerFonts = (base = "/fonts") => {
  if (fontsRegistered) return;
  Font.register({
    family: "Plex",
    fonts: [
      { src: `${base}/IBMPlexSans-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/IBMPlexSans-SemiBold.ttf`, fontWeight: 600 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
};

type Lang = "en" | "nl";

const L = {
  en: {
    locale: "en-IE",
    invoice: "INVOICE",
    quote: "QUOTE",
    creditNote: "CREDIT NOTE",
    draft: "DRAFT",
    draftNote: "Draft: not a valid invoice until issued.",
    number: "Number",
    issueDate: "Date",
    dueDate: "Due",
    validUntil: "Valid until",
    corrects: "Corrects",
    billTo: "Bill to",
    quoteFor: "Prepared for",
    reference: "Your reference",
    vatNumber: "VAT",
    regNumber: "Reg. no.",
    description: "Description",
    qty: "Qty",
    unitPrice: "Unit price",
    vat: "VAT",
    amount: "Amount",
    subtotal: "Subtotal",
    total: "Total",
    totalCredit: "Total credited",
    payment: "Payment",
    iban: "IBAN",
    bic: "BIC",
    terms: "Please pay by",
    payReference: "Reference",
    creditTerms: "This amount will be refunded or set off against open invoices.",
    quoteTerms: "This quote is valid until",
    reverseCharge: "VAT reverse charged to the recipient (Art. 196 EU VAT Directive 2006/112/EC).",
    exportNote: "Zero-rated: supply to a customer outside the European Union.",
    page: "Page",
    of: "of",
  },
  nl: {
    locale: "nl-NL",
    invoice: "FACTUUR",
    quote: "OFFERTE",
    creditNote: "CREDITNOTA",
    draft: "CONCEPT",
    draftNote: "Concept: pas geldig als factuur na uitgifte.",
    number: "Nummer",
    issueDate: "Datum",
    dueDate: "Vervaldatum",
    validUntil: "Geldig tot",
    corrects: "Correctie op",
    billTo: "Factuuradres",
    quoteFor: "Opgesteld voor",
    reference: "Uw referentie",
    vatNumber: "Btw",
    regNumber: "KvK",
    description: "Omschrijving",
    qty: "Aantal",
    unitPrice: "Stukprijs",
    vat: "Btw",
    amount: "Bedrag",
    subtotal: "Subtotaal",
    total: "Totaal",
    totalCredit: "Totaal gecrediteerd",
    payment: "Betaling",
    iban: "IBAN",
    bic: "BIC",
    terms: "Graag betalen voor",
    payReference: "Kenmerk",
    creditTerms: "Dit bedrag wordt terugbetaald of verrekend met openstaande facturen.",
    quoteTerms: "Deze offerte is geldig tot",
    reverseCharge: "Btw verlegd naar de afnemer (art. 196 EU-btw-richtlijn 2006/112/EG).",
    exportNote: "Nultarief: levering aan een afnemer buiten de Europese Unie.",
    page: "Pagina",
    of: "van",
  },
} as const;

const INK = "#14141A";
const MUTED = "#6C6C74";
const RULE = "#D8D8D2";

const s = StyleSheet.create({
  page: {
    fontFamily: "Plex",
    fontSize: 9,
    color: INK,
    paddingTop: 44,
    paddingBottom: 64,
    paddingHorizontal: 46,
    /*
     * No lineHeight anywhere in this document. react-pdf silently drops
     * a render-prop Text (the page counter) if it has or inherits any
     * lineHeight, which is why the first version had no page numbers.
     * Plex's own line metrics give comfortable spacing anyway, and
     * tests/pdf/pdf.test.tsx checks the counter is on every page.
     */
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logo: { maxHeight: 40, maxWidth: 150, objectFit: "contain", marginBottom: 6 },
  bizName: { fontSize: 12, fontWeight: 600 },
  muted: { color: MUTED },
  docType: { fontSize: 18, fontWeight: 600, letterSpacing: 1.2, textAlign: "right" },
  draftMark: { fontSize: 8, letterSpacing: 1, color: "#B4232A", textAlign: "right", marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  metaKey: { color: MUTED, width: 70, textAlign: "right", marginRight: 8 },
  metaVal: { width: 100, textAlign: "right" },
  parties: { flexDirection: "row", marginTop: 30, gap: 34 },
  block: { flex: 1 },
  label: { fontSize: 7, letterSpacing: 0.8, color: MUTED, marginBottom: 4 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 4,
    marginTop: 26,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    paddingVertical: 5,
  },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 58, textAlign: "right" },
  cPrice: { width: 70, textAlign: "right" },
  cVat: { width: 42, textAlign: "right" },
  cAmt: { width: 76, textAlign: "right" },
  totals: { marginTop: 12, alignSelf: "flex-end", width: 236 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: INK,
    marginTop: 4,
    paddingTop: 4,
    fontSize: 11,
    fontWeight: 600,
  },
  legend: {
    marginTop: 22,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: RULE,
    color: MUTED,
    fontSize: 8,
  },
  pageNumber: { width: 120, textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 46,
    right: 46,
    flexDirection: "row",
    justifyContent: "space-between",
    color: MUTED,
    fontSize: 7.5,
  },
});

const addressLines = (a: Address, locale: string): string[] =>
  [
    a.line1,
    a.line2,
    [a.postcode, a.city].filter(Boolean).join("  "),
    // Print the country name; a bare "PL" is not an address.
    countryName(a.country, locale),
  ].filter(Boolean);

export interface PdfOptions {
  /** Number of the invoice a credit note corrects. */
  correctsNumber?: string | null;
}

export const DocumentPdf = ({
  document: doc,
  business,
  correctsNumber = null,
}: {
  document: WolfDocument;
  business: Business;
} & PdfOptions) => {
  const lang: Lang = doc.language;
  const t = L[lang];
  const locale = t.locale;
  const totals = calculateTotals(doc.lines, doc.vatTreatment);
  const money = (cents: number) => formatMoney(cents, doc.currency, locale);
  const date = (iso: string) => formatDate(iso, locale);
  const isInvoice = doc.kind === "invoice";
  const credit = isCreditNote(doc);
  const draft = doc.status === "draft";
  const title = credit ? t.creditNote : isInvoice ? t.invoice : t.quote;
  const footerLeft = [business.name, doc.number ?? t.draft].filter(Boolean).join("  ·  ");

  return (
    <Document
      title={`${title} ${doc.number ?? t.draft}`}
      author={business.name}
      creator="Wolf"
      producer="Wolf"
    >
      <PdfPage size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            {business.logo && <Image src={business.logo} style={s.logo} />}
            <Text style={s.bizName}>{business.name}</Text>
            {addressLines(business.address, locale).map((line, i) => (
              <Text key={i} style={s.muted}>
                {line}
              </Text>
            ))}
            {[business.email, business.phone, business.website].filter(Boolean).length > 0 && (
              <Text style={s.muted}>
                {[business.email, business.phone, business.website].filter(Boolean).join("  ·  ")}
              </Text>
            )}
            {business.vatNumber && !/^[A-Z]{2,3}$/.test(business.vatNumber) ? (
              <Text style={s.muted}>
                {t.vatNumber} {business.vatNumber}
              </Text>
            ) : null}
            {business.regNumber ? (
              <Text style={s.muted}>
                {t.regNumber} {business.regNumber}
              </Text>
            ) : null}
          </View>

          <View style={{ width: 190 }}>
            <Text style={s.docType}>{title}</Text>
            {draft && <Text style={s.draftMark}>{t.draft}</Text>}
            <View style={{ marginTop: 10 }}>
              <View style={s.metaRow}>
                <Text style={s.metaKey}>{t.number}</Text>
                <Text style={s.metaVal}>{doc.number ?? t.draft}</Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.metaKey}>{t.issueDate}</Text>
                <Text style={s.metaVal}>{date(doc.issueDate)}</Text>
              </View>
              {credit ? (
                correctsNumber ? (
                  <View style={s.metaRow}>
                    <Text style={s.metaKey}>{t.corrects}</Text>
                    <Text style={s.metaVal}>{correctsNumber}</Text>
                  </View>
                ) : null
              ) : (
                <View style={s.metaRow}>
                  <Text style={s.metaKey}>{isInvoice ? t.dueDate : t.validUntil}</Text>
                  <Text style={s.metaVal}>{date(doc.dueDate)}</Text>
                </View>
              )}
              {doc.client?.reference ? (
                <View style={s.metaRow}>
                  <Text style={s.metaKey}>{t.reference}</Text>
                  <Text style={s.metaVal}>{doc.client.reference}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={s.parties}>
          <View style={s.block}>
            <Text style={s.label}>{(isInvoice ? t.billTo : t.quoteFor).toUpperCase()}</Text>
            <Text style={{ fontWeight: 600 }}>{doc.client?.name ?? "-"}</Text>
            {doc.client
              ? addressLines(doc.client.address, locale).map((line, i) => (
                  <Text key={i} style={s.muted}>
                    {line}
                  </Text>
                ))
              : null}
            {doc.client?.vatNumber ? (
              <Text style={s.muted}>
                {t.vatNumber} {doc.client.vatNumber}
              </Text>
            ) : null}
          </View>

          {isInvoice && !credit && business.iban ? (
            <View style={s.block}>
              <Text style={s.label}>{t.payment.toUpperCase()}</Text>
              <Text>
                {t.iban} {business.iban}
              </Text>
              {business.bic ? (
                <Text style={s.muted}>
                  {t.bic} {business.bic}
                </Text>
              ) : null}
              {doc.number ? (
                <Text style={s.muted}>
                  {t.payReference} {doc.number}
                </Text>
              ) : null}
              <Text style={s.muted}>
                {t.terms} {date(doc.dueDate)}
              </Text>
            </View>
          ) : (
            <View style={s.block} />
          )}
        </View>

        <View>
          <View style={s.tableHead} fixed>
            <Text style={[s.cDesc, s.label]}>{t.description.toUpperCase()}</Text>
            <Text style={[s.cQty, s.label]}>{t.qty.toUpperCase()}</Text>
            <Text style={[s.cPrice, s.label]}>{t.unitPrice.toUpperCase()}</Text>
            <Text style={[s.cVat, s.label]}>{t.vat.toUpperCase()}</Text>
            <Text style={[s.cAmt, s.label]}>{t.amount.toUpperCase()}</Text>
          </View>

          {doc.lines
            .filter((line) => line.description.trim() || lineNetCents(line) !== 0)
            .map((line) => (
              <View key={line.id} style={s.row} wrap={false}>
                <Text style={s.cDesc}>{line.description}</Text>
                <Text style={s.cQty}>
                  {formatQuantity(line.quantity, locale)}
                  {line.unit ? ` ${line.unit}` : ""}
                </Text>
                <Text style={s.cPrice}>{money(line.unitPriceCents)}</Text>
                <Text style={s.cVat}>
                  {formatRate(doc.vatTreatment === "standard" ? line.vatRate : 0, locale)}
                </Text>
                <Text style={s.cAmt}>{money(lineNetCents(line))}</Text>
              </View>
            ))}
        </View>

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={s.muted}>{t.subtotal}</Text>
            <Text>{money(totals.netCents)}</Text>
          </View>
          {totals.groups.map((g) => (
            <View key={g.rate} style={s.totalRow}>
              <Text style={s.muted}>
                {t.vat} {formatRate(g.rate, locale)}
              </Text>
              <Text>{money(g.vatCents)}</Text>
            </View>
          ))}
          <View style={s.grand}>
            <Text>{credit ? t.totalCredit : t.total}</Text>
            <Text>{money(totals.grossCents)}</Text>
          </View>
        </View>

        <View style={s.legend} wrap={false}>
          {doc.vatTreatment === "reverse_charge" && <Text>{t.reverseCharge}</Text>}
          {doc.vatTreatment === "export" && <Text>{t.exportNote}</Text>}
          {doc.vatTreatment === "exempt_small_business" && business.vatExemptNote ? (
            <Text>{business.vatExemptNote}</Text>
          ) : null}
          {credit && <Text>{t.creditTerms}</Text>}
          {!isInvoice && (
            <Text>
              {t.quoteTerms} {date(doc.dueDate)}.
            </Text>
          )}
          {draft && <Text>{t.draftNote}</Text>}
          {doc.notes ? <Text style={{ marginTop: 4, color: INK }}>{doc.notes}</Text> : null}
        </View>

        <View style={s.footer} fixed>
          <Text>{footerLeft}</Text>
          <Text
            style={s.pageNumber}
            render={({ pageNumber, totalPages }) => `${t.page} ${pageNumber} ${t.of} ${totalPages}`}
          />
        </View>
      </PdfPage>
    </Document>
  );
};

export const renderPdfBlob = async (
  doc: WolfDocument,
  business: Business,
  options: PdfOptions = {},
): Promise<Blob> => {
  registerFonts();
  return pdf(<DocumentPdf document={doc} business={business} {...options} />).toBlob();
};

/**
 * "F2026-001-Lodz-Sp-z-o-o.pdf". Text is NFC-normalised first: a name
 * pasted from macOS often arrives decomposed (o + combining accent), and
 * the combining mark would otherwise split the word in two ("Lo-dz").
 */
export const pdfFileName = (doc: Pick<WolfDocument, "number" | "client">, draftLabel = "draft"): string => {
  const slug = (text: string, max: number) =>
    text
      .normalize("NFC")
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, max)
      .replace(/-$/, "");
  const number = slug(doc.number ?? draftLabel, 40) || draftLabel;
  const who = slug(doc.client?.name ?? "", 40);
  return `${[number, who].filter(Boolean).join("-")}.pdf`;
};
