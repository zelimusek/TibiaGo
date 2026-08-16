#!/usr/bin/env node
"use strict";

const path = require("path");
const { PGlite } = require("@electric-sql/pglite");
const { Pool } = require("pg");

const SOURCE = process.env.PGLITE_SOURCE_DIR;
const DATABASE_URL = process.env.DATABASE_URL;
const CONFIRMED = process.argv.includes("--confirm-empty-target");

const CREATE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS "accounts" (
    "id" serial PRIMARY KEY NOT NULL,
    "account" varchar(32) NOT NULL,
    "hash" text NOT NULL,
    "name" varchar(32) NOT NULL,
    "character" text NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "account_name_unique"
    ON "accounts" ("account", "name");
  CREATE TABLE IF NOT EXISTS "pvp_relations" (
    "id" serial PRIMARY KEY NOT NULL,
    "attacker_id" integer NOT NULL,
    "target_id" integer NOT NULL,
    "aggression_expires_at" timestamp NOT NULL,
    "retaliation_expires_at" timestamp NOT NULL,
    "justified_at_start" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "pvp_relations_attacker_target_unique"
    ON "pvp_relations" ("attacker_id", "target_id");
  CREATE INDEX IF NOT EXISTS "pvp_relations_attacker_expiry_idx"
    ON "pvp_relations" ("attacker_id", "retaliation_expires_at");
  CREATE INDEX IF NOT EXISTS "pvp_relations_target_expiry_idx"
    ON "pvp_relations" ("target_id", "retaliation_expires_at");
  CREATE TABLE IF NOT EXISTS "pvp_frags" (
    "id" serial PRIMARY KEY NOT NULL,
    "event_id" varchar(96) NOT NULL,
    "killer_id" integer NOT NULL,
    "victim_id" integer NOT NULL,
    "killed_at" timestamp NOT NULL,
    "justified" boolean NOT NULL,
    "participants" text NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "pvp_frags_event_unique"
    ON "pvp_frags" ("event_id");
  CREATE INDEX IF NOT EXISTS "pvp_frags_killer_time_idx"
    ON "pvp_frags" ("killer_id", "killed_at");
  CREATE TABLE IF NOT EXISTS "pvp_penalties" (
    "player_id" integer PRIMARY KEY NOT NULL,
    "white_until" timestamp NOT NULL,
    "red_until" timestamp NOT NULL,
    "black_until" timestamp NOT NULL,
    "pz_lock_until" timestamp NOT NULL,
    "updated_at" timestamp DEFAULT now()
  );
`;

const TABLES = [
  {
    name: "accounts",
    columns: ["id", "account", "hash", "name", "character", "created_at", "updated_at"],
    serial: "id",
  },
  {
    name: "pvp_relations",
    columns: ["id", "attacker_id", "target_id", "aggression_expires_at", "retaliation_expires_at", "justified_at_start", "updated_at"],
    serial: "id",
  },
  {
    name: "pvp_frags",
    columns: ["id", "event_id", "killer_id", "victim_id", "killed_at", "justified", "participants"],
    serial: "id",
  },
  {
    name: "pvp_penalties",
    columns: ["player_id", "white_until", "red_until", "black_until", "pz_lock_until", "updated_at"],
  },
];

async function sourceTableExists(source, table) {
  const result = await source.query("select to_regclass($1) as relation", [`public.${table}`]);
  return result.rows[0] && result.rows[0].relation !== null;
}

async function copyTable(source, target, definition) {
  if (!await sourceTableExists(source, definition.name)) {
    return 0;
  }

  const quotedColumns = definition.columns.map(column => `"${column}"`).join(", ");
  const sourceRows = await source.query(
    `select ${quotedColumns} from "${definition.name}" order by 1`
  );

  for (const row of sourceRows.rows) {
    const values = definition.columns.map(column => row[column]);
    const placeholders = values.map((value, index) => `$${index + 1}`).join(", ");
    await target.query(
      `insert into "${definition.name}" (${quotedColumns}) values (${placeholders})`,
      values
    );
  }

  if (definition.serial) {
    await target.query(
      `select setval(
        pg_get_serial_sequence($1, $2),
        coalesce(max("${definition.serial}"), 1),
        max("${definition.serial}") is not null
      ) from "${definition.name}"`,
      [definition.name, definition.serial]
    );
  }

  return sourceRows.rows.length;
}

async function main() {
  if (!SOURCE || !DATABASE_URL || !CONFIRMED) {
    throw new Error(
      "Set PGLITE_SOURCE_DIR and DATABASE_URL, then pass --confirm-empty-target"
    );
  }

  const source = new PGlite(path.resolve(SOURCE));
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  const target = await pool.connect();
  const copied = {};

  try {
    await source.query("select count(*) from accounts");
    await target.query("begin");
    await target.query(CREATE_SCHEMA_SQL);

    const existing = await target.query("select count(*)::int as count from accounts");
    if (existing.rows[0].count !== 0) {
      throw new Error(`Target accounts table is not empty (${existing.rows[0].count})`);
    }

    for (const definition of TABLES) {
      copied[definition.name] = await copyTable(source, target, definition);
    }

    if (copied.accounts < 1) {
      throw new Error("Source contains no accounts");
    }

    const verified = await target.query("select count(*)::int as count from accounts");
    if (verified.rows[0].count !== copied.accounts) {
      throw new Error(
        `Account verification failed: copied=${copied.accounts}, target=${verified.rows[0].count}`
      );
    }

    await target.query("commit");
    console.log(JSON.stringify({ migrated: copied, verifiedAccounts: verified.rows[0].count }));
    console.log("PGLITE_TO_POSTGRES_MIGRATION_OK");
  } catch (error) {
    await target.query("rollback").catch(() => {});
    throw error;
  } finally {
    target.release();
    await pool.end();
    await source.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`PGLITE_TO_POSTGRES_MIGRATION_FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  CREATE_SCHEMA_SQL,
  TABLES,
  copyTable,
  sourceTableExists,
};
