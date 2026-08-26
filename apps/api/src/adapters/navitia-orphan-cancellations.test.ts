import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NavitiaDeparture, NavitiaDisruption } from "./departures-navitia.js";
import {
  coveredKeysFromDepartures,
  listOrphanCancellationsFromImpactedObjects,
} from "./navitia-orphan-cancellations.js";

describe("listOrphanCancellationsFromImpactedObjects", () => {
  const disruptions: NavitiaDisruption[] = [
    {
      id: "d1",
      cause: "Travaux",
      impacted_objects: [
        {
          pt_object: {
            trip: { name: "881218", id: "SNCF:2026-08-26:881218:5111:Train" },
          },
          impacted_stops: [
            {
              stop_point: { id: "stop_point:SNCF:87756486:Train", name: "Menton" },
              base_departure_time: "095200",
              cause: "Travaux en cours sur le réseau ferré",
              stop_time_effect: "deleted",
              departure_status: "deleted",
            },
          ],
        },
      ],
    },
  ];

  it("synthesizes cancelled train missing from departures", () => {
    const orphans = listOrphanCancellationsFromImpactedObjects({
      disruptions,
      originStopId: "stop_area:SNCF:87756486",
      coveredKeys: new Set(),
      dayYmd: "20260826",
    });
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0]!.trainNumber, "881218");
    assert.equal(orphans[0]!.baseDepartureKey, "20260826T095200");
    assert.match(orphans[0]!.cause ?? "", /Travaux/);
  });

  it("skips when same train+time already in departures", () => {
    const dep: NavitiaDeparture = {
      display_informations: { trip_short_name: "881218" },
      stop_date_time: {
        base_departure_date_time: "20260826T095200",
        departure_date_time: "20260826T095200",
      },
    };
    const orphans = listOrphanCancellationsFromImpactedObjects({
      disruptions,
      originStopId: "stop_area:SNCF:87756486",
      coveredKeys: coveredKeysFromDepartures([dep]),
      dayYmd: "20260826",
    });
    assert.equal(orphans.length, 0);
  });

  it("ignores deleted stop at another station", () => {
    const orphans = listOrphanCancellationsFromImpactedObjects({
      disruptions,
      originStopId: "stop_area:SNCF:87756056",
      coveredKeys: new Set(),
      dayYmd: "20260826",
    });
    assert.equal(orphans.length, 0);
  });
});
