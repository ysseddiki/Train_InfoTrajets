import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JourneyConfig } from "@sncf-alerts/shared";
import { matchesDestinationFilter } from "./matching.js";

function journey(partial: Partial<JourneyConfig>): JourneyConfig {
  return {
    id: "j1",
    liaisonId: "l1",
    direction: "outbound",
    label: "Aller",
    originId: "stop_area:SNCF:87756056",
    originLabel: "Nice-Ville",
    destinationId: "stop_area:SNCF:87756403",
    destinationLabel: "Monaco - Monte-Carlo",
    network: "ter",
    daysOfWeek: [1, 2, 3, 4, 5],
    timeWindow: { start: "07:00", end: "09:30" },
    watchAlways: false,
    watchLeadHours: 4,
    minDelayMinutes: 10,
    severities: ["delay", "cancellation"],
    active: true,
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("matchesDestinationFilter (gare desservie)", () => {
  it("matches when direction text contains Monaco", () => {
    const j = journey({});
    assert.equal(
      matchesDestinationFilter(j, "Monaco-Monte-Carlo"),
      true,
    );
  });

  it("matches partial token in a longer headsign", () => {
    const j = journey({});
    assert.equal(
      matchesDestinationFilter(j, "Menton via Monaco"),
      true,
    );
  });

  it("rejects unrelated direction", () => {
    const j = journey({});
    assert.equal(matchesDestinationFilter(j, "Cannes"), false);
  });

  it("matches by destination id when provided", () => {
    const j = journey({});
    assert.equal(
      matchesDestinationFilter(j, "Quelque part", "stop_area:SNCF:87756403"),
      true,
    );
  });

  it("matches Menton via corridor allowlist (terminus beyond Monaco)", () => {
    const j = journey({});
    assert.equal(matchesDestinationFilter(j, "Menton"), true);
  });

  it("matches via station terminusAliases (G&C spelling)", () => {
    const j = journey({ destinationLabel: "Monaco - Monte-Carlo" });
    assert.equal(
      matchesDestinationFilter(j, "Monte Carlo", null, ["Monte Carlo"]),
      true,
    );
  });

  it("rejects when neither label nor aliases match", () => {
    const j = journey({
      originId: "a",
      destinationId: "b",
      destinationLabel: "Somewhere",
    });
    assert.equal(
      matchesDestinationFilter(j, "Cannes", null, ["Antibes"]),
      false,
    );
  });
});
