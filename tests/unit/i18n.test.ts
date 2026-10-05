import { describe, expect, it } from "vitest";
import { translate } from "../../src/i18n";
import { en, nl } from "../../src/i18n/strings";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const intentionallyEmpty = new Set(["save.idle", "editor.settledOn.draft", "editor.settledOn.sent"]);

describe("translations", () => {
  it("has a Dutch string for every English key, with the same placeholders", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      if (!intentionallyEmpty.has(key)) expect(nl[key], key).toBeTruthy();
      expect(placeholders(nl[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("fills placeholders", () => {
    expect(translate("en", "editor.issued", { number: "F2026-001" })).toBe("Issued as F2026-001.");
    expect(translate("nl", "editor.issued", { number: "F2026-001" })).toBe("Uitgegeven als F2026-001.");
  });

  it("contains no em dashes", () => {
    for (const table of [en, nl]) for (const s of Object.values(table)) expect(s).not.toContain("\u2014");
  });
});
