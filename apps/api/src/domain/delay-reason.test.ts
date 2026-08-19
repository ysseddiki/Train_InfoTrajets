import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  delayReasonFromNavitia,
  delayReasonFromParts,
} from "./delay-reason.js";

describe("delayReasonFromParts", () => {
  it("prefers message then cause for display", () => {
    const r = delayReasonFromParts({
      cause: "travaux",
      message: "Travaux voie 2",
    });
    assert.equal(r.delayReason, "Travaux voie 2");
    assert.equal(r.delayReasonKey, "travaux");
  });

  it("returns empty when nothing usable", () => {
    const r = delayReasonFromParts({});
    assert.equal(r.delayReason, null);
    assert.equal(r.delayReasonKey, null);
  });
});

describe("delayReasonFromNavitia", () => {
  it("matches disruption via departure links", () => {
    const r = delayReasonFromNavitia(
      { links: [{ type: "disruption", id: "d1" }] },
      [
        {
          id: "d1",
          cause: "Incident voyageur",
          messages: [{ text: "Personne sur les voies" }],
        },
      ],
    );
    assert.equal(r.delayReason, "Personne sur les voies");
    assert.equal(r.delayReasonKey, "incident voyageur");
  });

  it("ignores unrelated disruptions", () => {
    const r = delayReasonFromNavitia(
      { links: [{ type: "vehicle_journey", id: "vj" }] },
      [{ id: "d1", cause: "travaux" }],
    );
    assert.equal(r.delayReason, null);
  });
});
