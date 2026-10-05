import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the production build (`vite preview`),
 * served with the desktop app's Content-Security-Policy.
 *
 * Chromium stands in for WebView2 (Windows) and WebKit for the macOS
 * and Linux webviews. Set PW_CHROMIUM_PATH to use a preinstalled
 * Chromium instead of Playwright's download.
 */
const chromiumPath = process.env.PW_CHROMIUM_PATH;

// Chromium names a download "download" when the system locale can't
// represent its file name (e.g. "Łódź" in a bare container with no
// LANG). Desktops always have a UTF-8 locale; make test runs match.
process.env.LANG ||= "C.UTF-8";
const browsers = (process.env.PW_BROWSERS ?? "chromium,webkit").split(",");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1280, height: 860 },
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npx vite preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 860 },
        launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 860 } } },
  ].filter((p) => browsers.includes(p.name)),
});
