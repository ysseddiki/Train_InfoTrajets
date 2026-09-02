import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OutboundBudget } from "./outbound-budget.js";

describe("outbound-budget", () => {
  it("caps calls inside a window", () => {
    const budget = new OutboundBudget(3, 60_000);
    const t0 = 1_000_000;
    assert.equal(budget.tryConsume(t0), true);
    assert.equal(budget.tryConsume(t0), true);
    assert.equal(budget.tryConsume(t0), true);
    assert.equal(budget.tryConsume(t0), false);
    assert.equal(budget.remaining(t0), 0);
  });

  it("refills on the next window", () => {
    const budget = new OutboundBudget(2, 60_000);
    const t0 = 1_000_000;
    budget.tryConsume(t0);
    budget.tryConsume(t0);
    assert.equal(budget.tryConsume(t0), false);
    assert.equal(budget.tryConsume(t0 + 60_000), true);
  });
});
