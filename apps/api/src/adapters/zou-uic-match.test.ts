import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JourneyConfig } from "@sncf-alerts/shared";
import {
  isZouDepartureInSurveillanceWindow,
  tripServesUicOd,
} from "./departures-zou-gtfsrt.js";
import type { ZouStaticIndex } from "./zou-gtfs-static.js";

function emptyIndex(overrides?: Partial<ZouStaticIndex>): ZouStaticIndex {
  return {
    fetchedAt: Date.now(),
    stopUic: new Map(),
    stopName: new Map(),
    trips: new Map(),
    tripStopIds: new Map(),
    ...overrides,
  };
}

const baseJourney = {
  id: "j1",
  liaisonId: "l1",
  direction: "outbound" as const,
  label: "Test",
  originId: "stop_area:SNCF:87756056",
  originLabel: "Nice",
  destinationId: "stop_area:SNCF:87756403",
  destinationLabel: "Monaco",
  network: "TER",
  daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
  timeWindow: { start: "00:00", end: "23:59" },
  watchLeadHours: 0,
  watchAlways: false,
  minDelayMinutes: 5,
  severities: ["delay", "cancellation"] as JourneyConfig["severities"],
  active: true,
  updatedAt: new Date().toISOString(),
};

describe("tripServesUicOd", () => {
  it("matches when RT stops have origin then dest", () => {
    const index = emptyIndex();
    assert.equal(
      tripServesUicOd(
        index,
        "trip-1",
        ["stop:87756056", "stop:87756065", "stop:87756403"],
        "87756056",
        "87756403",
      ),
      true,
    );
  });

  it("rejects when dest is before origin on RT", () => {
    const index = emptyIndex();
    assert.equal(
      tripServesUicOd(
        index,
        "trip-1",
        ["stop:87756403", "stop:87756056"],
        "87756056",
        "87756403",
      ),
      false,
    );
  });

  it("falls back to static stop_times when RT incomplete", () => {
    const index = emptyIndex({
      stopUic: new Map([
        ["A", "87756056"],
        ["B", "87756403"],
      ]),
      tripStopIds: new Map([["trip-static", ["A", "B"]]]),
    });
    assert.equal(
      tripServesUicOd(index, "trip-static", ["A"], "87756056", "87756403"),
      true,
    );
  });

  it("does not use headsign — missing dest UIC fails", () => {
    const index = emptyIndex({
      trips: new Map([
        [
          "trip-head",
          { tripId: "trip-head", headsign: "Menton", shortName: "123" },
        ],
      ]),
      tripStopIds: new Map([["trip-head", ["A"]]]),
      stopUic: new Map([["A", "87756056"]]),
    });
    assert.equal(
      tripServesUicOd(index, "trip-head", ["A"], "87756056", "87756403"),
      false,
    );
  });
});

describe("isZouDepartureInSurveillanceWindow", () => {
  it("accepts departure inside full-day watch", () => {
    const now = new Date("2026-07-27T10:00:00+02:00");
    const epoch = Math.floor(now.getTime() / 1000) + 3600;
    assert.equal(
      isZouDepartureInSurveillanceWindow(baseJourney, epoch, now),
      true,
    );
  });

  it("accepts null epoch when currently in watch", () => {
    const now = new Date("2026-07-27T10:00:00+02:00");
    assert.equal(
      isZouDepartureInSurveillanceWindow(baseJourney, null, now),
      true,
    );
  });
});
