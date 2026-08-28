#!/usr/bin/env node
"use strict";

// Run from PartyZone with dotenv loaded. Plan while online, then apply during
// maintenance, after graceful shutdown saved all characters. No portal secrets
// are needed and no account, inventory or party-progress fields are replaced.
const fs = require("fs");
const path = require("path");
const net = require("net");
const assert = require("assert/strict");
const { ROSTER, buildCharacter, prepareRows, openAccountStore } =
  require("./import-partyzone-guild-accounts");
const Skill = requireModule("utils/skill");
const ROOT = path.resolve(__dirname, "..");
const normalize = name => String(name).trim().toLowerCase();
const SKILLS = ["magic", "fist", "club", "sword", "axe", "distance", "shielding", "fishing"];

function validateSource(row) {
  // Reject incomplete/mismatched API snapshots rather than resetting a skill.
  const entry = ROSTER.find(candidate => normalize(candidate.name) === normalize(row.name));
  if (!entry || row.vocation !== entry.vocation
    || !Number.isInteger(row.level) || row.level < 8 || row.level > 999
    || !Number.isSafeInteger(row.experience) || row.experience < 0
    || new Skill(CONST.PROPERTIES.EXPERIENCE, row.experience).getSkillLevel() !== row.level
    || !["sword", "axe", "club", "magic"].includes(row.main)
    || (entry.main !== "auto" && row.main !== entry.main)) {
    throw new Error(`Invalid source character: ${row.name}`);
  }
  for (const skill of SKILLS) {
    if (!Number.isInteger(row.skills?.[skill]) || row.skills[skill] < (skill === "magic" ? 0 : 10)
      || row.skills[skill] > 200) throw new Error(`Invalid ${skill} for ${row.name}`);
  }
  const built = buildCharacter({ ...entry, main: row.main }, row, {
    main: row.skills[row.main], magic: row.skills.magic, shielding: row.skills.shielding,
  });
  assert.deepEqual(built.desired, row.skills);
  for (const skill of SKILLS) {
    const type = CONST.PROPERTIES[skill.toUpperCase()];
    if (!Number.isSafeInteger(built.character.skills[skill])
      || new Skill(type, built.character.skills[skill]).getSkillLevel(entry.vocation) !== row.skills[skill]) {
      throw new Error(`Skill does not round-trip: ${row.name}/${skill}`);
    }
  }
  return built;
}

function mergeStats(current, source) {
  // Deliberately whitelist changes; keep every other (including future) field.
  const built = validateSource(source);
  if (normalize(current.properties?.name) !== normalize(source.name)
    || current.properties.vocation !== source.vocation || !current.skills) {
    throw new Error(`Existing character identity mismatch: ${source.name}`);
  }
  const next = JSON.parse(JSON.stringify(current));
  Object.assign(next.skills, built.character.skills);
  const oldLevel = new Skill(CONST.PROPERTIES.EXPERIENCE, current.skills.experience).getSkillLevel();
  const knight = source.vocation === CONST.VOCATION.ELITE_KNIGHT;
  const oldHealth = knight ? 5 * (3 * oldLevel + 13) : 5 * (oldLevel + 29);
  const oldMana = knight ? 5 * (oldLevel + 10) : 5 * (6 * oldLevel - 30);
  // Preserve the filled percentage, including zero HP for a pending respawn.
  for (const [field, oldMax, newMax] of [
    ["health", oldHealth, built.health], ["mana", oldMana, built.mana],
  ]) {
    const value = current.properties[field];
    if (!Number.isFinite(value) || oldMax <= 0) throw new Error(`Invalid ${field}: ${source.name}`);
    next.properties[field] = Math.round(newMax * Math.max(0, Math.min(1, value / oldMax)));
  }
  Object.assign(next.properties, {
    healthMax: built.health, manaMax: built.mana,
    capacityMax: built.capacity, maxCapacity: built.capacity, speed: 109 + source.level,
  });
  // Legacy aliases may exist before the first login. Capacity's free amount is
  // recalculated from retained inventory by Player.__updateCurrentCapacity.
  if (Object.hasOwn(next.properties, "maxHealth")) next.properties.maxHealth = built.health;
  if (Object.hasOwn(next.properties, "maxMana")) next.properties.maxMana = built.mana;
  return next;
}

function summarize(current, source) {
  const before = {};
  for (const skill of SKILLS) {
    before[skill] = new Skill(CONST.PROPERTIES[skill.toUpperCase()], current.skills[skill])
      .getSkillLevel(current.properties.vocation);
  }
  const built = validateSource(source);
  return { name: source.name, levelBefore: new Skill(CONST.PROPERTIES.EXPERIENCE,
    current.skills.experience).getSkillLevel(), levelAfter: source.level,
  main: source.main, skillsBefore: before, skillsAfter: source.skills,
  healthMax: built.health, manaMax: built.mana, capacityMax: built.capacity, speed: 109 + source.level };
}

async function requireMaintenance() {
  if (!fs.existsSync(path.join(ROOT, ".deploying"))) throw new Error("Maintenance marker required");
  // A live server could overwrite offline DB changes with its in-memory save.
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: Number(process.env.PORT || 2530) });
    socket.setTimeout(2000);
    socket.once("connect", () => { socket.destroy(); reject(new Error("Stop PartyZone before applying")); });
    socket.once("timeout", () => { socket.destroy(); reject(new Error("Cannot verify server stopped")); });
    socket.once("error", error => error.code === "ECONNREFUSED" ? resolve() : reject(error));
  });
}

async function main() {
  const [mode, filename, confirmation] = process.argv.slice(2);
  if (!["--plan", "--apply"].includes(mode) || !filename
    || (mode === "--apply" && confirmation !== "--confirm-partyzone")) {
    throw new Error("Usage: --plan snapshot.json | --apply snapshot.json --confirm-partyzone");
  }
  if (process.env.INSTANCE_NAME !== "partyzone" || process.env.USE_EMBEDDED_DB !== "false"
    || !process.env.DATABASE_URL) throw new Error("Explicit PartyZone PostgreSQL environment required");
  const database = await openAccountStore();
  try {
    const identity = await database.query("SELECT current_database() AS name");
    if (identity.rows[0].name !== "p1023_partyzone") throw new Error("Unexpected database; refusing update");
    if (mode === "--plan") {
      const fetched = await prepareRows({ includeAccounts: false });
      const rows = [];
      for (const row of fetched) {
        const source = { name: row.name, vocation: row.character.properties.vocation,
          level: Number(row.summary.level), experience: Number(row.summary.experience),
          main: row.summary.main, skills: row.summary.skills };
        const result = await database.query("SELECT id, character FROM accounts WHERE lower(name) = $1",
          [normalize(row.name)]);
        if (result.rows.length !== 1) throw new Error(`Expected exactly one account: ${row.name}`);
        const current = JSON.parse(result.rows[0].character);
        mergeStats(current, source);
        rows.push({ id: result.rows[0].id, ...source });
        console.log(JSON.stringify(summarize(current, source)));
      }
      fs.writeFileSync(filename, JSON.stringify({ instance: "partyzone", createdAt: Date.now(), rows }, null, 2),
        { flag: "wx", mode: 0o600 });
      console.log(`PLAN_OK: ${rows.length} characters; no database changes`);
      return;
    }
    const snapshot = JSON.parse(fs.readFileSync(filename, "utf8"));
    const age = Date.now() - snapshot.createdAt;
    if (snapshot.instance !== "partyzone" || !Number.isFinite(age) || age < 0 || age > 3600000
      || snapshot.rows?.length !== ROSTER.length
      || new Set(snapshot.rows.map(row => normalize(row.name))).size !== ROSTER.length
      || new Set(snapshot.rows.map(row => row.id)).size !== ROSTER.length) {
      throw new Error("Incomplete, duplicate or expired snapshot; create a fresh plan");
    }
    snapshot.rows.forEach(validateSource);
    await requireMaintenance();
    await database.transaction(async transaction => {
      const updates = [];
      for (const source of snapshot.rows) {
        const result = await transaction.query(
          "SELECT id, name, character FROM accounts WHERE id = $1 AND lower(name) = $2 FOR UPDATE",
          [source.id, normalize(source.name)]);
        if (result.rows.length !== 1) throw new Error(`Account changed: ${source.name}`);
        const existing = result.rows[0];
        const current = JSON.parse(existing.character);
        updates.push({ existing, next: JSON.stringify(mergeStats(current, source)), source });
      }
      // Exclusive, private backup of the latest saved characters, before ANY write.
      fs.writeFileSync(`${filename}.before.json`, JSON.stringify(updates.map(update => update.existing), null, 2),
        { flag: "wx", mode: 0o600 });
      for (const { existing, next, source } of updates) {
        const result = await transaction.query(
          "UPDATE accounts SET character = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING character",
          [next, existing.id]);
        assert.equal(result.rows.length, 1);
        assert.equal(result.rows[0].character, next);
        console.log(JSON.stringify(summarize(JSON.parse(existing.character), source)));
      }
    });
    console.log(`UPDATE_OK: ${snapshot.rows.length} characters; inventory, account and party progress preserved`);
  } finally {
    await database.close();
  }
}

if (require.main === module) main().catch(error => {
  console.error(`UPDATE_FAILED: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { mergeStats, validateSource, summarize, requireMaintenance };
