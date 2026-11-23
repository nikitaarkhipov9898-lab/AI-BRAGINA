import test from "node:test";
import assert from "node:assert/strict";
import worker from "../index.js";

test("OPTIONS preflight skips database initialization and allows Capacitor", async () => {
  let databaseCalls = 0;
  const env = {
    DB: {
      prepare() {
        databaseCalls += 1;
        throw new Error("Preflight must not touch D1");
      },
    },
  };
  const response = await worker.fetch(new Request("https://preview.example/auth/login", {
    method: "OPTIONS",
    headers: { Origin: "capacitor://localhost" },
  }), env);

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "capacitor://localhost");
  assert.equal(databaseCalls, 0);
});

test("CORS origin is applied consistently to API responses", async () => {
  const env = {
    DB: {
      prepare() {
        return {
          first: async () => ({ ok: 1 }),
        };
      },
    },
  };
  const response = await worker.fetch(new Request("https://preview.example/health", {
    headers: { Origin: "capacitor://localhost" },
  }), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "capacitor://localhost");
  assert.deepEqual(await response.json(), { worker: "ok", database: "connected" });
});

test("D1 schemas initialize once per binding and are shared by concurrent requests", async () => {
  const statements = [];
  const DB = {
    prepare(sql) {
      statements.push(sql);
      return {
        bind() { return this; },
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
        first: async () => sql.includes("COUNT(*) AS total") ? { total: 1 } : null,
      };
    },
  };
  const env = { DB };
  const request = () => worker.fetch(new Request("https://preview.example/auth/setup-status"), env);

  const responses = await Promise.all([request(), request(), request()]);
  for (const response of responses) assert.equal(response.status, 200);
  const initializationStatements = statements.filter((sql) =>
    /CREATE TABLE IF NOT EXISTS|CREATE UNIQUE INDEX IF NOT EXISTS|ALTER TABLE/.test(sql)
  );
  assert.ok(initializationStatements.length > 0);

  const before = initializationStatements.length;
  await request();
  const after = statements.filter((sql) =>
    /CREATE TABLE IF NOT EXISTS|CREATE UNIQUE INDEX IF NOT EXISTS|ALTER TABLE/.test(sql)
  ).length;
  assert.equal(after, before);
});
