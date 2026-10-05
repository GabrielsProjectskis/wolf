import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

/**
 * The whole first-run journey in a real browser engine, against the
 * production build, under the production Content-Security-Policy.
 */

const cspViolations = (page: Page) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content.Security.Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  page.on("pageerror", (err) => violations.push(String(err)));
  return violations;
};

const setUp = async (page: Page) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Set up Wolf" })).toBeVisible();
  await page.getByLabel("Business name *").fill("Stellera");
  await page.getByLabel("Street and number *").fill("Coolsingel 1");
  await page.getByLabel("Postcode").fill("3012 AA");
  await page.getByLabel("City *").fill("Rotterdam");
  await page.getByLabel("VAT number").fill("NL123456789B01");
  await page.getByLabel("Registration number").fill("12345678");
  await page.getByLabel("IBAN").fill("NL91ABNA0417164300");
  await page.getByLabel("BIC").fill("ABNANL2A");
  // The bottom of Setup must be reachable: the original scroll bug.
  const finish = page.getByRole("button", { name: "Finish setup" });
  await finish.scrollIntoViewIfNeeded();
  await expect(finish).toBeInViewport();
  await finish.click();
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
};

test("set up, invoice a Polish client, issue, and save a PDF", async ({ page }) => {
  const violations = cspViolations(page);
  await setUp(page);

  await page.getByRole("button", { name: "New invoice" }).click();
  await page.getByRole("button", { name: "+ New client" }).click();
  const form = page.getByRole("form", { name: "+ New client" });
  await form.getByLabel("Name").fill("Wydawnictwo Łódź Sp. z o.o.");
  await form.getByLabel("Street and number").fill("ul. Piotrkowska 5");
  await form.getByLabel("City").fill("Łódź");
  await form.getByLabel("Country").selectOption("PL");
  await form.getByLabel("VAT number").fill("PL1234567890");
  await form.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByLabel("VAT treatment")).toHaveValue("reverse_charge");

  await page.getByLabel("Description, line 1").fill("Interface design");
  // Click and type, like a person: the field's "1" and "0.00" are replaced.
  await page.getByLabel("Quantity, line 1").click();
  await page.keyboard.type("7,5");
  await page.getByLabel("Unit price, line 1").click();
  await page.keyboard.type("85");
  await expect(page.getByTestId("grand-total")).toHaveText("€637.50");

  await page.getByRole("button", { name: "Issue invoice" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Issue invoice" }).click();
  await expect(page.getByRole("heading", { name: /Invoice F\d{4}-001/ })).toBeVisible();

  // PDF generation compiles WebAssembly; this fails under a CSP without
  // 'wasm-unsafe-eval', which is what broke Save PDF in the desktop app.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^F\d{4}-001-Wydawnictwo-Łódź-Sp-z-o-o\.pdf$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.getByText(/PDF saved to/)).toBeVisible();

  // Data survives a reload (IndexedDB in the browser build).
  await page.reload();
  await expect(page.getByRole("button", { name: /F\d{4}-001/ })).toBeVisible();
  await expect(page.getByText("Outstanding")).toBeVisible();

  expect(violations).toEqual([]);
});

test("the interface works from the keyboard alone", async ({ page }) => {
  await setUp(page);
  await page.getByRole("button", { name: "New invoice" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Delete draft" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  // Focus starts on Cancel and Escape closes.
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Delete draft" })).toBeFocused();
});
