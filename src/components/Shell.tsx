import type { ReactNode } from "react";
import { useT, type StringKey } from "../i18n";
import { useStore, type SaveState } from "../store/store";

export type Route = "invoices" | "quotes" | "clients" | "settings";

const NAV: { route: Route; key: StringKey; glyph: string }[] = [
  { route: "invoices", key: "nav.invoices", glyph: "▤" },
  { route: "quotes", key: "nav.quotes", glyph: "◫" },
  { route: "clients", key: "nav.clients", glyph: "◎" },
  { route: "settings", key: "nav.settings", glyph: "⚙" },
];

export const Shell = ({
  route,
  onNavigate,
  children,
}: {
  route: Route;
  onNavigate: (next: Route) => void;
  children: ReactNode;
}) => {
  const { saveState, running } = useStore();
  const t = useT();

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        {t("nav.skip")}
      </a>
      <nav className="shell__nav" aria-label={t("nav.label")}>
        <Wordmark />
        {NAV.map((item) => {
          const active = route === item.route;
          return (
            <button
              key={item.route}
              className="nav-item"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.route)}
            >
              <span className="nav-item__glyph" aria-hidden>
                {item.glyph}
              </span>
              {t(item.key)}
            </button>
          );
        })}

        <div className="shell__foot">
          <SaveIndicator state={saveState} />
          {running === "browser" && <p className="shell__warn">{t("warn.browser")}</p>}
        </div>
      </nav>

      <main id="main" className="shell__main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
};

export const Wordmark = () => (
  <div className="wordmark" role="img" aria-label="Wolf">
    <span className="wordmark__mark" aria-hidden>
      W
    </span>
    <span className="wordmark__text" aria-hidden>
      Wolf
    </span>
  </div>
);

const SaveIndicator = ({ state }: { state: SaveState }) => {
  const t = useT();
  if (state === "idle") return null;
  const colour =
    state === "error"
      ? "var(--status-overdue)"
      : state === "saving"
        ? "var(--text-faint)"
        : "var(--status-paid)";
  return (
    <div className="save-indicator" role="status">
      <span className="save-indicator__dot" style={{ background: colour }} aria-hidden />
      <span className="label">{t(`save.${state}`)}</span>
    </div>
  );
};
