import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { demoData } from "./demo-data";

/**
 * Regenerates docs/screenshots. Skipped unless SCREENSHOTS=1, since the
 * images are committed and only change when the UI does.
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate");

const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const seed = async (page: Page, theme: "dark" | "light", language: "en" | "nl" = "en") => {
  await page.clock.setFixedTime(new Date("2026-10-05T10:00:00"));
  await page.goto("/");
  const data = demoData();
  data.preferences = { theme, language };
  await page.evaluate(
    (json) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("keyval-store");
        open.onupgradeneeded = () => open.result.createObjectStore("keyval");
        open.onsuccess = () => {
          const tx = open.result.transaction("keyval", "readwrite");
          tx.objectStore("keyval").put(JSON.parse(json), "wolf:data");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    JSON.stringify(data),
  );
  await page.reload();
};

test("invoice list", async ({ page }) => {
  await seed(page, "dark");
  await expect(page.getByText("Outstanding")).toBeVisible();
  await page.screenshot({ path: `${OUT}/invoices-dark.png` });
});

test("editor with checklist", async ({ page }) => {
  await seed(page, "dark");
  await page.getByRole("button", { name: /Draft.*Bakkerij de Vries/ }).click();
  await expect(page.getByText(/Everything an EU invoice needs/)).toBeVisible();
  await page.screenshot({ path: `${OUT}/editor-dark.png` });
});

test("issued reverse-charge invoice, light", async ({ page }) => {
  await seed(page, "light");
  await page
    .getByRole("button", { name: /Kranich Mobility/ })
    .first()
    .click();
  await expect(page.getByText("Issued documents are read-only", { exact: false })).toBeVisible();
  await page.screenshot({ path: `${OUT}/issued-light.png` });
});

test("dutch quotes", async ({ page }) => {
  await seed(page, "light", "nl");
  await page.getByRole("button", { name: "Offertes" }).click();
  await expect(page.getByRole("heading", { name: "Offertes" })).toBeVisible();
  await page.screenshot({ path: `${OUT}/quotes-nl-light.png` });
});
