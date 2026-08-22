import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatNavitiaHttpError } from "./departures-navitia.js";

describe("formatNavitiaHttpError", () => {
  it("labels 429 as quota", () => {
    const msg = formatNavitiaHttpError(429, "rate limit exceeded", "outbound");
    assert.match(msg, /quota dépassé/i);
    assert.match(msg, /429/);
  });

  it("detects quota wording in body", () => {
    const msg = formatNavitiaHttpError(403, "Quota journalier dépassé");
    assert.match(msg, /quota dépassé/i);
  });

  it("keeps generic HTTP errors otherwise", () => {
    const msg = formatNavitiaHttpError(500, "boom", "inbound");
    assert.equal(msg.startsWith("Navitia HTTP 500"), true);
    assert.doesNotMatch(msg, /quota dépassé/i);
  });
});
