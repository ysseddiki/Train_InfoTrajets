import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatNavitiaLocalDateTime,
  isNavitiaDepartureCancelled,
  parseNavitiaLocalDateTime,
  type NavitiaDeparture,
  type NavitiaDisruption,
} from "./departures-navitia.js";

describe("parseNavitiaLocalDateTime", () => {
  it("maps Paris wall time independent of process TZ (summer)", () => {
    const d = parseNavitiaLocalDateTime("20260825T164700");
    assert.ok(d);
    // 16:47 Europe/Paris CEST = 14:47 UTC
    assert.equal(d.toISOString(), "2026-08-25T14:47:00.000Z");
    assert.equal(
      d.toLocaleTimeString("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      "16:47",
    );
  });

  it("round-trips with formatNavitiaLocalDateTime", () => {
    const raw = "20260115T083000";
    const d = parseNavitiaLocalDateTime(raw);
    assert.ok(d);
    assert.equal(formatNavitiaLocalDateTime(d), raw);
  });
});

describe("isNavitiaDepartureCancelled", () => {
  it("detects departure_status deleted", () => {
    const dep: NavitiaDeparture = {
      stop_date_time: {
        base_departure_date_time: "20260825T165100",
        departure_date_time: "20260825T165100",
        departure_status: "deleted",
      },
    };
    assert.equal(isNavitiaDepartureCancelled(dep), true);
  });

  it("detects NO_SERVICE disruption linked to departure", () => {
    const dep: NavitiaDeparture = {
      stop_date_time: {
        base_departure_date_time: "20260825T165100",
        departure_date_time: "20260825T165100",
      },
      links: [{ type: "disruption", id: "d1" }],
    };
    const disruptions: NavitiaDisruption[] = [
      {
        id: "d1",
        severity: { effect: "NO_SERVICE", name: "trip canceled" },
      },
    ];
    assert.equal(isNavitiaDepartureCancelled(dep, disruptions), true);
  });

  it("ignores delay-only disruption", () => {
    const dep: NavitiaDeparture = {
      stop_date_time: {
        base_departure_date_time: "20260825T164700",
        departure_date_time: "20260825T174700",
      },
      links: [{ type: "disruption", id: "d2" }],
    };
    const disruptions: NavitiaDisruption[] = [
      {
        id: "d2",
        severity: { effect: "SIGNIFICANT_DELAYS", name: "delay" },
      },
    ];
    assert.equal(isNavitiaDepartureCancelled(dep, disruptions), false);
  });
});
