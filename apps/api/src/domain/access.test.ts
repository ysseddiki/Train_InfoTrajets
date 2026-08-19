import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessDashboard,
  roleIsAllowed,
  wouldRemoveLastAdmin,
} from "./access.js";

describe("canAccessDashboard", () => {
  it("allows a session even if visitor is off", () => {
    assert.equal(
      canAccessDashboard({ hasSession: true, visitorEnabled: false }),
      true,
    );
  });

  it("allows anonymous when visitor is on", () => {
    assert.equal(
      canAccessDashboard({ hasSession: false, visitorEnabled: true }),
      true,
    );
  });

  it("denies anonymous when visitor is off", () => {
    assert.equal(
      canAccessDashboard({ hasSession: false, visitorEnabled: false }),
      false,
    );
  });
});

describe("roleIsAllowed", () => {
  it("lets liaison_editor write liaisons", () => {
    assert.equal(
      roleIsAllowed("liaison_editor", ["liaison_editor", "admin"]),
      true,
    );
  });

  it("blocks reader from admin-only", () => {
    assert.equal(roleIsAllowed("reader", ["admin"]), false);
  });
});

describe("wouldRemoveLastAdmin", () => {
  it("blocks disabling the last admin", () => {
    assert.equal(
      wouldRemoveLastAdmin({
        targetIsActiveAdmin: true,
        activeAdminCount: 1,
        disable: true,
      }),
      true,
    );
  });

  it("blocks demoting the last admin", () => {
    assert.equal(
      wouldRemoveLastAdmin({
        targetIsActiveAdmin: true,
        activeAdminCount: 1,
        nextRole: "reader",
      }),
      true,
    );
  });

  it("allows demoting when another admin remains", () => {
    assert.equal(
      wouldRemoveLastAdmin({
        targetIsActiveAdmin: true,
        activeAdminCount: 2,
        nextRole: "liaison_editor",
      }),
      false,
    );
  });

  it("ignores non-admin targets", () => {
    assert.equal(
      wouldRemoveLastAdmin({
        targetIsActiveAdmin: false,
        activeAdminCount: 1,
        disable: true,
      }),
      false,
    );
  });
});
