import { useRef, useState } from "react";
import { useConfirm } from "../components/ui/Dialog";
import { Page } from "../components/ui/Page";
import { useT } from "../i18n";
import { parseDataFile } from "../lib/validate";
import { useStore } from "../store/store";

/**
 * Shown when data exists but can't be read. Saving is disabled while
 * this screen is up, so nothing can overwrite the damaged file; the
 * person decides what happens next.
 */
export const Recovery = () => {
  const { loadProblem, storage, startFresh, replaceAll } = useStore();
  const t = useT();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const restore = async (file: File) => {
    const result = parseDataFile(await file.text());
    if (!result.ok) return setErrors(result.errors);
    await replaceAll({ ...result.data, initialised: true });
  };

  const fresh = async () => {
    const ok = await confirm({
      title: t("recovery.freshTitle"),
      body: t("recovery.freshBody"),
      confirmLabel: t("recovery.fresh"),
      cancelLabel: t("action.cancel"),
      danger: true,
    });
    if (ok) await startFresh();
  };

  return (
    <Page maxWidth={640}>
      <div className="stack-4" role="alert">
        <span className="label error-text">{t("recovery.eyebrow")}</span>
        <h1 className="setup-title">{t("recovery.title")}</h1>
        <p>{loadProblem?.message}</p>
        <p className="muted">{t("recovery.safe", { where: storage.locationLabel })}</p>
      </div>
      <div className="row-2" style={{ marginTop: "var(--space-5)" }}>
        <button className="btn btn--primary btn--lg" onClick={() => fileInput.current?.click()}>
          {t("recovery.restore")}
        </button>
        <button className="btn btn--lg" onClick={() => void fresh()}>
          {t("recovery.fresh")}
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
            if (file) void restore(file);
            e.target.value = "";
          }}
        />
      </div>
      {storage.isFileBacked && (
        <p className="faint small" style={{ marginTop: "var(--space-4)" }}>
          {t("recovery.backupsHint")}
        </p>
      )}
      {errors.length > 0 && (
        <div className="panel callout callout--error" role="alert" style={{ marginTop: "var(--space-4)" }}>
          <strong>{t("settings.importRejected")}</strong>
          <ul>
            {errors.slice(0, 8).map((e) => (
              <li key={e} className="num small">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}
      {loadProblem && loadProblem.details.length > 0 && (
        <details style={{ marginTop: "var(--space-5)" }}>
          <summary className="muted small">{t("recovery.details")}</summary>
          <ul>
            {loadProblem.details.slice(0, 12).map((d) => (
              <li key={d} className="num small" data-selectable>
                {d}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Page>
  );
};
