import { describe, expect, it } from "vitest";
import { highestIssued, issueNumber, previewNumber, rollYear } from "../../src/lib/numbering";
import type { Counter } from "../../src/types";

const counter: Counter = { prefix: "F", next: 7, year: 2026, pad: 3 };

describe("numbering", () => {
  it("formats with prefix, year and padding", () => {
    expect(previewNumber(counter, 2026)).toBe("F2026-007");
  });

  it("consumes exactly one number", () => {
    const first = issueNumber(counter, 2026);
    expect(first.number).toBe("F2026-007");
    expect(first.counter.next).toBe(8);
    expect(issueNumber(first.counter, 2026).number).toBe("F2026-008");
  });

  it("restarts at 1 in a new year", () => {
    expect(issueNumber(counter, 2027).number).toBe("F2027-001");
    expect(rollYear(counter, 2027)).toEqual({ ...counter, year: 2027, next: 1 });
  });

  it("never rolls backwards if the clock is wrong", () => {
    expect(rollYear(counter, 2025)).toBe(counter);
  });

  it("finds the highest issued sequence for the current prefix and year", () => {
    const docs = [
      { kind: "invoice", number: "F2026-003", sequence: 3 },
      { kind: "invoice", number: "F2025-009", sequence: 9 },
      { kind: "quote", number: "F2026-008", sequence: 8 },
      { kind: "invoice", number: null, sequence: null },
    ] as never;
    expect(highestIssued(docs, "invoice", counter)).toBe(3);
  });
});
