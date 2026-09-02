import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { databaseIsLocal, productionModeWarning } from "./runtime-mode.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalDbUrl = process.env.DATABASE_URL;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.DATABASE_URL = originalDbUrl;
});

describe("runtime-mode", () => {
  it("recognises local databases", () => {
    assert.equal(databaseIsLocal("postgres://u:p@127.0.0.1:5432/db"), true);
    assert.equal(databaseIsLocal("postgres://u:p@localhost:5432/db"), true);
    assert.equal(databaseIsLocal("postgres://u:p@db:5432/db"), true);
    assert.equal(databaseIsLocal("postgres://u:p@10.1.2.3:5432/db"), false);
    // URL illisible : ne pas alarmer à tort
    assert.equal(databaseIsLocal("pas-une-url"), true);
    assert.equal(databaseIsLocal(undefined), true);
  });

  it("stays silent in development and in declared production", () => {
    process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/db";
    delete process.env.NODE_ENV;
    assert.equal(productionModeWarning(), null);

    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgres://u:p@10.1.2.3:5432/db";
    assert.equal(productionModeWarning(), null);
  });

  it("warns on a remote database without NODE_ENV=production", () => {
    delete process.env.NODE_ENV;
    process.env.DATABASE_URL = "postgres://u:p@10.1.2.3:5432/db";
    const warning = productionModeWarning();
    assert.ok(warning);
    assert.match(warning, /NODE_ENV/);
  });
});
