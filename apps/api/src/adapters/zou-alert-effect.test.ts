import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kindFromZouAlertEffect } from "./departures-zou-gtfsrt.js";

describe("kindFromZouAlertEffect (GTFS-RT Alert.Effect)", () => {
  it("maps NO_SERVICE → cancellation", () => {
    assert.equal(kindFromZouAlertEffect(1), "cancellation");
  });

  it("does not treat SIGNIFICANT_DELAYS as delay (ZOU abuse)", () => {
    // Feed ZOU : canicule / vélos / consignes aussi en effect=3
    assert.equal(kindFromZouAlertEffect(3), null);
  });

  it("ignores informational / other effects", () => {
    for (const effect of [0, 2, 4, 5, 6, 7, 8, 9, 10, 11]) {
      assert.equal(kindFromZouAlertEffect(effect), null);
    }
  });
});
