import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTrustedProxies } from "./trusted-proxies.js";

describe("trusted-proxies", () => {
  it("trusts the local reverse-proxy by default", () => {
    assert.equal(parseTrustedProxies(undefined), "loopback");
    assert.equal(parseTrustedProxies("  "), "loopback");
  });

  it("parses an explicit allowlist", () => {
    assert.deepEqual(parseTrustedProxies("10.0.0.1, 10.0.0.0/8"), [
      "10.0.0.1",
      "10.0.0.0/8",
    ]);
  });

  it("trusts nothing when disabled (API exposed directly)", () => {
    assert.equal(parseTrustedProxies("false"), false);
    assert.equal(parseTrustedProxies("NONE"), false);
  });
});
