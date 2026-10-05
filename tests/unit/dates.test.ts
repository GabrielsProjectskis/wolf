import { afterEach, describe, expect, it } from "vitest";
import { addDays, daysBetween, formatDate, isIsoDate, todayIso } from "../../src/lib/dates";

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe("addDays", () => {
  // The original bug: parsed as local midnight, printed as UTC, so
  // everywhere east of Greenwich every due date was one day early.
  it.each(["Europe/Amsterdam", "Europe/Helsinki", "Pacific/Auckland", "America/Los_Angeles", "UTC"])(
    "adds 30 days correctly in %s",
    (tz) => {
      process.env.TZ = tz;
      expect(addDays("2026-08-13", 30)).toBe("2026-09-12");
    },
  );

  it("is unaffected by daylight-saving changes", () => {
    process.env.TZ = "Europe/Amsterdam";
    // DST ends on 25 October 2026 and starts on 29 March 2026.
    expect(addDays("2026-10-20", 10)).toBe("2026-10-30");
    expect(addDays("2026-03-25", 7)).toBe("2026-04-01");
  });

  it("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-12-20", 14)).toBe("2027-01-03");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-08-13", 0)).toBe("2026-08-13");
    expect(addDays("2026-01-05", -10)).toBe("2025-12-26");
  });
});

describe("todayIso", () => {
  it("uses the local calendar, not UTC", () => {
    process.env.TZ = "Europe/Amsterdam";
    // 00:30 in Amsterdam on 14 Aug is still 13 Aug in UTC.
    const justAfterMidnight = new Date("2026-08-13T22:30:00Z");
    expect(todayIso(justAfterMidnight)).toBe("2026-08-14");
  });
});

describe("isIsoDate", () => {
  it("accepts real dates and rejects impossible ones", () => {
    expect(isIsoDate("2026-08-13")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("13-08-2026")).toBe(false);
    expect(isIsoDate(20260813)).toBe(false);
  });
});

describe("daysBetween and formatDate", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-08-13", "2026-09-12")).toBe(30);
  });
  it("formats in the document language", () => {
    expect(formatDate("2026-08-13", "en-IE")).toBe("13 August 2026");
    expect(formatDate("2026-08-13", "nl-NL")).toBe("13 augustus 2026");
  });
});
