#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  CREATE_SCHEMA_SQL,
  TABLES,
  copyTable,
  sourceTableExists,
} = require("../scripts/migrate-pglite-to-postgres");

(async () => {
  assert.match(CREATE_SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS "accounts"/);
  assert.deepStrictEqual(TABLES.map(table => table.name), [
    "accounts",
    "pvp_relations",
    "pvp_frags",
    "pvp_penalties",
  ]);

  const source = {
    async query(sql, values) {
      if (/to_regclass/.test(sql)) {
        return { rows: [{ relation: values[0] === "public.accounts" ? "accounts" : null }] };
      }
      assert.match(sql, /from "accounts" order by 1/);
      return {
        rows: [{
          id: 7,
          account: "party",
          hash: "hash",
          name: "Party Player",
          character: "{}",
          created_at: new Date("2026-08-10T00:00:00Z"),
          updated_at: new Date("2026-08-11T00:00:00Z"),
        }],
      };
    },
  };
  const targetQueries = [];
  const target = {
    async query(sql, values) {
      targetQueries.push({ sql, values });
      return { rows: [] };
    },
  };

  assert.strictEqual(await sourceTableExists(source, "accounts"), true);
  assert.strictEqual(await sourceTableExists(source, "pvp_frags"), false);

  const copied = await copyTable(source, target, TABLES[0]);
  assert.strictEqual(copied, 1);
  assert.strictEqual(targetQueries.length, 2);
  assert.match(targetQueries[0].sql, /insert into "accounts"/);
  assert.deepStrictEqual(targetQueries[0].values.slice(0, 5), [
    7,
    "party",
    "hash",
    "Party Player",
    "{}",
  ]);
  assert.match(targetQueries[1].sql, /setval/);
  assert.deepStrictEqual(targetQueries[1].values, ["accounts", "id"]);

  console.log("PGlite to PostgreSQL migration tests passed.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
