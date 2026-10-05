import { useCallback, useMemo, useState } from "react";
import { ClientFields, emptyClientDraft, type ClientDraft } from "../components/ClientFields";
import { useConfirm } from "../components/ui/Dialog";
import { DecimalInput } from "../components/ui/DecimalInput";
import { Field, FieldGrid, Section } from "../components/ui/Field";
import { Page } from "../components/ui/Page";
import { StatusPill } from "../components/ui/StatusPill";
import { useToast } from "../components/ui/Toast";
import { vatRatesFor } from "../data/eu";
import { localeFor, useT, type Translator } from "../i18n";
import {
  ActionError,
  convertQuote,
  createCreditNote,
  deleteDraft,
  duplicate,
  issue,
  markPaid,
  markUnpaid,
  setQuoteOutcome,
  updateDraft,
  upsertClient,
  type DraftPatch,
} from "../lib/actions";
import { hasBlockingIssues, runChecklist, type CheckIssue } from "../lib/checklist";
import { formatDate } from "../lib/dates";
import {
  creditableAmount,
  displayStatus,
  emptyLine,
  isCreditNote,
  suggestVatTreatment,
} from "../lib/document";
import {
  calculateTotals,
  centsToInput,
  formatMoney,
  formatQuantity,
  formatRate,
  lineNetCents,
  parseAmount,
  parseQuantity,
} from "../lib/money";
import { previewNumber } from "../lib/numbering";
import { useStore } from "../store/store";
import { VAT_TREATMENTS, type LineItem, type UILanguage, type VatTreatment, type WolfData } from "../types";

const LINE_COLUMNS = "minmax(0,1fr) 72px 60px 104px 82px 104px 30px";

export const DocumentEditor = ({
  documentId,
  onClose,
  onOpen,
}: {
  documentId: string;
  onClose: () => void;
  onOpen: (id: string) => void;
}) => {
  const { data, apply } = useStore();
  const t = useT();
  const confirm = useConfirm();
  const notify = useToast();
  const doc = data.documents.find((d) => d.id === documentId);

  const [addingClient, setAddingClient] = useState(false);
  const [clientDraft, setClientDraft] = useState<ClientDraft>(() =>
    emptyClientDraft(data.business.address.country),
  );
  const [busy, setBusy] = useState(false);

  const uiLocale = localeFor(data.preferences.language);
  const totals = useMemo(
    () => calculateTotals(doc?.lines ?? [], doc?.vatTreatment ?? "standard"),
    [doc?.lines, doc?.vatTreatment],
  );

  /** Runs an action and reports a refusal instead of crashing the screen. */
  const run = useCallback(
    (change: (d: WolfData) => WolfData): boolean => {
      try {
        apply(change);
        return true;
      } catch (e) {
        notify(e instanceof ActionError ? t(`error.${e.code}`) : String(e), "error");
        return false;
      }
    },
    [apply, notify, t],
  );

  if (!doc) {
    return (
      <Page maxWidth={720}>
        <p>{t("editor.missing")}</p>
        <button className="btn" onClick={onClose} style={{ marginTop: 12 }}>
          {t("action.back")}
        </button>
      </Page>
    );
  }

  const locked = doc.status !== "draft";
  const credit = isCreditNote(doc);
  const isInvoice = doc.kind === "invoice";
  const original = credit ? data.documents.find((d) => d.id === doc.correctsDocumentId) : undefined;
  const docLocale = localeFor(doc.language);
  const money = (c: number) => formatMoney(c, doc.currency, uiLocale);
  const rates = [
    ...new Set([...vatRatesFor(data.business.address.country), ...doc.lines.map((l) => l.vatRate)]),
  ];
  const selectedClient = data.clients.find((c) => c.id === doc.clientId) ?? null;
  const status = displayStatus(doc, data.documents);

  const patch = (p: DraftPatch) => run((d) => updateDraft(d, doc.id, p));
  const setLine = (id: string, p: Partial<LineItem>) =>
    patch({ lines: doc.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });

  const chooseClient = (id: string) => {
    const client = data.clients.find((c) => c.id === id) ?? null;
    patch({ clientId: id || null, vatTreatment: suggestVatTreatment(data.business, client) });
  };

  const saveNewClient = () => {
    if (!clientDraft.name.trim()) return;
    let createdId = "";
    const ok = run((d) => {
      const result = upsertClient(d, clientDraft);
      createdId = result.client.id;
      return updateDraft(result.data, doc.id, {
        clientId: result.client.id,
        vatTreatment: suggestVatTreatment(d.business, result.client),
      });
    });
    if (ok && createdId) {
      setAddingClient(false);
      setClientDraft(emptyClientDraft(data.business.address.country));
    }
  };

  const checkClient = credit ? (original?.client ?? null) : selectedClient;
  const issues = locked ? [] : runChecklist(doc, data.business, checkClient, data.documents);
  const blocked = hasBlockingIssues(issues);
  const kindLabel = credit ? t("kind.creditNote") : isInvoice ? t("kind.invoice") : t("kind.quote");
  const issueLabel = t(
    credit ? "editor.issueCredit" : isInvoice ? "editor.issueInvoice" : "editor.issueQuote",
  );
  const nextNumber = previewNumber(isInvoice ? data.counters.invoice : data.counters.quote);

  const onIssue = async () => {
    const ok = await confirm({
      title: t("editor.issueConfirmTitle", { kind: kindLabel.toLowerCase(), number: nextNumber }),
      body: t("editor.issueConfirmBody"),
      confirmLabel: issueLabel,
      cancelLabel: t("action.cancel"),
    });
    if (!ok) return;
    if (run((d) => issue(d, doc.id))) notify(t("editor.issued", { number: nextNumber }), "success");
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: t("editor.deleteConfirmTitle"),
      body: t("editor.deleteConfirmBody"),
      confirmLabel: t("action.delete"),
      cancelLabel: t("action.cancel"),
      danger: true,
    });
    if (ok && run((d) => deleteDraft(d, doc.id))) onClose();
  };

  const createAndOpen = (make: (d: WolfData) => { data: WolfData; id: string }, message: string) => {
    let id = "";
    if (
      run((d) => {
        const created = make(d);
        id = created.id;
        return created.data;
      })
    ) {
      notify(message, "success");
      onOpen(id);
    }
  };

  const onCredit = async () => {
    const ok = await confirm({
      title: t("editor.creditConfirmTitle", { number: doc.number ?? "" }),
      body: t("editor.creditConfirmBody"),
      confirmLabel: t("editor.createCredit"),
      cancelLabel: t("action.cancel"),
    });
    if (ok) createAndOpen((d) => createCreditNote(d, doc.id), t("editor.creditCreated"));
  };

  const makePdf = async () => {
    setBusy(true);
    try {
      const { savePdf } = await import("../lib/savePdf");
      const where = await savePdf(doc, data.business, original?.number ?? null, data.clients);
      notify(t("editor.pdfSaved", { where }), "success");
    } catch (e) {
      notify(t("editor.pdfFailed", { reason: e instanceof Error ? e.message : String(e) }), "error");
    } finally {
      setBusy(false);
    }
  };

  const clientBlock = doc.client ?? (credit ? original?.client : null);

  return (
    <Page maxWidth={920} padding="var(--space-5) var(--space-6) var(--space-8)">
      <header className="editor-head">
        <button className="btn btn--ghost" onClick={onClose}>
          ← {t("action.back")}
        </button>
        <h1 className="editor-head__title">
          {kindLabel}{" "}
          <span className="num" style={{ color: "var(--text-muted)" }}>
            {doc.number ?? t("editor.numberOnIssue", { number: nextNumber })}
          </span>
        </h1>
        <StatusPill status={status} />
      </header>

      {credit && original && (
        <p className="editor-note">
          {t("editor.correcting")}{" "}
          <button className="link" onClick={() => onOpen(original.id)}>
            {original.number}
          </button>
          {!locked && (
            <> · {t("editor.creditHint", { amount: money(creditableAmount(original, data.documents)) })}</>
          )}
        </p>
      )}
      {locked && <p className="editor-note">{t("editor.lockedNote")}</p>}

      <div className="stack-6">
        <Section title={t("editor.details")}>
          <FieldGrid columns={3}>
            <Field label={t("editor.client")} span={2}>
              {locked || credit ? (
                <div className="readonly">
                  {clientBlock ? (
                    <>
                      <strong>{clientBlock.name}</strong>
                      <span className="muted">
                        {[clientBlock.address.line1, clientBlock.address.postcode, clientBlock.address.city]
                          .filter(Boolean)
                          .join(", ")}
                        {clientBlock.vatNumber ? ` · ${clientBlock.vatNumber}` : ""}
                      </span>
                    </>
                  ) : (
                    t("editor.noClient")
                  )}
                </div>
              ) : (
                <div className="row-2 row-2--nowrap">
                  <select
                    className="select"
                    aria-label={t("editor.client")}
                    value={doc.clientId ?? ""}
                    onChange={(e) => chooseClient(e.target.value)}
                  >
                    <option value="">{t("editor.selectClient")}</option>
                    {[...data.clients]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <button
                    className="btn"
                    aria-expanded={addingClient}
                    onClick={() => setAddingClient((v) => !v)}
                  >
                    {addingClient ? t("action.cancel") : t("editor.newClient")}
                  </button>
                </div>
              )}
            </Field>
            <Field label={t("editor.docLanguage")} hint={locked ? undefined : t("editor.docLanguageHint")}>
              <select
                className="select"
                value={doc.language}
                disabled={locked}
                onChange={(e) => patch({ language: e.target.value as UILanguage })}
              >
                <option value="en">English</option>
                <option value="nl">Nederlands</option>
              </select>
            </Field>
            <Field label={t("editor.issueDate")}>
              <input
                className="input input--mono"
                type="date"
                required
                value={doc.issueDate}
                disabled={locked}
                onChange={(e) => e.target.value && patch({ issueDate: e.target.value })}
              />
            </Field>
            <Field
              label={
                credit ? t("editor.creditDate") : isInvoice ? t("editor.dueDate") : t("editor.validUntil")
              }
            >
              <input
                className="input input--mono"
                type="date"
                required
                value={doc.dueDate}
                min={doc.issueDate}
                disabled={locked}
                onChange={(e) => e.target.value && patch({ dueDate: e.target.value })}
              />
            </Field>
            <Field label={t("editor.vatTreatment")} hint={t(`treatment.${doc.vatTreatment}.note`)}>
              <select
                className="select"
                value={doc.vatTreatment}
                disabled={locked || credit}
                onChange={(e) => patch({ vatTreatment: e.target.value as VatTreatment })}
              >
                {VAT_TREATMENTS.map((x) => (
                  <option key={x} value={x}>
                    {t(`treatment.${x}`)}
                  </option>
                ))}
              </select>
            </Field>
          </FieldGrid>

          {addingClient && !locked && (
            <form
              className="panel subform"
              aria-label={t("editor.newClient")}
              onSubmit={(e) => {
                e.preventDefault();
                saveNewClient();
              }}
            >
              <ClientFields value={clientDraft} onChange={(p) => setClientDraft((c) => ({ ...c, ...p }))} />
              <div>
                <button type="submit" className="btn btn--primary" disabled={!clientDraft.name.trim()}>
                  {t("clients.save")}
                </button>
              </div>
            </form>
          )}
        </Section>

        <Section title={t("editor.lines")}>
          {credit && !locked && <p className="muted small">{t("editor.creditLinesHint")}</p>}
          <div className="lines">
            <div
              className="lines__row lines__head"
              aria-hidden="true"
              style={{ gridTemplateColumns: LINE_COLUMNS }}
            >
              <span className="label">{t("line.description")}</span>
              <span className="label right">{t("line.qty")}</span>
              <span className="label">{t("line.unit")}</span>
              <span className="label right">{t("line.price")}</span>
              <span className="label right">{t("line.vat")}</span>
              <span className="label right">{t("line.amount")}</span>
              <span />
            </div>

            {doc.lines.map((line, index) => (
              <LineRow
                key={line.id}
                line={line}
                index={index}
                locked={locked}
                currency={doc.currency}
                locale={uiLocale}
                rates={rates}
                zeroRated={doc.vatTreatment !== "standard"}
                canRemove={!locked && doc.lines.length > 1}
                t={t}
                money={money}
                onChange={(p) => setLine(line.id, p)}
                onRemove={() => patch({ lines: doc.lines.filter((l) => l.id !== line.id) })}
              />
            ))}

            {!locked && !credit && (
              <div style={{ marginTop: 4 }}>
                <button
                  className="btn"
                  onClick={() =>
                    patch({ lines: [...doc.lines, emptyLine(doc.lines.at(-1)?.vatRate ?? rates[0])] })
                  }
                >
                  + {t("editor.addLine")}
                </button>
              </div>
            )}
          </div>

          <dl className="totals">
            <div>
              <dt>{t("totals.subtotal")}</dt>
              <dd className="num">{money(totals.netCents)}</dd>
            </div>
            {totals.groups.map((g) => (
              <div key={g.rate} className="muted">
                <dt>
                  {t("line.vat")} {formatRate(g.rate, uiLocale)}
                </dt>
                <dd className="num">{money(g.vatCents)}</dd>
              </div>
            ))}
            <div className="totals__grand">
              <dt>{t("totals.total")}</dt>
              <dd className="num" data-testid="grand-total">
                {money(totals.grossCents)}
              </dd>
            </div>
          </dl>
        </Section>

        <Section title={t("editor.notes")}>
          <Field label={t("editor.notesLabel")} hint={locked ? undefined : t("editor.notesHint")}>
            <textarea
              className="textarea"
              value={doc.notes}
              maxLength={2000}
              disabled={locked}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </Field>
        </Section>

        {!locked && <Checklist issues={issues} t={t} />}

        <div className="actionbar">
          {!locked && (
            <button className="btn btn--primary btn--lg" disabled={blocked} onClick={onIssue}>
              {issueLabel}
            </button>
          )}
          <button className="btn btn--lg" disabled={busy} onClick={makePdf}>
            {busy ? t("editor.rendering") : locked ? t("editor.savePdf") : t("editor.previewPdf")}
          </button>

          {isInvoice && doc.status === "sent" && (
            <button
              className="btn"
              onClick={() =>
                run((d) => markPaid(d, doc.id)) &&
                notify(t(credit ? "editor.markedRefunded" : "editor.markedPaid"), "success")
              }
            >
              {credit ? t("editor.markRefunded") : t("editor.markPaid")}
            </button>
          )}
          {isInvoice && doc.status === "paid" && (
            <button className="btn" onClick={() => run((d) => markUnpaid(d, doc.id))}>
              {credit ? t("editor.markNotRefunded") : t("editor.markUnpaid")}
            </button>
          )}
          {isInvoice && !credit && locked && creditableAmount(doc, data.documents) > 0 && (
            <button className="btn" onClick={onCredit}>
              {t("editor.createCredit")}
            </button>
          )}
          {!isInvoice && doc.status === "sent" && (
            <>
              <button
                className="btn"
                onClick={() => createAndOpen((d) => convertQuote(d, doc.id), t("editor.convertedToInvoice"))}
              >
                {t("editor.acceptQuote")}
              </button>
              <button className="btn" onClick={() => run((d) => setQuoteOutcome(d, doc.id, "declined"))}>
                {t("editor.declineQuote")}
              </button>
            </>
          )}
          {!isInvoice && (doc.status === "accepted" || doc.status === "declined") && (
            <button className="btn" onClick={() => run((d) => setQuoteOutcome(d, doc.id, "sent"))}>
              {t("editor.reopenQuote")}
            </button>
          )}
          {!credit && (
            <button
              className="btn btn--ghost"
              onClick={() => createAndOpen((d) => duplicate(d, doc.id), t("editor.duplicated"))}
            >
              {t("editor.duplicate")}
            </button>
          )}
          {!locked && (
            <button
              className="btn btn--ghost btn--danger-text"
              style={{ marginLeft: "auto" }}
              onClick={onDelete}
            >
              {t("editor.deleteDraft")}
            </button>
          )}
        </div>
        {locked && doc.issuedAt && (
          <p className="muted small">
            {t("editor.issuedOn", { date: formatDate(doc.issuedAt.slice(0, 10), uiLocale) })}
            {doc.settledAt && doc.status !== "sent"
              ? ` · ${t(`editor.settledOn.${doc.status}`, { date: formatDate(doc.settledAt.slice(0, 10), uiLocale) })}`
              : ""}
            {docLocale !== uiLocale
              ? ` · ${t("editor.printedIn", { language: doc.language === "nl" ? "Nederlands" : "English" })}`
              : ""}
          </p>
        )}
      </div>
    </Page>
  );
};

const LineRow = ({
  line,
  index,
  locked,
  currency,
  locale,
  rates,
  zeroRated,
  canRemove,
  t,
  money,
  onChange,
  onRemove,
}: {
  line: LineItem;
  index: number;
  locked: boolean;
  currency: string;
  locale: string;
  rates: number[];
  zeroRated: boolean;
  canRemove: boolean;
  t: Translator;
  money: (c: number) => string;
  onChange: (p: Partial<LineItem>) => void;
  onRemove: () => void;
}) => {
  const n = index + 1;
  const formatQty = useCallback((q: number) => formatQuantity(q, locale).replace(/\s/g, ""), [locale]);
  const formatPrice = useCallback((c: number) => centsToInput(c, currency), [currency]);
  const parsePrice = useCallback((s: string) => parseAmount(s, currency), [currency]);

  return (
    <div
      className="lines__row"
      role="group"
      aria-label={t("line.lineN", { n })}
      style={{ gridTemplateColumns: LINE_COLUMNS }}
    >
      <input
        className="input"
        aria-label={t("line.descriptionN", { n })}
        value={line.description}
        disabled={locked}
        maxLength={500}
        placeholder={t("line.descriptionPlaceholder")}
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <DecimalInput
        className="input input--mono right"
        aria-label={t("line.qtyN", { n })}
        value={line.quantity}
        disabled={locked}
        parse={parseQuantity}
        format={formatQty}
        onValue={(quantity) => onChange({ quantity })}
      />
      <input
        className="input"
        aria-label={t("line.unitN", { n })}
        value={line.unit}
        disabled={locked}
        maxLength={20}
        placeholder={t("line.unitPlaceholder")}
        onChange={(e) => onChange({ unit: e.target.value })}
      />
      <DecimalInput
        className="input input--mono right"
        aria-label={t("line.priceN", { n })}
        value={line.unitPriceCents}
        disabled={locked}
        parse={parsePrice}
        format={formatPrice}
        onValue={(unitPriceCents) => onChange({ unitPriceCents })}
      />
      <select
        className="select"
        aria-label={t("line.vatN", { n })}
        value={zeroRated ? 0 : line.vatRate}
        disabled={locked || zeroRated}
        onChange={(e) => onChange({ vatRate: Number(e.target.value) })}
      >
        {(zeroRated ? [0] : rates).map((r) => (
          <option key={r} value={r}>
            {formatRate(r, locale)}
          </option>
        ))}
      </select>
      <span className="num right small">{money(lineNetCents(line))}</span>
      {canRemove ? (
        <button className="btn btn--ghost btn--icon" aria-label={t("line.removeN", { n })} onClick={onRemove}>
          ×
        </button>
      ) : (
        <span />
      )}
    </div>
  );
};

const Checklist = ({ issues, t }: { issues: CheckIssue[]; t: Translator }) => {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return (
    <Section title={t("check.title")}>
      {issues.length === 0 ? (
        <p className="check check--ok">✓ {t("check.allGood")}</p>
      ) : (
        <ul className="checklist" aria-live="polite">
          {errors.map((i) => (
            <li key={i.code} className="check check--error">
              <span aria-hidden>✕</span>
              <span>
                <span className="sr-only">{t("check.required")}: </span>
                {t(`check.${i.code}`)}
              </span>
            </li>
          ))}
          {warnings.map((i) => (
            <li key={i.code} className="check check--warning">
              <span aria-hidden>!</span>
              <span>
                <span className="sr-only">{t("check.advice")}: </span>
                {t(`check.${i.code}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};
