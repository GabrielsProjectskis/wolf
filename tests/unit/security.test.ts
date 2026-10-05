import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards on the desktop shell's security configuration. These settings
 * are easy to loosen "temporarily" while debugging and forget.
 */
const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const caps = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe("Content-Security-Policy", () => {
  const csp = conf.app.security.csp as Record<string, string>;

  it("allows WebAssembly (the PDF layout engine) without allowing eval", () => {
    expect(csp["script-src"]).toContain("'wasm-unsafe-eval'");
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("loads nothing from the network", () => {
    for (const [directive, value] of Object.entries(csp)) {
      expect(value, directive).not.toMatch(/https?:\/\/(?!ipc\.localhost)/);
      expect(value, directive).not.toContain("*");
    }
    expect(csp["object-src"]).toBe("'none'");
  });

  // freezePrototype stays off: react-pdf's dependencies patch built-in
  // prototypes, and with it on "Save PDF" fails in the desktop app with
  // "Attempted to assign to readonly property" (found by
  // tests/desktop/smoke.mjs). The CSP above blocks the injection that
  // prototype freezing would otherwise defend against.
  it("keeps freezePrototype off, so PDF generation works", () => {
    expect(conf.app.security.freezePrototype).toBe(false);
  });
});

describe("capabilities", () => {
  const ids = caps.permissions.map((p: string | { identifier: string }) =>
    typeof p === "string" ? p : p.identifier,
  );

  it("lets the close handler finish saving and then close the window", () => {
    expect(ids).toContain("core:window:allow-destroy");
  });

  it("grants no broad file, shell or URL permissions", () => {
    for (const id of ids) {
      expect(id).not.toMatch(
        /^fs:default$|^fs:allow-.*-recursive$|^fs:read-all|^fs:write-all|^shell:|^opener:default$|^opener:allow-open-url$/,
      );
    }
  });

  it("scopes every file permission to Documents/Wolf", () => {
    for (const p of caps.permissions) {
      if (typeof p === "string") continue;
      for (const scope of p.allow) expect(scope.path, p.identifier).toMatch(/^\$DOCUMENT\/Wolf(\/|$)/);
    }
  });
});

describe("source", () => {
  it("never injects raw HTML or evaluates strings", () => {
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/dangerouslySetInnerHTML|\beval\(|new Function\(|innerHTML\s*=/);
    }
  });
});
