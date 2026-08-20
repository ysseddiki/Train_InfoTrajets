import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  snapshotFromDailyRow,
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

describe("snapshotFromDailyRow", () => {
  it("maps rain daily totals", () => {
    const snap = snapshotFromDailyRow({
      weatherCode: 61,
      temperatureC: 14.21,
      precipitationMm: 3.44,
      windSpeedKmh: 22.1,
    });
    assert.equal(snap.weatherBucket, "rain");
    assert.equal(snap.temperatureC, 14.2);
    assert.equal(snap.precipitationMm, 3.4);
    assert.equal(snap.windSpeedKmh, 22.1);
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
