import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  checkLoginRateLimit,
  checkReadRateLimit,
  resetAllRateLimits,
  resetLoginRateLimit,
} from "./rate-limit.js";

const MAX_IP = Number(process.env.LOGIN_RATE_MAX ?? 10);
const MAX_USER = Number(process.env.LOGIN_RATE_MAX_USER ?? 20);

function attempt(ip: string, username: string) {
  return checkLoginRateLimit(ip, username);
}

describe("login rate limit", () => {
  beforeEach(() => {
    resetAllRateLimits();
  });

  it("blocks an IP after its own quota, sparing other IPs", () => {
    for (let i = 0; i < MAX_IP; i += 1) {
      assert.equal(attempt("203.0.113.7", `user${i}`).allowed, true);
    }
    const blocked = attempt("203.0.113.7", "userX");
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSec > 0);

    // Un opérateur légitime depuis une autre IP passe toujours
    assert.equal(attempt("198.51.100.4", "admin").allowed, true);
  });

  it("blocks a targeted account across rotating IPs", () => {
    for (let i = 0; i < MAX_USER; i += 1) {
      assert.equal(attempt(`198.51.100.${i}`, "admin").allowed, true);
    }
    assert.equal(attempt("198.51.100.200", "admin").allowed, false);
    // Un autre compte reste joignable
    assert.equal(attempt("198.51.100.201", "reader").allowed, true);
  });

  it("only clears the pair involved on success", () => {
    for (let i = 0; i < MAX_IP; i += 1) attempt("203.0.113.7", "admin");
    assert.equal(attempt("203.0.113.7", "admin").allowed, false);

    // Succès depuis une IP tierce : ne doit pas réarmer l'attaquant
    resetLoginRateLimit("198.51.100.4", "reader");
    assert.equal(attempt("203.0.113.7", "admin").allowed, false);

    resetLoginRateLimit("203.0.113.7", "admin");
    assert.equal(attempt("203.0.113.7", "admin").allowed, true);
  });

  it("counts the username case-insensitively", () => {
    for (let i = 0; i < MAX_USER; i += 1) attempt(`198.51.100.${i}`, "Admin");
    assert.equal(attempt("198.51.100.200", "aDMIN").allowed, false);
  });

  it("extends the block on repeated saturation", () => {
    for (let i = 0; i < MAX_IP; i += 1) attempt("203.0.113.9", "admin");
    const first = attempt("203.0.113.9", "admin");
    assert.equal(first.allowed, false);
    // La pénalité dépasse la fenêtre nominale
    const windowSec = Number(process.env.LOGIN_RATE_WINDOW_MS ?? 900_000) / 1000;
    assert.ok(first.retryAfterSec >= windowSec - 1);
  });
});

describe("read rate limit", () => {
  beforeEach(() => {
    resetAllRateLimits();
  });

  it("allows normal UI traffic and blocks scraping", () => {
    const max = Number(process.env.READ_RATE_MAX ?? 300);
    for (let i = 0; i < max; i += 1) {
      assert.equal(checkReadRateLimit("203.0.113.30").allowed, true);
    }
    assert.equal(checkReadRateLimit("203.0.113.30").allowed, false);
    assert.equal(checkReadRateLimit("203.0.113.31").allowed, true);
  });
});
