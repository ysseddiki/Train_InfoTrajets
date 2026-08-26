import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeOutboundUrl } from "./outbound-http-log.js";

describe("sanitizeOutboundUrl", () => {
  it("redacts Teams webhook paths", () => {
    const raw =
      "https://prod-00.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?api-version=1";
    const out = sanitizeOutboundUrl(raw);
    assert.match(out, /masqué/);
    assert.doesNotMatch(out, /workflows\/abc/);
  });

  it("redacts sensitive query params", () => {
    const out = sanitizeOutboundUrl(
      "https://api.example.com/v1?token=secret&count=1",
    );
    assert.doesNotMatch(out, /secret/);
    assert.match(out, /token=/);
    assert.match(out, /count=1/);
  });

  it("keeps navitia paths", () => {
    const url =
      "https://api.sncf.com/v1/coverage/sncf/stop_areas/stop_area%3ASNCF%3A87756056/departures?count=40";
    const out = sanitizeOutboundUrl(url);
    assert.match(out, /api\.sncf\.com/);
    assert.match(out, /departures/);
  });
});
