import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedCorsOrigin, parseCorsOrigins } from "./cors-origin.js";

describe("cors-origin", () => {
  it("parses comma-separated origins", () => {
    assert.deepEqual(parseCorsOrigins(" https://a.example ,https://b.example "), [
      "https://a.example",
      "https://b.example",
    ]);
    assert.deepEqual(parseCorsOrigins(""), []);
  });

  it("allows requests with no Origin (curl / same-origin proxy)", () => {
    assert.equal(isAllowedCorsOrigin(undefined, []), true);
  });

  it("denies unknown browser origins when allowlist is empty", () => {
    assert.equal(isAllowedCorsOrigin("https://evil.example", []), false);
  });

  it("allows only listed origins", () => {
    const list = ["https://ops.example"];
    assert.equal(isAllowedCorsOrigin("https://ops.example", list), true);
    assert.equal(isAllowedCorsOrigin("https://evil.example", list), false);
  });
});
