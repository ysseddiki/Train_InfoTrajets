import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { vehicleJourneyServesOd } from "./departures-navitia.js";

const NICE = "stop_area:SNCF:87756056";
const MONACO = "stop_area:SNCF:87756403";
const MENTON = "stop_area:SNCF:87756408";

describe("vehicleJourneyServesOd", () => {
  it("accepts Nice then Monaco (Aller)", () => {
    assert.equal(
      vehicleJourneyServesOd([NICE, MONACO, MENTON], NICE, MONACO),
      true,
    );
  });

  it("accepts Monaco then Nice (Retour ouest)", () => {
    assert.equal(
      vehicleJourneyServesOd([MENTON, MONACO, NICE], MONACO, NICE),
      true,
    );
  });

  it("rejects Menton-bound when watching Monaco → Nice (Nice is upstream)", () => {
    // Parcours Nice → Monaco → Menton : à Monaco, Nice est déjà derrière
    assert.equal(
      vehicleJourneyServesOd([NICE, MONACO, MENTON], MONACO, NICE),
      false,
    );
  });

  it("rejects when destination missing after origin", () => {
    assert.equal(vehicleJourneyServesOd([NICE, MONACO], MONACO, MENTON), false);
  });

  it("rejects when origin missing", () => {
    assert.equal(vehicleJourneyServesOd([NICE, MENTON], MONACO, NICE), false);
  });
});
