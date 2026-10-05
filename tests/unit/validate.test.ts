import { describe, expect, it } from "vitest";
import { parseDataFile, validateData } from "../../src/lib/validate";
import { issuedInvoice } from "../fixtures";

const valid = () => JSON.parse(JSON.stringify(issuedInvoice().data));

describe("data file validation", () => {
  it("accepts a real export and round-trips it unchanged", () => {
    const data = valid();
    const result = validateData(data);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(data);
  });

  it("rejects things that aren't Wolf files", () => {
    expect(parseDataFile("not json").ok).toBe(false);
    expect(validateData([]).ok).toBe(false);
    expect(validateData({ hello: "world" }).ok).toBe(false);
  });

  it("refuses a file from a newer version", () => {
    const result = validateData({ ...valid(), version: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/newer version/);
  });

  it("reports where a file is wrong instead of half-loading it", () => {
    const data = valid();
    data.documents[0].lines[0].unitPriceCents = 12.5; // money must be integer cents
    data.documents[0].issueDate = "13/08/2026";
    data.clients[0].name = 42;
    const result = validateData(data);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("documents[0].lines[0].unitPriceCents"),
          expect.stringContaining("documents[0].issueDate"),
          expect.stringContaining("clients[0].name"),
        ]),
      );
    }
  });

  it("rejects duplicate invoice numbers and inconsistent states", () => {
    const data = valid();
    data.documents.push({ ...data.documents[0], id: "other" });
    expect(validateData(data).ok).toBe(false);

    const draftWithNumber = valid();
    draftWithNumber.documents[0].status = "draft";
    expect(validateData(draftWithNumber).ok).toBe(false);
  });

  it("rejects document numbers that could be used as file paths", () => {
    const data = valid();
    data.documents[0].number = "../../etc/passwd";
    expect(validateData(data).ok).toBe(false);
  });

  it("strips a logo that isn't an embedded image (e.g. a tracking URL)", () => {
    const data = valid();
    data.business.logo = "https://tracker.example/pixel.png";
    const result = validateData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.business.logo).toBeNull();
      expect(result.warnings).toHaveLength(1);
    }
  });

  it("fills defaults for fields added in later versions", () => {
    const data = valid();
    delete data.business.documentLanguage;
    delete data.preferences;
    const result = validateData(data);
    expect(result.ok && result.data.business.documentLanguage).toBe("en");
    expect(result.ok && result.data.preferences).toEqual({ theme: "dark", language: "en" });
  });

  it("refuses absurdly large input before parsing", () => {
    expect(parseDataFile("x".repeat(26 * 1024 * 1024)).ok).toBe(false);
  });
});
