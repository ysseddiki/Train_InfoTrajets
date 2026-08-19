import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  syntheticWeatherForStub,
  weatherBucketFromCode,
  weatherBucketLabel,
} from "./weather.js";

describe("weatherBucketFromCode", () => {
  it("maps clear and rain", () => {
    assert.equal(weatherBucketFromCode(0), "clear");
    assert.equal(weatherBucketFromCode(61), "rain");
    assert.equal(weatherBucketFromCode(95), "storm");
  });

  it("returns unknown for null", () => {
    assert.equal(weatherBucketFromCode(null), "unknown");
  });
});

describe("weatherBucketLabel", () => {
  it("returns French labels", () => {
    assert.equal(weatherBucketLabel("rain"), "Pluie");
  });
});

describe("syntheticWeatherForStub", () => {
  it("produces valid buckets", () => {
    for (let i = 0; i < 20; i++) {
      const w = syntheticWeatherForStub(Math.random());
      assert.ok(w.weatherBucket);
      assert.ok(w.weatherLabel);
    }
  });
});
