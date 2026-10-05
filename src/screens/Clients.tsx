import { useMemo, useState } from "react";
import { ClientFields, emptyClientDraft, type ClientDraft } from "../components/ClientFields";
import { useConfirm } from "../components/ui/Dialog";
import { Page } from "../components/ui/Page";
import { useToast } from "../components/ui/Toast";
import { countryName } from "../data/eu";
import { localeFor, useT } from "../i18n";
import { ActionError, clientUsage, deleteClient, upsertClient } from "../lib/actions";
import { useStore } from "../store/store";
import type { Client } from "../types";

export const Clients = () => {
  const { data, apply } = useStore();
  const t = useT();
  const confirm = useConfirm();
  const notify = useToast();
  const locale = localeFor(data.preferences.language);
  const [draft, setDraft] = useState<ClientDraft | null>(null);
  const [query, setQuery] = useState("");

  const clients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...data.clients]
      .filter((c) => !q || [c.name, c.address.city, c.vatNumber, c.email].join(" ").toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.clients, query]);

  const save = () => {
    if (!draft || !draft.name.trim()) return;
    const editing = Boolean(draft.id);
    apply((d) => upsertClient(d, draft).data);
    setDraft(null);
    notify(editing ? t("clients.updated") : t("clients.added"), "success");
  };

  const edit = (c: Client) => {
    const { createdAt: _createdAt, ...rest } = c;
    setDraft({ ...rest, address: { ...rest.address } });
  };

  const remove = async (c: Client) => {
    const ok = await confirm({
      title: t("clients.deleteTitle", { name: c.name }),
      body: t("clients.deleteBody"),
      confirmLabel: t("action.delete"),
      cancelLabel: t("action.cancel"),
      danger: true,
    });
    if (!ok) return;
    try {
      apply((d) => deleteClient(d, c.id));
    } catch (e) {
      notify(e instanceof ActionError ? t(`error.${e.code}`) : String(e), "error");
    }
  };

  return (
    <Page padding="var(--space-5) var(--space-6) var(--space-8)">
      <header className="page-head">
        <h1 className="page-head__title">{t("nav.clients")}</h1>
        {!draft && (
          <button
            className="btn btn--primary"
            onClick={() => setDraft(emptyClientDraft(data.business.address.country))}
          >
            {t("clients.new")}
          </button>
        )}
      </header>

      {draft && (
        <form
          className="panel subform"
          aria-label={draft.id ? t("clients.editTitle") : t("clients.new")}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          style={{ marginBottom: "var(--space-5)" }}
        >
          <h2 className="subform__title">{draft.id ? t("clients.editTitle") : t("clients.new")}</h2>
          {draft.id && <p className="muted small">{t("clients.editNote")}</p>}
          <ClientFields value={draft} onChange={(p) => setDraft({ ...draft, ...p })} />
          <div className="row-2">
            <button type="submit" className="btn btn--primary" disabled={!draft.name.trim()}>
              {t("clients.save")}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setDraft(null)}>
              {t("action.cancel")}
            </button>
          </div>
        </form>
      )}

      {data.clients.length > 0 && (
        <div className="toolbar">
          <input
            className="input toolbar__search"
            type="search"
            aria-label={t("clients.search")}
            placeholder={t("clients.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {data.clients.length === 0 && !draft ? (
        <div className="panel empty">
          <p className="empty__title">{t("clients.empty")}</p>
          <p className="empty__body">{t("clients.emptyBody")}</p>
        </div>
      ) : clients.length === 0 && query ? (
        <div className="panel empty">
          <p className="empty__title">{t("list.noMatches")}</p>
        </div>
      ) : (
        <ul className="client-list">
          {clients.map((c) => {
            const used = clientUsage(data, c.id);
            return (
              <li key={c.id} className="panel client-row">
                <div className="client-row__main">
                  <div className="client-row__name">{c.name}</div>
                  <div className="muted small">
                    {[c.address.city, countryName(c.address.country, locale)].filter(Boolean).join(", ")}
                    {c.vatNumber ? ` · ${c.vatNumber}` : ""}
                  </div>
                </div>
                <span className="label">
                  {used === 1 ? t("clients.docCountOne") : t("clients.docCount", { n: used })}
                </span>
                <button
                  className="btn btn--ghost"
                  onClick={() => edit(c)}
                  aria-label={t("clients.editNamed", { name: c.name })}
                >
                  {t("action.edit")}
                </button>
                <button
                  className="btn btn--ghost btn--danger-text"
                  disabled={used > 0}
                  title={used > 0 ? t("clients.inUse") : undefined}
                  aria-label={t("clients.deleteNamed", { name: c.name })}
                  onClick={() => void remove(c)}
                >
                  {t("action.delete")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
};
