import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatNavitiaLocalDateTime,
  isNavitiaDepartureCancelled,
  navitiaStopIdKey,
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

  it("detects impacted_stops deleted at watched origin via trip number", () => {
    const dep: NavitiaDeparture = {
      display_informations: { trip_short_name: "881218" },
      stop_date_time: {
        base_departure_date_time: "20260826T095200",
        departure_date_time: "20260826T095200",
        departure_status: "unchanged",
      },
    };
    const disruptions: NavitiaDisruption[] = [
      {
        id: "d-impact",
        severity: { effect: "REDUCED_SERVICE", name: "travaux" },
        impacted_objects: [
          {
            pt_object: {
              trip: { id: "SNCF:2026-08-26:881218:5111:Train", name: "881218" },
            },
            impacted_stops: [
              {
                stop_point: { id: "stop_point:SNCF:87756486:Train", name: "Menton" },
                base_departure_time: "095200",
                cause: "Travaux en cours sur le réseau ferré",
                stop_time_effect: "deleted",
                departure_status: "deleted",
              },
              {
                stop_point: { id: "stop_point:SNCF:87756478:Train", name: "Carnoles" },
                base_departure_time: "095500",
                departure_status: "unchanged",
                stop_time_effect: "unchanged",
              },
            ],
          },
        ],
      },
    ];
    assert.equal(
      isNavitiaDepartureCancelled(dep, disruptions, "stop_area:SNCF:87756486"),
      true,
    );
    // Autre gare surveillée : pas de suppression à cet arrêt
    assert.equal(
      isNavitiaDepartureCancelled(dep, disruptions, "stop_area:SNCF:87756478"),
      false,
    );
  });

  it("navitiaStopIdKey normalizes stop_area and stop_point", () => {
    assert.equal(navitiaStopIdKey("stop_area:SNCF:87756486"), "87756486");
    assert.equal(navitiaStopIdKey("stop_point:SNCF:87756486:Train"), "87756486");
  });
});
