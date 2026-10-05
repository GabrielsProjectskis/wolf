import { describe, expect, it } from "vitest";
import {
  calculateTotals,
  formatMoney,
  lineNetCents,
  normaliseDecimal,
  parseAmount,
  parseQuantity,
  roundHalfUp,
  vatOn,
} from "../../src/lib/money";

const l = (quantity: number, unitPriceCents: number, vatRate = 21) => ({ quantity, unitPriceCents, vatRate });

describe("parsing what people type", () => {
  it.each([
    ["7,5", "7.5"],
    ["7.5", "7.5"],
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
    ["€ 85", "85"],
    ["1 234,5", "1234.5"],
    ["-12,50", "-12.50"],
    [",5", "0.5"],
    ["12,", "12"],
  ])("%s -> %s", (input, expected) => {
    expect(normaliseDecimal(input)).toBe(expected);
  });

  it.each(["", "-", "abc", ".", "1.2.3,4,5"])("rejects %j", (input) => {
    expect(normaliseDecimal(input)).toBeNull();
  });

  it("parses amounts to exact cents without float error", () => {
    expect(parseAmount("19,99")).toBe(1999);
    // One separator and exactly three digits is thousands grouping for money.
    expect(parseAmount("1.500")).toBe(150000);
    expect(parseAmount("2,750")).toBe(275000);
    expect(parseAmount("12,5")).toBe(1250);
    expect(parseAmount("0,125")).toBe(13); // a leading 0 is never grouping: rounded half up
    expect(parseAmount("0.1")).toBe(10);
    expect(parseAmount("1234567.89")).toBe(123456789);
    expect(parseAmount("-0,005")).toBe(-1);
    expect(parseAmount("1500", "HUF")).toBe(1500);
  });

  it("parses quantities to three decimals", () => {
    expect(parseQuantity("7,5")).toBe(7.5);
    expect(parseQuantity("0,3333")).toBe(0.333);
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity("1.500")).toBe(1.5); // quantities keep the decimal reading
    expect(parseQuantity("x")).toBeNull();
  });
});

describe("line totals", () => {
  it("handles fractional hours", () => {
    expect(lineNetCents(l(7.5, 8500))).toBe(63750);
  });
  it("rounds once, half away from zero", () => {
    expect(lineNetCents(l(1.005, 100))).toBe(101); // float maths would give 100
    expect(lineNetCents(l(0.333, 1000))).toBe(333);
    expect(lineNetCents(l(-1.005, 100))).toBe(-101);
  });
  it("stays exact for very large values", () => {
    expect(lineNetCents(l(1_000_000, 100_000_000_000))).toBe(100_000_000_000_000_000);
  });
});

describe("VAT", () => {
  it("groups by rate and rounds per group, not per line", () => {
    const seven = Array.from({ length: 7 }, () => l(1, 1450));
    const perLine = seven.reduce((s, x) => s + roundHalfUp(x.unitPriceCents * 0.21), 0);
    expect(perLine).toBe(2135); // the wrong way
    expect(calculateTotals(seven).vatCents).toBe(2132); // the right way
  });

  it("keeps mixed rates apart", () => {
    const t = calculateTotals([l(1, 10000, 21), l(1, 10000, 9)]);
    expect(t.groups).toEqual([
      { rate: 9, netCents: 10000, vatCents: 900 },
      { rate: 21, netCents: 10000, vatCents: 2100 },
    ]);
    expect(t.grossCents).toBe(23000);
  });

  it("handles non-integer rates exactly", () => {
    expect(vatOn(10000, 25.5)).toBe(2550);
    expect(vatOn(1000, 2.1)).toBe(21);
    expect(vatOn(110, 5.5)).toBe(6); // 6.05 -> 6
    expect(vatOn(1000, 13.5)).toBe(135);
  });

  it("zero-rates the whole document under reverse charge, export and exemption", () => {
    for (const treatment of ["reverse_charge", "export", "exempt_small_business"] as const) {
      const t = calculateTotals([l(2, 50000, 21), l(1, 1000, 9)], treatment);
      expect(t.vatCents).toBe(0);
      expect(t.grossCents).toBe(101000);
      expect(t.groups).toEqual([{ rate: 0, netCents: 101000, vatCents: 0 }]);
    }
  });

  it("totals an empty document to zero", () => {
    expect(calculateTotals([])).toEqual({ netCents: 0, vatCents: 0, grossCents: 0, groups: [] });
  });

  it("totals a credit note negatively, rounding away from zero", () => {
    expect(calculateTotals([l(-1, 10000)]).grossCents).toBe(-12100);
    expect(calculateTotals([l(-7, 1450)]).vatCents).toBe(-2132);
  });
});

describe("formatMoney", () => {
  it("never prints negative zero", () => {
    expect(formatMoney(-0, "EUR", "en-IE")).toBe("€0.00");
    expect(formatMoney(-0, "EUR", "nl-NL")).not.toContain("-");
  });
  it("localises", () => {
    expect(formatMoney(123456, "EUR", "en-IE")).toBe("€1,234.56");
    expect(formatMoney(123456, "EUR", "nl-NL")).toMatch(/1\.234,56/);
    expect(formatMoney(150000, "HUF", "en-IE")).toMatch(/150,000/);
  });
});
