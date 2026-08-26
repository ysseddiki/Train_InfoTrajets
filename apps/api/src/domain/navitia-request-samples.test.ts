import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendNavitiaRequestSample,
  clearNavitiaRequestSamples,
  formatNavitiaRawRequest,
  listNavitiaRequestSamples,
  NAVITIA_REQUEST_CATALOG,
} from "./navitia-request-samples.js";

describe("formatNavitiaRawRequest", () => {
  it("masks Authorization and keeps path + query", () => {
    const raw = formatNavitiaRawRequest(
      "https://api.sncf.com/v1/coverage/sncf/stop_areas/stop_area%3AOCE87756056/departures?count=40&data_freshness=realtime",
    );
    assert.match(raw, /^GET \/v1\/coverage\/sncf\/stop_areas\//);
    assert.match(raw, /Authorization: Basic \*\*\*/);
    assert.doesNotMatch(raw, /Basic [A-Za-z0-9+/=]{8,}/);
    assert.match(raw, /count=40/);
  });
});

describe("NAVITIA_REQUEST_CATALOG", () => {
  it("documents the three live call kinds", () => {
    const kinds = NAVITIA_REQUEST_CATALOG.map((c) => c.kind).sort();
    assert.deepEqual(kinds, ["departures", "probe", "vehicle_journey"]);
  });
});

describe("navitia sample buffer", () => {
  it("stores raw samples without secrets", () => {
    clearNavitiaRequestSamples();
    appendNavitiaRequestSample({
      kind: "probe",
      situation: "Probe Admin",
      url: "https://api.sncf.com/v1/coverage/sncf",
      httpStatus: 200,
      ok: true,
      durationMs: 42,
    });
    const samples = listNavitiaRequestSamples();
    assert.equal(samples.length, 1);
    assert.match(samples[0]!.rawRequest, /Basic \*\*\*/);
    assert.equal(samples[0]!.kind, "probe");
  });
});
