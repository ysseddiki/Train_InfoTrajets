import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesCorridorAllowlist } from "./corridor.js";

const niceMonaco = {
  originId: "stop_area:SNCF:87756056",
  destinationId: "stop_area:SNCF:87756403",
  originLabel: "Nice-Ville",
  destinationLabel: "Monaco - Monte-Carlo",
};

const monacoNice = {
  originId: "stop_area:SNCF:87756403",
  destinationId: "stop_area:SNCF:87756056",
  originLabel: "Monaco - Monte-Carlo",
  destinationLabel: "Nice-Ville",
};

describe("matchesCorridorAllowlist", () => {
  it("accepts Menton when filtre is Monaco (Nice → Est)", () => {
    assert.equal(matchesCorridorAllowlist(niceMonaco, "Menton"), true);
  });

  it("accepts Vintimille beyond Monaco", () => {
    assert.equal(
      matchesCorridorAllowlist(niceMonaco, "Vintimille"),
      true,
    );
  });

  it("accepts Monaco itself", () => {
    assert.equal(
      matchesCorridorAllowlist(niceMonaco, "Monaco - Monte-Carlo"),
      true,
    );
  });

  it("rejects Cannes (wrong side / not beyond Monaco from Nice)", () => {
    assert.equal(matchesCorridorAllowlist(niceMonaco, "Cannes"), false);
  });

  it("accepts Cannes when filtre Nice depuis Monaco (Ouest)", () => {
    assert.equal(matchesCorridorAllowlist(monacoNice, "Cannes"), true);
  });

  it("rejects Menton when filtre Nice depuis Monaco", () => {
    assert.equal(matchesCorridorAllowlist(monacoNice, "Menton"), false);
  });
});
