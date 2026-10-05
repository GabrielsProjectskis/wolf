import { useState } from "react";
import { Shell, type Route } from "./components/Shell";
import { ConfirmProvider } from "./components/ui/Dialog";
import { ToastProvider } from "./components/ui/Toast";
import { useT } from "./i18n";
import { Clients } from "./screens/Clients";
import { DocumentEditor } from "./screens/DocumentEditor";
import { DocumentList } from "./screens/DocumentList";
import { Recovery } from "./screens/Recovery";
import { Settings } from "./screens/Settings";
import { Setup } from "./screens/Setup";
import { useStore } from "./store/store";

export const App = () => {
  const t = useT();
  return (
    <ToastProvider dismissLabel={t("action.dismiss")}>
      <ConfirmProvider>
        <div className="app">
          <Banners />
          <div className="app__body">
            <Screens />
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
};

/**
 * Errors and notices sit above every screen, including Setup and the
 * recovery screen, which render outside the sidebar shell. (A save error
 * during setup used to be invisible for exactly that reason.)
 */
const Banners = () => {
  const { saveError, dismissSaveError, notice, dismissNotice } = useStore();
  const t = useT();
  return (
    <>
      {saveError && (
        <div className="banner banner--error" role="alert">
          <span>{saveError}</span>
          <button className="btn btn--ghost" onClick={dismissSaveError}>
            {t("action.dismiss")}
          </button>
        </div>
      )}
      {notice && (
        <div className="banner banner--notice" role="status">
          <span data-selectable>{notice}</span>
          <button className="btn btn--ghost" onClick={dismissNotice}>
            {t("action.dismiss")}
          </button>
        </div>
      )}
    </>
  );
};

const Screens = () => {
  const { data, phase } = useStore();
  const t = useT();
  const [route, setRoute] = useState<Route>("invoices");
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  if (phase === "loading") {
    return (
      <div className="center-fill">
        <span className="label">{t("app.loading")}</span>
      </div>
    );
  }
  if (phase === "unreadable") return <Recovery />;
  if (!data.initialised) return <Setup />;

  const navigate = (next: Route) => {
    setOpenDocId(null);
    setRoute(next);
  };

  const openDoc = (id: string) => setOpenDocId(id);

  // While a document is open, the sidebar highlights its kind, so an
  // invoice created from a quote shows "Invoices" as the current page.
  const openKind = openDocId ? data.documents.find((d) => d.id === openDocId)?.kind : undefined;
  const activeRoute: Route = openKind ? (openKind === "invoice" ? "invoices" : "quotes") : route;

  return (
    <Shell route={activeRoute} onNavigate={navigate}>
      {openDocId ? (
        <DocumentEditor
          key={openDocId}
          documentId={openDocId}
          onClose={() => {
            if (openKind) setRoute(activeRoute);
            setOpenDocId(null);
          }}
          onOpen={openDoc}
        />
      ) : (
        <>
          {route === "invoices" && <DocumentList kind="invoice" onOpen={openDoc} />}
          {route === "quotes" && <DocumentList kind="quote" onOpen={openDoc} />}
          {route === "clients" && <Clients />}
          {route === "settings" && <Settings />}
        </>
      )}
    </Shell>
  );
};
