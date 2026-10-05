import { useRef, useState } from "react";
import { BusinessForm } from "../components/BusinessForm";
import { useConfirm } from "../components/ui/Dialog";
import { Field, FieldGrid, Section } from "../components/ui/Field";
import { Page } from "../components/ui/Page";
import { useToast } from "../components/ui/Toast";
import { useT } from "../i18n";
import { ActionError, counterEditable, setCounter, updateBusiness, updatePreferences } from "../lib/actions";
import { previewNumber } from "../lib/numbering";
import { MAX_BACKUP_BYTES, parseDataFile } from "../lib/validate";
import { useStore } from "../store/store";
import type { DocKind, Theme, UILanguage } from "../types";

export const Settings = () => {
  const { data, apply, storage, replaceAll } = useStore();
  const t = useT();
  const confirm = useConfirm();
  const notify = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const exportBackup = async () => {
    try {
      const where = await storage.exportBackup(data);
      notify(t("settings.exported", { where }), "success");
    } catch (e) {
      notify(t("settings.exportFailed", { reason: String(e) }), "error");
    }
  };

  const importBackup = async (file: File) => {
    setImportErrors([]);
    if (file.size > MAX_BACKUP_BYTES) {
      setImportErrors([t("settings.importTooLarge")]);
      return;
    }
    const result = parseDataFile(await file.text());
    if (!result.ok) {
      setImportErrors(result.errors);
      return;
    }
    const incoming = result.data;
    const count = (kind: DocKind) => incoming.documents.filter((d) => d.kind === kind).length;
    const ok = await confirm({
      title: t("settings.importConfirmTitle"),
      body: (
        <>
          <p>
            {t("settings.importConfirmBody", {
              file: file.name,
              invoices: count("invoice"),
              quotes: count("quote"),
              clients: incoming.clients.length,
            })}
          </p>
          <p style={{ marginTop: 8 }}>
            {t("settings.importConfirmCurrent", {
              invoices: data.documents.filter((d) => d.kind === "invoice").length,
              quotes: data.documents.filter((d) => d.kind === "quote").length,
              clients: data.clients.length,
            })}
          </p>
        </>
      ),
      confirmLabel: t("settings.importConfirm"),
      cancelLabel: t("action.cancel"),
      danger: true,
    });
    if (!ok) return;
    try {
      await replaceAll({ ...incoming, initialised: true });
      notify(t("settings.imported"), "success");
      if (result.warnings.length) notify(result.warnings.join(" "), "info");
    } catch (e) {
      notify(t("settings.importFailed", { reason: String(e) }), "error");
    }
  };

  return (
    <Page maxWidth={720} padding="var(--space-6)">
      <h1 className="page-head__title" style={{ fontSize: "var(--text-xl)", marginBottom: "var(--space-6)" }}>
        {t("nav.settings")}
      </h1>

      <div className="stack-6">
        <BusinessForm value={data.business} onChange={(p) => apply((d) => updateBusiness(d, p))} />

        <Section title={t("settings.appearance")}>
          <FieldGrid>
            <Field label={t("settings.theme")}>
              <select
                className="select"
                value={data.preferences.theme}
                onChange={(e) => apply((d) => updatePreferences(d, { theme: e.target.value as Theme }))}
              >
                <option value="dark">{t("theme.dark")}</option>
                <option value="light">{t("theme.light")}</option>
              </select>
            </Field>
            <Field label={t("settings.language")}>
              <select
                className="select"
                value={data.preferences.language}
                onChange={(e) =>
                  apply((d) => updatePreferences(d, { language: e.target.value as UILanguage }))
                }
              >
                <option value="en">English</option>
                <option value="nl">Nederlands</option>
              </select>
            </Field>
          </FieldGrid>
        </Section>

        <Section title={t("settings.numbering")}>
          <FieldGrid>
            <CounterEditor kind="invoice" />
            <CounterEditor kind="quote" />
          </FieldGrid>
          <p className="faint small">{t("settings.numberingNote")}</p>
        </Section>

        <Section title={t("settings.data")}>
          <Field label={t("settings.storedAt")}>
            <output className="readonly num" data-selectable>
              {storage.locationLabel}
            </output>
          </Field>
          <p className="muted small">
            {storage.isFileBacked ? t("settings.backupsDesktop") : t("warn.browser")}
          </p>
          <div className="row-2">
            <button className="btn" onClick={() => void exportBackup()}>
              {t("settings.export")}
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              {t("settings.import")}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importBackup(file);
                e.target.value = "";
              }}
            />
          </div>
          {importErrors.length > 0 && (
            <div className="panel callout callout--error" role="alert">
              <p>
                <strong>{t("settings.importRejected")}</strong> {t("settings.importRejectedBody")}
              </p>
              <ul>
                {importErrors.slice(0, 8).map((e) => (
                  <li key={e} className="num small">
                    {e}
                  </li>
                ))}
                {importErrors.length > 8 && (
                  <li className="small">{t("settings.moreErrors", { n: importErrors.length - 8 })}</li>
                )}
              </ul>
            </div>
          )}
        </Section>
      </div>
    </Page>
  );
};

const CounterEditor = ({ kind }: { kind: DocKind }) => {
  const { data, apply } = useStore();
  const t = useT();
  const notify = useToast();
  const counter = data.counters[kind];
  const editable = counterEditable(data, kind);
  const [prefix, setPrefix] = useState(counter.prefix);
  const [next, setNext] = useState(String(counter.next));
  const label = kind === "invoice" ? t("settings.nextInvoice") : t("settings.nextQuote");

  if (!editable) {
    return (
      <Field label={label} hint={t("settings.numberingLocked")}>
        <output className="readonly num">{previewNumber(counter)}</output>
      </Field>
    );
  }

  const save = () => {
    try {
      apply((d) => setCounter(d, kind, { prefix: prefix.trim().toUpperCase(), next: Number(next) }));
      notify(t("settings.numberingSaved"), "success");
    } catch (e) {
      notify(e instanceof ActionError ? t(`error.${e.code}`) : String(e), "error");
    }
  };

  const dirty = prefix !== counter.prefix || next !== String(counter.next);
  return (
    <fieldset className="counter">
      <legend className="label">{label}</legend>
      <div className="row-2">
        <label className="sr-only" htmlFor={`${kind}-prefix`}>
          {t("settings.prefix")}
        </label>
        <input
          id={`${kind}-prefix`}
          className="input input--mono"
          style={{ width: 90 }}
          maxLength={8}
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
        />
        <label className="sr-only" htmlFor={`${kind}-next`}>
          {t("settings.startAt")}
        </label>
        <input
          id={`${kind}-next`}
          className="input input--mono"
          style={{ width: 80 }}
          inputMode="numeric"
          value={next}
          onChange={(e) => setNext(e.target.value.replace(/\D/g, "").slice(0, 5))}
        />
        <button className="btn" disabled={!dirty || !next} onClick={save}>
          {t("action.save")}
        </button>
      </div>
      <span className="field__hint">
        {t("settings.preview")}:{" "}
        <span className="num">
          {previewNumber({ ...counter, prefix: prefix.toUpperCase(), next: Number(next) || 1 })}
        </span>
      </span>
    </fieldset>
  );
};
