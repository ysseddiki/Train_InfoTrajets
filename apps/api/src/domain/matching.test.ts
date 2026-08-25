import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JourneyConfig } from "@sncf-alerts/shared";
import {
  isInCoreWatchSchedule,
  isInWatchSchedule,
  isWatchedDeparture,
  matchesDestinationFilter,
} from "./matching.js";

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
    notifyStepMinutes: 5,
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

  it("matches Menton via terminus helpers when enabled", () => {
    const j = journey({
      // Hors corridor (destination fictive) pour isoler les helpers
      destinationId: "stop_area:SNCF:99999999",
      destinationLabel: "Gare Test",
    });
    assert.equal(matchesDestinationFilter(j, "Menton"), false);
    assert.equal(
      matchesDestinationFilter(j, "Menton", null, {
        enabled: true,
        labels: ["Menton", "Vintimille"],
      }),
      true,
    );
    assert.equal(
      matchesDestinationFilter(j, "Menton", null, {
        enabled: false,
        labels: ["Menton"],
      }),
      false,
    );
  });
});

describe("watch window + delayed leftover trains", () => {
  const tueMorning = (hm: string) =>
    new Date(`2026-08-18T${hm}:00+02:00`);

  it("keeps polling 2 h after travel window end", () => {
    const j = journey({});
    assert.equal(isInWatchSchedule(j, tueMorning("04:30")), true);
    assert.equal(isInWatchSchedule(j, tueMorning("08:00")), true);
    assert.equal(isInWatchSchedule(j, tueMorning("10:00")), true);
    assert.equal(isInWatchSchedule(j, tueMorning("11:31")), false);
  });

  it("does not shrink a 00:00–23:59 window", () => {
    const j = journey({
      timeWindow: { start: "00:00", end: "23:59" },
      watchLeadHours: 0,
    });
    assert.equal(isInWatchSchedule(j, tueMorning("10:00")), true);
  });

  it("core watch ends at travel window end", () => {
    const j = journey({});
    assert.equal(isInCoreWatchSchedule(j, tueMorning("09:30")), true);
    assert.equal(isInCoreWatchSchedule(j, tueMorning("09:31")), false);
  });

  it("keeps a theoretically-passed train still due during lag", () => {
    const j = journey({});
    const now = tueMorning("09:40");
    const scheduled = tueMorning("09:20");
    const realtime = tueMorning("09:55");
    assert.equal(isWatchedDeparture(j, scheduled, realtime, now), true);
  });

  it("drops a train scheduled after the travel window during lag", () => {
    const j = journey({});
    const now = tueMorning("09:40");
    const scheduled = tueMorning("10:20");
    assert.equal(isWatchedDeparture(j, scheduled, scheduled, now), false);
  });

  it("drops a train whose realtime departure already elapsed", () => {
    const j = journey({});
    const now = tueMorning("08:30");
    const scheduled = tueMorning("08:00");
    const realtime = tueMorning("08:10");
    assert.equal(isWatchedDeparture(j, scheduled, realtime, now), false);
  });

  it("keeps a delayed leftover during the travel window", () => {
    const j = journey({});
    const now = tueMorning("08:05");
    const scheduled = tueMorning("07:50");
    const realtime = tueMorning("08:20");
    assert.equal(isWatchedDeparture(j, scheduled, realtime, now), true);
  });

  it("during lead, only trains whose theoretical time is in travel window", () => {
    const j = journey({
      timeWindow: { start: "16:00", end: "20:00" },
      watchLeadHours: 2,
    });
    const now = new Date("2026-08-18T15:00:00+02:00");
    assert.equal(isInWatchSchedule(j, now), true);
    assert.equal(
      isWatchedDeparture(
        j,
        new Date("2026-08-18T15:20:00+02:00"),
        new Date("2026-08-18T15:35:00+02:00"),
        now,
      ),
      false,
    );
    assert.equal(
      isWatchedDeparture(
        j,
        new Date("2026-08-18T16:30:00+02:00"),
        new Date("2026-08-18T16:45:00+02:00"),
        now,
      ),
      true,
    );
  });

  it("drops a train scheduled before travel window even during the window", () => {
    const j = journey({
      timeWindow: { start: "16:00", end: "20:00" },
      watchLeadHours: 0,
    });
    const now = new Date("2026-08-18T16:10:00+02:00");
    assert.equal(
      isWatchedDeparture(
        j,
        new Date("2026-08-18T15:40:00+02:00"),
        new Date("2026-08-18T16:20:00+02:00"),
        now,
      ),
      false,
    );
  });

  it("drops a cancelled train after its theoretical time (+ slack)", () => {
    const j = journey({});
    const now = tueMorning("08:30");
    const scheduled = tueMorning("08:00");
    assert.equal(
      isWatchedDeparture(j, scheduled, scheduled, now, true),
      false,
    );
  });

  it("keeps a cancelled train until theoretical departure", () => {
    const j = journey({});
    const now = tueMorning("07:50");
    const scheduled = tueMorning("08:00");
    assert.equal(
      isWatchedDeparture(j, scheduled, null, now, true),
      true,
    );
  });
});
