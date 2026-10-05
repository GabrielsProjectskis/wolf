/**
 * Drives the real, compiled desktop app (WebKitGTK webview, production
 * CSP, real Tauri permissions) through WebDriver via tauri-driver.
 *
 * Linux only, because that's where tauri-driver can drive a webview.
 * WebKitGTK is the same engine family as macOS's WKWebView.
 *
 *   npm run build && npx tauri build --debug --no-bundle
 *   xvfb-run node tests/desktop/smoke.mjs
 *
 * Needs: tauri-driver (cargo install tauri-driver), WebKitWebDriver,
 * Xvfb, and python3 with python-xlib (to click "close" like a user).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const app = resolve(process.argv[2] ?? "src-tauri/target/debug/wolf");
const home = mkdtempSync(join(tmpdir(), "wolf-home-"));
const docs = join(home, "Documents");
mkdirSync(join(home, ".config"), { recursive: true });
mkdirSync(docs);
// Tell the platform where "Documents" is, as a desktop session would.
writeFileSync(join(home, ".config", "user-dirs.dirs"), `XDG_DOCUMENTS_DIR="${docs}"\n`);

const driver = spawn("tauri-driver", [], {
  env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") },
  stdio: ["ignore", "ignore", "inherit"],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
};

const W = "http://127.0.0.1:4444";
const call = async (method, path, body) => {
  const res = await fetch(W + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.value;
};

try {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${W}/status`);
      break;
    } catch {
      await sleep(200);
    }
  }
  const { sessionId } = await call("POST", "/session", {
    capabilities: { alwaysMatch: { "tauri:options": { application: app } } },
  });
  const S = `/session/${sessionId}`;
  const find = async (xpath, timeout = 8000) => {
    const end = Date.now() + timeout;
    for (;;) {
      try {
        return Object.values(await call("POST", `${S}/element`, { using: "xpath", value: xpath }))[0];
      } catch (e) {
        if (Date.now() > end) throw e;
        await sleep(150);
      }
    }
  };
  const click = async (xpath) => call("POST", `${S}/element/${await find(xpath)}/click`, {});
  const type = async (xpath, text) => {
    const el = await find(xpath);
    await call("POST", `${S}/element/${el}/click`, {});
    await call("POST", `${S}/element/${el}/value`, { text });
  };
  const byLabel = (label) =>
    `//input[@id=//label[normalize-space()='${label}']/@for] | //select[@id=//label[normalize-space()='${label}']/@for]`;
  const button = (name) => `//button[normalize-space()='${name}']`;
  const exec = (script, args = []) => call("POST", `${S}/execute/sync`, { script, args });
  const execAsync = (script, args = []) => call("POST", `${S}/execute/async`, { script, args });

  // 1. Setup. Data must land in Documents/Wolf/data.json.
  await find("//h1[normalize-space()='Set up Wolf']", 20000);
  check("app starts on Setup with an empty Documents folder", true);
  await type(byLabel("Business name *"), "Stellera");
  await type(byLabel("Street and number *"), "Coolsingel 1");
  await type(byLabel("City *"), "Rotterdam");
  await type(byLabel("VAT number"), "123456789B01");
  await type(byLabel("Registration number"), "12345678");
  await type(byLabel("IBAN"), "NL91ABNA0417164300");
  await click(button("Finish setup"));
  await find("//h1[normalize-space()='Invoices']");
  await sleep(1200);
  const dataFile = join(docs, "Wolf", "data.json");
  check("data.json written to Documents/Wolf", existsSync(dataFile));
  check(
    "business saved",
    existsSync(dataFile) && JSON.parse(readFileSync(dataFile, "utf8")).business.name === "Stellera",
  );
  check(
    "daily backup written",
    existsSync(join(docs, "Wolf", "backups")) &&
      readdirSync(join(docs, "Wolf", "backups")).some((f) => f.startsWith("daily-")),
  );

  // 2. Invoice with an inline client, Dutch decimal quantity.
  await click(button("New invoice"));
  await click(button("+ New client"));
  const form = "//form[@aria-label='+ New client']";
  await type(`(${form}//input)[1]`, "Wydawnictwo Łódź Sp. z o.o.");
  await type(`(${form}//input)[2]`, "ul. Piotrkowska 5");
  await type(`(${form}//input)[5]`, "Łódź");
  await exec(
    "const s=document.querySelector(\"form[aria-label='+ New client'] select\"); s.value='PL'; s.dispatchEvent(new Event('change',{bubbles:true}));",
  );
  await type(`(${form}//input)[6]`, "PL1234567890");
  await click(`${form}//button[normalize-space()='Save client']`);
  await type("//input[@aria-label='Description, line 1']", "Interface design");
  await type("//input[@aria-label='Quantity, line 1']", "7,5");
  await type("//input[@aria-label='Unit price, line 1']", "85");
  const total = await exec("return document.querySelector('[data-testid=grand-total]').textContent");
  check("typing 7,5 x 85 under reverse charge totals €637.50", total === "€637.50", total);

  // 3. Issue through the confirmation dialog.
  await click(button("Issue invoice"));
  await click("//div[@role='alertdialog']//button[normalize-space()='Issue invoice']");
  const heading = await exec("return document.querySelector('h1').textContent");
  check("issued with the first number of the year", /F\d{4}-001/.test(heading), heading);

  // 4. Save PDF: WebAssembly under the real CSP, written through the fs scope.
  await click(button("Save PDF"));
  const pdfDir = join(docs, "Wolf", "pdf");
  let pdfs = [];
  for (let i = 0; i < 60 && pdfs.length === 0; i++) {
    await sleep(250);
    pdfs = existsSync(pdfDir) ? readdirSync(pdfDir) : [];
  }
  const toast = await exec(
    "return [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')",
  );
  check("PDF written to Documents/Wolf/pdf", pdfs.length === 1, `${JSON.stringify(pdfs)} ${toast}`);
  if (pdfs[0]) {
    check("PDF file name keeps Polish letters", pdfs[0].includes("Łódź"), pdfs[0]);
    check("PDF is a real PDF", readFileSync(join(pdfDir, pdfs[0])).subarray(0, 5).toString() === "%PDF-");
  }

  // 5. The file system scope: anything outside Documents/Wolf is refused.
  const escape = await execAsync(
    "const done = arguments[arguments.length - 1];" +
      "window.__TAURI_INTERNALS__.invoke('plugin:fs|read_text_file', { path: '/etc/passwd', options: {} })" +
      ".then(() => done('READ'), (e) => done('DENIED: ' + String(e).slice(0, 80)));",
  );
  check("reading outside Documents/Wolf is denied", String(escape).startsWith("DENIED"), escape);
  const shell = await execAsync(
    "const done = arguments[arguments.length - 1];" +
      "window.__TAURI_INTERNALS__.invoke('plugin:opener|open_url', { url: 'https://example.com' })" +
      ".then(() => done('OPENED'), (e) => done('DENIED: ' + String(e).slice(0, 80)));",
  );
  check("opening URLs is denied", String(shell).startsWith("DENIED"), shell);

  // 6. Edit, then close the window immediately (inside the save debounce).
  //    The close handler must flush the save and then be allowed to close.
  await click("//nav//button[contains(normalize-space(), 'Settings')]");
  await type(byLabel("Phone"), "+31 10 123 4567");
  // What a window manager sends when the user clicks the close button.
  spawn("python3", [new URL("./close-window.py", import.meta.url).pathname, "Wolf"], { stdio: "inherit" });
  let closed = false;
  for (let i = 0; i < 40 && !closed; i++) {
    await sleep(250);
    try {
      await call("GET", `${S}/title`);
    } catch {
      closed = true;
    }
  }
  check("window closes (core:window:allow-destroy granted)", closed);
  const saved = JSON.parse(readFileSync(dataFile, "utf8"));
  check(
    "the last edit is on disk after closing",
    saved.business.phone === "+31 10 123 4567",
    saved.business.phone,
  );
  await call("DELETE", S).catch(() => {});
} catch (e) {
  failures++;
  console.log("FAIL ", e.message);
} finally {
  driver.kill();
}
console.log(failures ? `\n${failures} failed` : "\nall desktop checks passed");
process.exit(failures ? 1 : 0);
