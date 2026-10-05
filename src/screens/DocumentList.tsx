import { useMemo, useState } from "react";
import { Page } from "../components/ui/Page";
import { StatusPill } from "../components/ui/StatusPill";
import { vatRatesFor } from "../data/eu";
import { localeFor, useT } from "../i18n";
import { addDocument } from "../lib/actions";
import { formatDate } from "../lib/dates";
import { displayStatus, grossOf, isCreditNote, newDraft, type DisplayStatus } from "../lib/document";
import { formatMoney } from "../lib/money";
import { summarise } from "../lib/summary";
import { useStore } from "../store/store";
import type { DocKind, WolfDocument } from "../types";

type Filter = "all" | "draft" | "open" | "overdue" | "settled";

const FILTERS: Record<DocKind, Filter[]> = {
  invoice: ["all", "draft", "open", "overdue", "settled"],
  quote: ["all", "draft", "open", "settled"],
};

const matchesFilter = (filter: Filter, status: DisplayStatus): boolean => {
  switch (filter) {
    case "all":
      return true;
    case "draft":
      return status === "draft";
    case "open":
      return status === "sent" || status === "overdue" || status === "issued";
    case "overdue":
      return status === "overdue";
    case "settled":
      return !["draft", "sent", "overdue", "issued"].includes(status);
  }
};

const COLUMNS = "128px minmax(0,1fr) 128px 110px 120px";

export const DocumentList = ({ kind, onOpen }: { kind: DocKind; onOpen: (id: string) => void }) => {
  const { data, apply } = useStore();
  const t = useT();
  const locale = localeFor(data.preferences.language);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.documents
      .filter((d) => d.kind === kind)
      .map((doc) => ({ doc, status: displayStatus(doc, data.documents) }))
      .filter(({ status }) => matchesFilter(filter, status))
      .filter(({ doc }) => !q || searchText(doc, data.clients).includes(q))
      .sort(
        (a, b) =>
          Number(b.doc.status === "draft") - Number(a.doc.status === "draft") ||
          b.doc.issueDate.localeCompare(a.doc.issueDate) ||
          (b.doc.sequence ?? 0) - (a.doc.sequence ?? 0) ||
          b.doc.createdAt.localeCompare(a.doc.createdAt),
      );
  }, [data.documents, data.clients, kind, filter, query]);

  const total = data.documents.filter((d) => d.kind === kind).length;
  const summaries = kind === "invoice" ? summarise(data.documents) : [];

  const create = () => {
    const draft = newDraft(kind, data.business, vatRatesFor(data.business.address.country)[0]);
    apply((d) => addDocument(d, draft));
    onOpen(draft.id);
  };

  const title = kind === "invoice" ? t("nav.invoices") : t("nav.quotes");

  return (
    <Page padding="var(--space-5) var(--space-6) var(--space-8)">
      <header className="page-head">
        <h1 className="page-head__title">{title}</h1>
        <button className="btn btn--primary" onClick={create}>
          {kind === "invoice" ? t("list.newInvoice") : t("list.newQuote")}
        </button>
      </header>

      {kind === "invoice" && total > 0 && (
        <div className="stats" aria-label={t("stats.label")}>
          {(summaries.length
            ? summaries
            : [
                {
                  currency: data.business.currency,
                  outstandingCents: 0,
                  outstandingCount: 0,
                  overdueCents: 0,
                  overdueCount: 0,
                  paidThisYearCents: 0,
                },
              ]
          ).map((s) => (
            <div key={s.currency} className="stats__group">
              <Stat
                label={t("stats.outstanding")}
                value={formatMoney(s.outstandingCents, s.currency, locale)}
                sub={
                  s.outstandingCount === 1
                    ? t("stats.invoice")
                    : t("stats.invoices", { n: s.outstandingCount })
                }
              />
              <Stat
                label={t("stats.overdue")}
                value={formatMoney(s.overdueCents, s.currency, locale)}
                sub={s.overdueCount === 1 ? t("stats.invoice") : t("stats.invoices", { n: s.overdueCount })}
                tone={s.overdueCount > 0 ? "danger" : undefined}
              />
              <Stat
                label={t("stats.paidThisYear")}
                value={formatMoney(s.paidThisYearCents, s.currency, locale)}
              />
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="toolbar">
          <input
            className="input toolbar__search"
            type="search"
            aria-label={t("list.search")}
            placeholder={t("list.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="segmented" role="group" aria-label={t("list.filter")}>
            {FILTERS[kind].map((f) => (
              <button
                key={f}
                className="segmented__item"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {t(`filter.${f}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {total === 0 ? (
        <div className="panel empty">
          <p className="empty__title">
            {kind === "invoice" ? t("list.emptyInvoices") : t("list.emptyQuotes")}
          </p>
          <p className="empty__body">
            {kind === "invoice" ? t("list.emptyInvoicesBody") : t("list.emptyQuotesBody")}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="panel empty">
          <p className="empty__title">{t("list.noMatches")}</p>
          <button
            className="btn"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
            style={{ marginTop: "var(--space-3)" }}
          >
            {t("list.clearFilters")}
          </button>
        </div>
      ) : (
        <div className="panel doc-table">
          <div
            className="doc-table__row doc-table__head"
            style={{ gridTemplateColumns: COLUMNS }}
            aria-hidden
          >
            <span className="label">{t("list.number")}</span>
            <span className="label">{t("list.client")}</span>
            <span className="label">{t("list.date")}</span>
            <span className="label">{t("list.status")}</span>
            <span className="label right">{t("list.total")}</span>
          </div>
          <ul className="doc-table__body" aria-label={title}>
            {rows.map(({ doc, status }) => {
              const name =
                doc.client?.name ??
                data.clients.find((c) => c.id === doc.clientId)?.name ??
                t("list.noClient");
              return (
                <li key={doc.id}>
                  <button
                    className="doc-table__row doc-table__link"
                    style={{ gridTemplateColumns: COLUMNS }}
                    onClick={() => onOpen(doc.id)}
                  >
                    <span className="num small">
                      {doc.number ?? <span className="faint">{t("status.draft")}</span>}
                      {isCreditNote(doc) && <span className="tag">{t("list.creditTag")}</span>}
                    </span>
                    <span className="ellipsis">{name}</span>
                    <span className="num small muted">{formatDate(doc.issueDate, locale)}</span>
                    <StatusPill status={status} />
                    <span className="num right">{formatMoney(grossOf(doc), doc.currency, locale)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Page>
  );
};

const Stat = ({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger";
}) => (
  <div className="stat panel" data-tone={tone}>
    <span className="label">{label}</span>
    <span className="stat__value num">{value}</span>
    {sub && <span className="stat__sub">{sub}</span>}
  </div>
);

const searchText = (doc: WolfDocument, clients: { id: string; name: string }[]): string =>
  [
    doc.number ?? "",
    doc.client?.name ?? clients.find((c) => c.id === doc.clientId)?.name ?? "",
    doc.client?.reference ?? "",
    doc.notes,
    ...doc.lines.map((l) => l.description),
  ]
    .join(" ")
    .toLowerCase();
