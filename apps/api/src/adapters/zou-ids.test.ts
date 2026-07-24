import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractUic,
  longToNumber,
  stopIdMatchesUic,
} from "./zou-ids.js";

describe("zou-ids", () => {
  it("extracts UIC from Navitia stop_area", () => {
    assert.equal(extractUic("stop_area:SNCF:87756056"), "87756056");
    assert.equal(extractUic("stop_area:SNCF:87756403"), "87756403");
  });

  it("extracts UIC from GTFS-RT stop_point", () => {
    assert.equal(extractUic("stop_point:MCN:87756056"), "87756056");
    assert.equal(extractUic("MCN:87756254"), "87756254");
  });

  it("matches stop ids containing UIC", () => {
    assert.equal(
      stopIdMatchesUic("stop_point:MCN:87756056", "87756056"),
      true,
    );
    assert.equal(stopIdMatchesUic("stop_point:MCN:87756254", "87756056"), false);
  });

  it("converts protobuf Long-like values", () => {
    assert.equal(longToNumber(600), 600);
    assert.equal(longToNumber({ toNumber: () => 120 }), 120);
    assert.equal(longToNumber(null), null);
  });
});
