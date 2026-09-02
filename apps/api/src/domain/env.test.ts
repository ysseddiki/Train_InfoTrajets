import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { envPositiveInt } from "./env.js";

const KEY = "TEST_ENV_POSITIVE_INT";

afterEach(() => {
  delete process.env[KEY];
});

describe("envPositiveInt", () => {
  it("falls back when unset or blank", () => {
    assert.equal(envPositiveInt(KEY, 42), 42);
    process.env[KEY] = "   ";
    assert.equal(envPositiveInt(KEY, 42), 42);
  });

  it("reads a positive integer", () => {
    process.env[KEY] = "7";
    assert.equal(envPositiveInt(KEY, 42), 7);
  });

  it("falls back on values that would disable the guard", () => {
    for (const bad of ["abc", "0", "-5", "NaN", "Infinity"]) {
      process.env[KEY] = bad;
      assert.equal(envPositiveInt(KEY, 42), 42, `valeur: ${bad}`);
    }
  });
});
