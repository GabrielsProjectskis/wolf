// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SAVE_DEBOUNCE_MS } from "../../src/store/store";
import { baseData, issuedInvoice } from "../fixtures";
import { MemoryStorage, renderApp, unreadable } from "./helpers";

const ready = (data = baseData().data) => new MemoryStorage({ status: "ok", data, warnings: [] });

const waitForSave = () => new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_MS + 50));

describe("setup", () => {
  it("names every required field that is missing, and finishes once they are filled", async () => {
    const { user, storage } = renderApp();
    await screen.findByRole("heading", { name: "Set up Wolf" });

    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Still needed: Business name, Street and number, City",
    );
    expect(screen.getAllByText("Required")).toHaveLength(3);

    // Labels are real <label>s tied to their inputs.
    await user.type(screen.getByLabelText("Business name *"), "Stellera");
    await user.type(screen.getByLabelText("Street and number *"), "Coolsingel 1");
    await user.type(screen.getByLabelText("City *"), "Rotterdam");
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(await screen.findByRole("heading", { name: "Invoices" })).toBeInTheDocument();
    await waitForSave();
    expect((storage as MemoryStorage).last).toMatchObject({
      initialised: true,
      business: { name: "Stellera" },
    });
  });

  it("switches the whole setup screen to Dutch", async () => {
    const { user } = renderApp();
    await user.click(await screen.findByRole("button", { name: "Nederlands" }));
    expect(screen.getByRole("heading", { name: "Wolf instellen" })).toBeInTheDocument();
    expect(screen.getByLabelText("Bedrijfsnaam *")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("nl");
  });

  it("warns about an IBAN with a typo", async () => {
    const { user } = renderApp();
    await user.type(await screen.findByLabelText("IBAN"), "NL91ABNA0417164301");
    expect(screen.getByText(/fails its checksum/)).toBeInTheDocument();
  });
});

describe("every top-level screen owns its scroll region", () => {
  // body has overflow:hidden; a screen without its own scroll region has
  // an unreachable bottom half (the original Setup bug).
  const scrolls = (el: Element | null) => el instanceof HTMLElement && el.style.overflowY === "auto";

  it.each([
    ["setup", () => new MemoryStorage()],
    ["recovery", () => new MemoryStorage(unreadable())],
    ["invoices", () => ready()],
  ])("%s", async (_name, make) => {
    const { container } = renderApp(make());
    await waitFor(() => expect(container.querySelector(".app__body")?.textContent).not.toBe("Loading"));
    const body = container.querySelector(".app__body")!;
    const page = body.querySelector("main") ? body.querySelector("main > *") : body.firstElementChild;
    expect(scrolls(page)).toBe(true);
  });
});

describe("writing an invoice", () => {
  it("creates a client inline, takes a Dutch decimal quantity, and issues after confirmation", async () => {
    const storage = ready();
    const { user } = renderApp(storage);
    await user.click(await screen.findByRole("button", { name: "New invoice" }));

    // Inline new client
    await user.click(screen.getByRole("button", { name: "+ New client" }));
    const form = screen.getByRole("form", { name: "+ New client" });
    await user.type(within(form).getByLabelText("Name"), "Wydawnictwo Łódź");
    await user.type(within(form).getByLabelText("Street and number"), "ul. Piotrkowska 5");
    await user.type(within(form).getByLabelText("City"), "Łódź");
    await user.selectOptions(within(form).getByLabelText("Country"), "PL");
    await user.type(within(form).getByLabelText("VAT number"), "PL1234567890");
    await user.click(within(form).getByRole("button", { name: "Save client" }));

    // Cross-border B2B: reverse charge was picked automatically.
    expect(screen.getByLabelText("VAT treatment")).toHaveValue("reverse_charge");

    await user.type(screen.getByLabelText("Description, line 1"), "Interface design");
    // The original bug: typing "7,5" produced 75.
    await user.type(screen.getByLabelText("Quantity, line 1"), "7,5");
    await user.type(screen.getByLabelText("Unit price, line 1"), "85");
    expect(screen.getByTestId("grand-total")).toHaveTextContent("€637.50");

    expect(screen.getByText(/Everything an EU invoice needs is in place/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Issue invoice" }));

    const dialog = screen.getByRole("alertdialog", { name: "Issue this invoice as F2026-001?" });
    // Cancel first: nothing happens.
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Issue invoice" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Issue invoice" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Issue invoice" }));

    expect(await screen.findByRole("heading", { name: /Invoice F2026-001/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Description, line 1")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Delete draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create credit note" })).toBeInTheDocument();

    await waitForSave();
    const saved = storage.last!;
    expect(saved.documents[0]).toMatchObject({
      number: "F2026-001",
      status: "sent",
      lines: [{ quantity: 7.5 }],
    });
    expect(saved.counters.invoice.next).toBe(2);
  });

  it("blocks issuing and explains why when details are missing", async () => {
    const { user } = renderApp(ready());
    await user.click(await screen.findByRole("button", { name: "New invoice" }));
    expect(screen.getByRole("button", { name: "Issue invoice" })).toBeDisabled();
    expect(screen.getByText("Choose a client.")).toBeInTheDocument();
    expect(screen.getByText("Add at least one line with a description.")).toBeInTheDocument();
  });

  it("asks before deleting a draft", async () => {
    const { user } = renderApp(ready());
    await user.click(await screen.findByRole("button", { name: "New invoice" }));
    await user.click(screen.getByRole("button", { name: "Delete draft" }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Delete draft" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete draft" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No invoices yet")).toBeInTheDocument();
  });

  it("creates and opens a credit note from an issued invoice", async () => {
    const { user } = renderApp(ready(issuedInvoice().data));
    await user.click(await screen.findByRole("button", { name: /F2026-001/ }));
    await user.click(screen.getByRole("button", { name: "Create credit note" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Create credit note" }),
    );
    expect(await screen.findByRole("heading", { name: /Credit note/ })).toBeInTheDocument();
    expect(screen.getByTestId("grand-total")).toHaveTextContent("-€771.38");
    expect(screen.getByRole("button", { name: "Issue credit note" })).toBeEnabled();
  });
});

describe("invoice list", () => {
  it("shows outstanding totals and filters by search", async () => {
    const { data } = issuedInvoice();
    const { user } = renderApp(ready(data));
    expect(await screen.findByText("Outstanding")).toBeInTheDocument();
    expect(screen.getAllByText("€771.38").length).toBeGreaterThan(0);

    await user.type(screen.getByRole("searchbox", { name: "Search documents" }), "nothing like this");
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear search and filter" }));
    expect(screen.getByRole("button", { name: /F2026-001/ })).toBeInTheDocument();
  });
});

describe("clients", () => {
  it("edits a client", async () => {
    const { user } = renderApp(ready());
    await user.click(await screen.findByRole("button", { name: "Clients" }));
    await user.click(screen.getByRole("button", { name: "Edit Bakkerij de Vries" }));
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "De Vries BV");
    await user.click(screen.getByRole("button", { name: "Save client" }));
    expect(screen.getByText("De Vries BV")).toBeInTheDocument();
  });

  it("won't delete a client that appears on an invoice", async () => {
    const { user } = renderApp(ready(issuedInvoice().data));
    await user.click(await screen.findByRole("button", { name: "Clients" }));
    expect(screen.getByRole("button", { name: "Delete Bakkerij de Vries" })).toBeDisabled();
  });
});

describe("damaged data", () => {
  it("shows the recovery screen and never saves over the damaged file", async () => {
    const storage = new MemoryStorage(unreadable());
    const { user } = renderApp(storage);
    expect(await screen.findByRole("heading", { name: "Wolf couldn't open your data" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Set up Wolf" })).not.toBeInTheDocument();
    await waitForSave();
    expect(storage.save).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Start fresh" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Start fresh" }));
    expect(storage.setAsideUnreadable).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("heading", { name: "Set up Wolf" })).toBeInTheDocument();
  });

  it("tells the user when it opened a backup instead", async () => {
    const storage = new MemoryStorage({
      status: "recovered",
      data: baseData().data,
      warnings: [],
      source: "Wolf/data.json.bak",
      setAside: "Documents/Wolf/data.unreadable-1.json",
    });
    renderApp(storage);
    expect(await screen.findByText(/opened the most recent backup/)).toBeInTheDocument();
  });
});

describe("backup import", () => {
  const file = (text: string, name = "backup.json") => new File([text], name, { type: "application/json" });

  it("rejects an invalid file with reasons, changing nothing", async () => {
    const storage = ready();
    const { user, container } = renderApp(storage);
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"][accept*="json"]')!;
    await user.upload(input, file(JSON.stringify({ version: 1, documents: [{ kind: "invoice" }] })));
    expect(await screen.findByText("Not imported.")).toBeInTheDocument();
    expect(storage.snapshot).not.toHaveBeenCalled();
  });

  it("asks before replacing, keeps a snapshot, then replaces", async () => {
    const storage = ready();
    const { user, container } = renderApp(storage);
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"][accept*="json"]')!;
    await user.upload(input, file(JSON.stringify(issuedInvoice().data)));
    const dialog = await screen.findByRole("alertdialog", { name: "Replace all data with this backup?" });
    expect(dialog).toHaveTextContent("1 invoices, 0 quotes and 1 clients");
    await user.click(within(dialog).getByRole("button", { name: "Replace data" }));
    await waitFor(() => expect(storage.snapshot).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(storage.last?.documents).toHaveLength(1));
  });
});

describe("saving", () => {
  it("debounces saves and always writes the newest data", async () => {
    const storage = ready();
    const { user } = renderApp(storage);
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const name = screen.getByLabelText("Business name *");
    await user.clear(name);
    await user.type(name, "New name");
    await waitForSave();
    expect(storage.save.mock.calls.length).toBeLessThan(4);
    expect(storage.last!.business.name).toBe("New name");
  });

  it("flushes a pending save when the window is hidden", async () => {
    const storage = ready();
    const { user } = renderApp(storage);
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.type(screen.getByLabelText("Phone"), "1");
    expect(storage.save).not.toHaveBeenCalled();
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(storage.save).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("shows a save failure as a visible alert", async () => {
    const storage = ready();
    storage.save.mockRejectedValueOnce(new Error("disk full"));
    const { user } = renderApp(storage);
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.type(screen.getByLabelText("Phone"), "1");
    await waitForSave();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save your changes.");
    expect(screen.getByText("Not saved")).toBeInTheDocument();
  });
});
