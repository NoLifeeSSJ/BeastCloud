import { describe, it, expect } from "vitest";
import { occurrences, zonedISO, bytes } from "./api";
const event = (start: string, repeat: string, count: number) => ({
  id: "one",
  body: JSON.stringify({
    start,
    end: new Date(+new Date(start) + 3600000).toISOString(),
    repeat,
    count,
  }),
});
describe("calendar recurrence contract", () => {
  it("clamps monthly recurrence without drifting following months", () => {
    const r = occurrences(
      event("2026-01-31T10:00:00Z", "monthly", 3),
      new Date("2026-01-01"),
      new Date("2026-04-01"),
    );
    expect(r.map((e) => e.start.toISOString())).toEqual([
      "2026-01-31T10:00:00.000Z",
      "2026-02-28T10:00:00.000Z",
      "2026-03-31T10:00:00.000Z",
    ]);
  });
  it("daily recurrences preserve UTC instants across DST", () => {
    const r = occurrences(
      event("2026-03-28T10:00:00Z", "daily", 3),
      new Date("2026-03-01"),
      new Date("2026-04-01"),
    );
    expect(r.map((e) => e.start.getUTCHours())).toEqual([10, 10, 10]);
  });
  it("weekly recurrence respects a count and date window", () =>
    expect(
      occurrences(
        event("2026-01-01T10:00:00Z", "weekly", 3),
        new Date("2026-01-08"),
        new Date("2026-02-01"),
      ),
    ).toHaveLength(2));
  it("nonrecurring events occur once", () =>
    expect(
      occurrences(
        event("2026-01-01T10:00:00Z", "none", 200),
        new Date("2025-01-01"),
        new Date("2027-01-01"),
      ),
    ).toHaveLength(1));
  it("caps pathological recurrence expansion", () =>
    expect(
      occurrences(
        event("2026-01-01T10:00:00Z", "daily", 99999),
        new Date("2025-01-01"),
        new Date("2029-01-01"),
      ),
    ).toHaveLength(366));
  it("converts event timezone time to a UTC instant", () => {
    expect(zonedISO("2026-07-01T10:00", "Europe/Dublin")).toBe(
      "2026-07-01T09:00:00.000Z",
    );
    expect(zonedISO("2026-01-01T10:00", "Europe/Dublin")).toBe(
      "2026-01-01T10:00:00.000Z",
    );
  });
  it("formats bytes without claiming free capacity", () => {
    expect(bytes(0)).toBe("0 B");
    expect(bytes(1048576)).toBe("1.0 MB");
  });
});
