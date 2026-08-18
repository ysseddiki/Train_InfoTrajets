import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldNotifyDelayStep } from "./notify-step.js";

describe("shouldNotifyDelayStep", () => {
  it("always notifies on create", () => {
    assert.equal(
      shouldNotifyDelayStep({
        created: true,
        notifyStepMinutes: 5,
        kind: "delay",
        delayMinutes: 12,
        notifiedDelayMinutes: null,
        severity: "warning",
        notifiedSeverity: null,
      }),
      true,
    );
  });

  it("notifies when delay jumps by the step from last notified", () => {
    assert.equal(
      shouldNotifyDelayStep({
        created: false,
        notifyStepMinutes: 5,
        kind: "delay",
        previousKind: "delay",
        delayMinutes: 18,
        notifiedDelayMinutes: 12,
        severity: "warning",
        notifiedSeverity: "warning",
      }),
      true,
    );
  });

  it("skips when under the step", () => {
    assert.equal(
      shouldNotifyDelayStep({
        created: false,
        notifyStepMinutes: 5,
        kind: "delay",
        previousKind: "delay",
        delayMinutes: 14,
        notifiedDelayMinutes: 12,
        severity: "warning",
        notifiedSeverity: "warning",
      }),
      false,
    );
  });

  it("skips duration-only increase when step is 0", () => {
    assert.equal(
      shouldNotifyDelayStep({
        created: false,
        notifyStepMinutes: 0,
        kind: "delay",
        previousKind: "delay",
        delayMinutes: 40,
        notifiedDelayMinutes: 12,
        severity: "warning",
        notifiedSeverity: "warning",
      }),
      false,
    );
  });

  it("notifies on severity upgrade even if step is 0", () => {
    assert.equal(
      shouldNotifyDelayStep({
        created: false,
        notifyStepMinutes: 0,
        kind: "delay",
        previousKind: "delay",
        delayMinutes: 22,
        notifiedDelayMinutes: 12,
        severity: "critical",
        notifiedSeverity: "warning",
      }),
      true,
    );
  });

  it("notifies when kind becomes cancellation", () => {
    assert.equal(
      shouldNotifyDelayStep({
        created: false,
        notifyStepMinutes: 5,
        kind: "cancellation",
        previousKind: "delay",
        delayMinutes: null,
        notifiedDelayMinutes: 12,
        severity: "critical",
        notifiedSeverity: "warning",
      }),
      true,
    );
  });

  it("does not notify on delay decrease", () => {
    assert.equal(
      shouldNotifyDelayStep({
        created: false,
        notifyStepMinutes: 5,
        kind: "delay",
        previousKind: "delay",
        delayMinutes: 8,
        notifiedDelayMinutes: 12,
        severity: "warning",
        notifiedSeverity: "warning",
      }),
      false,
    );
  });
});
