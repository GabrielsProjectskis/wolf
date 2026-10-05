import { useState } from "react";
import { BusinessForm } from "../components/BusinessForm";
import { Wordmark } from "../components/Shell";
import { Page } from "../components/ui/Page";
import { useT } from "../i18n";
import { completeSetup, updatePreferences } from "../lib/actions";
import { useStore } from "../store/store";
import { emptyBusiness, type Business } from "../types";

/**
 * One screen, not a wizard. Everything a legally valid EU invoice needs
 * is visible at once so the user can see where it ends.
 */
export const Setup = () => {
  const { data, apply } = useStore();
  const t = useT();
  const [form, setForm] = useState<Business>(() => ({ ...emptyBusiness(), ...data.business }));
  const [attempted, setAttempted] = useState(false);

  const patch = (p: Partial<Business>) => setForm((f) => ({ ...f, ...p }));

  const missing: string[] = [];
  if (!form.name.trim()) missing.push(t("field.businessName"));
  if (!form.address.line1.trim()) missing.push(t("field.line1"));
  if (!form.address.city.trim()) missing.push(t("field.city"));
  if (form.vatExempt && !form.vatExemptNote.trim()) missing.push(t("field.vatExemptNote"));

  const finish = () => {
    setAttempted(true);
    if (missing.length === 0) apply((d) => completeSetup(d, form));
  };

  return (
    <Page maxWidth={720}>
      <div className="setup-top">
        <Wordmark />
        <div className="row-2">
          <button
            className="btn btn--ghost"
            lang={data.preferences.language === "en" ? "nl" : "en"}
            onClick={() =>
              apply((d) => updatePreferences(d, { language: d.preferences.language === "en" ? "nl" : "en" }))
            }
          >
            {data.preferences.language === "en" ? "Nederlands" : "English"}
          </button>
          <button
            className="btn btn--ghost"
            onClick={() =>
              apply((d) => updatePreferences(d, { theme: d.preferences.theme === "dark" ? "light" : "dark" }))
            }
          >
            {data.preferences.theme === "dark" ? t("theme.light") : t("theme.dark")}
          </button>
        </div>
      </div>

      <header style={{ marginBottom: "var(--space-6)" }}>
        <span className="label" style={{ color: "var(--accent-text)" }}>
          {t("setup.eyebrow")}
        </span>
        <h1 className="setup-title">{t("setup.title")}</h1>
        <p className="muted" style={{ marginTop: "var(--space-2)", maxWidth: 540 }}>
          {t("setup.subtitle")}
        </p>
        <p className="faint small" style={{ marginTop: "var(--space-2)" }}>
          {t("setup.later")}
        </p>
      </header>

      <form
        className="stack-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          finish();
        }}
      >
        <BusinessForm value={form} onChange={patch} showErrors={attempted} />

        <div className="row-3" style={{ paddingBottom: "var(--space-6)" }}>
          <button type="submit" className="btn btn--primary btn--lg">
            {t("setup.finish")}
          </button>
          {/* A disabled button with no explanation is a dead end. Say what's missing. */}
          {missing.length > 0 && (
            <span
              className={attempted ? "error-text small" : "faint small"}
              role={attempted ? "alert" : undefined}
            >
              {t("setup.missing", { fields: missing.join(", ") })}
            </span>
          )}
        </div>
      </form>
    </Page>
  );
};
