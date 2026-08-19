import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysYmd,
  dashboardPeriodStarts,
  parisMidnightIso,
  parisYmd,
} from "./paris-calendar.js";

describe("paris-calendar", () => {
  it("parisMidnightIso maps winter and summer offsets", () => {
    assert.equal(parisMidnightIso("2026-01-15"), "2026-01-14T23:00:00.000Z");
    assert.equal(parisMidnightIso("2026-07-15"), "2026-07-14T22:00:00.000Z");
  });

  it("parisMidnightIso stays 00:00 on DST transition days", () => {
    assert.equal(parisMidnightIso("2026-03-29"), "2026-03-28T23:00:00.000Z");
    assert.equal(parisMidnightIso("2026-10-25"), "2026-10-24T22:00:00.000Z");
  });

  it("addDaysYmd crosses month bounds", () => {
    assert.equal(addDaysYmd("2026-08-01", -1), "2026-07-31");
    assert.equal(addDaysYmd("2026-08-19", -2), "2026-08-17");
  });

  it("dashboardPeriodStarts uses Paris calendar week (Monday) and month/year", () => {
    // Wednesday 19 Aug 2026 12:00 UTC = 14:00 Paris
    const now = new Date("2026-08-19T12:00:00.000Z");
    assert.equal(parisYmd(now), "2026-08-19");
    const s = dashboardPeriodStarts(now);
    assert.equal(s.today, parisMidnightIso("2026-08-19"));
    assert.equal(s.week, parisMidnightIso("2026-08-17"));
    assert.equal(s.month, parisMidnightIso("2026-08-01"));
    assert.equal(s.year, parisMidnightIso("2026-01-01"));
    assert.equal(s.last24h, "2026-08-18T12:00:00.000Z");
  });
});
