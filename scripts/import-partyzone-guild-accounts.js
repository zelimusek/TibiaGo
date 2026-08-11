#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");

const ROOT = path.resolve(__dirname, "..");
const PORTAL_DB = process.env.PARTYZONE_PORTAL_DB
  || "/home/zelek/domains/zelek.usermd.net/public_nodejs/data/db.json";
const SPAWN = { x: 32516, y: 32394, z: 7 };
const EXECUTE = process.argv.includes("--execute");
const CONFIRMED = process.argv.includes("--confirm-partyzone");

require(path.join(ROOT, "require"));

const CharacterCreator = requireModule("auth/character-creator");
const Skill = requireModule("utils/skill");

const ROSTER = [
  { name: "Narkotyczny Maniak", vocation: CONST.VOCATION.MASTER_SORCERER, main: "magic" },
  { name: "Scrappy", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "sword" },
  { name: "Dj Tiesto", vocation: CONST.VOCATION.MASTER_SORCERER, main: "magic" },
  { name: "Arnej", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "sword" },
  { name: "Dekart", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "sword" },
  { name: "Last Raven", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "axe" },
  { name: "Knight Kamil", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "sword" },
  { name: "Macius The Clown", vocation: CONST.VOCATION.MASTER_SORCERER, main: "magic" },
  { name: "Grappler", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "axe" },
  { name: "Neked", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "auto" },
];

const SKILL_TYPES = {
  magic: CONST.PROPERTIES.MAGIC,
  fist: CONST.PROPERTIES.FIST,
  club: CONST.PROPERTIES.CLUB,
  sword: CONST.PROPERTIES.SWORD,
  axe: CONST.PROPERTIES.AXE,
  distance: CONST.PROPERTIES.DISTANCE,
  shielding: CONST.PROPERTIES.SHIELDING,
  fishing: CONST.PROPERTIES.FISHING,
};

const ITEMS = {
  BACKPACK: 1988,
  MAGIC_SWORD: 2400,
  FIRE_SWORD: 2392,
  STONECUTTER_AXE: 2431,
  MASTERMIND_SHIELD: 2514,
  DEMON_SHIELD: 2520,
  DEMON_HELMET: 2493,
  MAGIC_PLATE_ARMOR: 2472,
  DEMON_ARMOR: 2494,
  GOLDEN_LEGS: 2470,
  DEMON_LEGS: 2495,
  STEEL_BOOTS: 2645,
};

function normalized(value) {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}

async function fetchJson(endpoint, params) {
  const url = new URL(endpoint);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Minibia API ${response.status} for ${url.pathname}`);
  }
  return response.json();
}

async function fetchCharacters() {
  const result = new Map();
  for (const entry of ROSTER) {
    const character = await fetchJson("https://minibia.com/api/character", { name: entry.name });
    if (normalized(character.name) !== normalized(entry.name)) {
      throw new Error(`Character mismatch for ${entry.name}`);
    }
    if (Number(character.vocation) !== entry.vocation || character.sex !== "Male") {
      throw new Error(`Unexpected vocation or sex for ${entry.name}`);
    }
    result.set(normalized(entry.name), character);
  }
  return result;
}

async function fetchHighscore(type, wantedNames) {
  const found = new Map();
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && found.size < wantedNames.size) {
    const payload = await fetchJson("https://minibia.com/api/highscores", {
      page,
      limit: 50,
      vocation: "all",
      type,
      world: "main",
    });
    totalPages = Math.max(1, Number(payload.totalPages) || 1);
    for (const row of payload.characters || []) {
      const key = normalized(row.name);
      if (wantedNames.has(key)) {
        found.set(key, Number(row.skillLevel));
      }
    }
    page += 1;
  }
  const missing = [...wantedNames].filter(name => !found.has(name));
  if (missing.length) {
    throw new Error(`Missing ${type} highscores: ${missing.join(", ")}`);
  }
  return found;
}

function readPortalAccounts() {
  const portal = JSON.parse(fs.readFileSync(PORTAL_DB, "utf8"));
  const byCharacter = new Map(
    (portal.users || []).map(user => [normalized(user.charName), user])
  );
  const result = new Map();
  for (const entry of ROSTER) {
    const key = normalized(entry.name);
    const user = byCharacter.get(key);
    if (!user || !user.isVerified || typeof user.username !== "string"
      || !/^scrypt\$/.test(String(user.password || ""))) {
      throw new Error(`Verified portal account with scrypt password missing for ${entry.name}`);
    }
    result.set(key, user);
  }
  return result;
}

function pointsForLevel(type, level, vocation) {
  // Persist whole counters above the exact floating-point threshold so the
  // imported character always displays the requested level.
  const points = Math.ceil(new Skill(type, 0).getRequiredSkillPoints(level, vocation));
  if (!Number.isFinite(points) || points < 0) {
    throw new Error(`Could not calculate skill ${type} level ${level} for vocation ${vocation}`);
  }
  return points;
}

function equipmentFor(entry) {
  const isKnight = entry.vocation === CONST.VOCATION.ELITE_KNIGHT;
  const weapon = isKnight
    ? entry.main === "axe" ? ITEMS.STONECUTTER_AXE : ITEMS.MAGIC_SWORD
    : ITEMS.FIRE_SWORD;
  const shield = isKnight ? ITEMS.MASTERMIND_SHIELD : ITEMS.DEMON_SHIELD;
  const equipment = [
    { slot: CONST.EQUIPMENT.HELMET, item: { id: ITEMS.DEMON_HELMET } },
    { slot: CONST.EQUIPMENT.ARMOR, item: { id: isKnight ? ITEMS.MAGIC_PLATE_ARMOR : ITEMS.DEMON_ARMOR } },
    { slot: CONST.EQUIPMENT.LEGS, item: { id: isKnight ? ITEMS.GOLDEN_LEGS : ITEMS.DEMON_LEGS } },
    { slot: CONST.EQUIPMENT.RIGHT, item: { id: weapon } },
    { slot: CONST.EQUIPMENT.LEFT, item: { id: shield } },
    { slot: CONST.EQUIPMENT.BACKPACK, item: { id: ITEMS.BACKPACK } },
  ];
  if (isKnight) {
    equipment.push({ slot: CONST.EQUIPMENT.BOOTS, item: { id: ITEMS.STEEL_BOOTS } });
  }
  return equipment;
}

function resolveMainWeapon(entry, swordLevel, axeLevel) {
  if (entry.main !== "auto") {
    return entry;
  }
  if (!Number.isFinite(swordLevel) || !Number.isFinite(axeLevel)) {
    throw new Error(`Could not compare sword and axe skills for ${entry.name}`);
  }
  return { ...entry, main: axeLevel > swordLevel ? "axe" : "sword" };
}

function buildCharacter(entry, source, skillLevels) {
  const creator = new CharacterCreator();
  const character = JSON.parse(creator.create(source.name, "male", { discoMode: true }));
  const isKnight = entry.vocation === CONST.VOCATION.ELITE_KNIGHT;
  const health = isKnight ? 5 * (3 * source.level + 13) : 5 * (source.level + 29);
  const mana = isKnight ? 5 * (source.level + 10) : 5 * (6 * source.level - 30);
  const capacity = isKnight ? 5 * (5 * source.level + 54) : 10 * (source.level + 39);

  character.position = { ...SPAWN };
  character.templePosition = { ...SPAWN };
  character.properties.vocation = entry.vocation;
  character.properties.role = CONST.ROLES.NONE;
  character.properties.sex = CONST.SEX.MALE;
  character.properties.outfit.id = isKnight
    ? CONST.LOOKTYPES.MALE.KNIGHT
    : CONST.LOOKTYPES.MALE.MAGE;
  character.properties.health = health;
  character.properties.healthMax = health;
  character.properties.mana = mana;
  character.properties.manaMax = mana;
  character.properties.capacity = capacity;
  character.properties.capacityMax = capacity;
  character.properties.maxCapacity = capacity;
  character.properties.speed = 109 + source.level;

  const desired = {
    magic: isKnight ? 9 : skillLevels.magic,
    fist: 15,
    club: 15,
    sword: isKnight && entry.main === "sword" ? skillLevels.main : 15,
    axe: isKnight && entry.main === "axe" ? skillLevels.main : 15,
    distance: 15,
    shielding: isKnight ? skillLevels.shielding : 15,
    fishing: 15,
  };
  for (const [skill, level] of Object.entries(desired)) {
    character.skills[skill] = pointsForLevel(SKILL_TYPES[skill], level, entry.vocation);
  }
  character.skills.experience = Number(source.experience);
  character.skills.level = Number(source.level);
  character.containers.equipment = equipmentFor(entry);
  character.storage = {};
  character.friends = [];
  character.lastVisit = Date.now();
  return { character, desired, health, mana, capacity };
}

async function prepareRows() {
  const characters = await fetchCharacters();
  const portalAccounts = readPortalAccounts();
  const knights = new Set(
    ROSTER.filter(entry => entry.vocation === CONST.VOCATION.ELITE_KNIGHT)
      .map(entry => normalized(entry.name))
  );
  const mages = new Set(
    ROSTER.filter(entry => entry.vocation === CONST.VOCATION.MASTER_SORCERER)
      .map(entry => normalized(entry.name))
  );
  const swordUsers = new Set(
    ROSTER.filter(entry => entry.main === "sword" || entry.main === "auto")
      .map(entry => normalized(entry.name))
  );
  const axeUsers = new Set(
    ROSTER.filter(entry => entry.main === "axe" || entry.main === "auto")
      .map(entry => normalized(entry.name))
  );
  const [sword, axe, shielding, magic] = await Promise.all([
    fetchHighscore("sword", swordUsers),
    fetchHighscore("axe", axeUsers),
    fetchHighscore("shielding", knights),
    fetchHighscore("magic", mages),
  ]);

  return ROSTER.map(rosterEntry => {
    const key = normalized(rosterEntry.name);
    const entry = resolveMainWeapon(rosterEntry, sword.get(key), axe.get(key));
    const source = characters.get(key);
    const portal = portalAccounts.get(key);
    const skillLevels = {
      main: entry.main === "sword" ? sword.get(key) : entry.main === "axe" ? axe.get(key) : null,
      shielding: shielding.get(key),
      magic: magic.get(key),
    };
    const built = buildCharacter(entry, source, skillLevels);
    return {
      account: normalized(portal.username),
      hash: portal.password,
      name: source.name,
      character: built.character,
      summary: {
        name: source.name,
        account: normalized(portal.username),
        vocation: source.vocationName,
        main: entry.main,
        level: source.level,
        experience: source.experience,
        skills: built.desired,
        health: built.health,
        mana: built.mana,
        capacity: built.capacity,
        speed: 109 + source.level,
      },
    };
  });
}

async function main() {
  if (EXECUTE && (!CONFIRMED || process.env.INSTANCE_NAME !== "partyzone")) {
    throw new Error("Execution requires --confirm-partyzone and INSTANCE_NAME=partyzone");
  }

  const rows = await prepareRows();
  console.log(JSON.stringify(rows.map(row => row.summary), null, 2));
  if (!EXECUTE) {
    console.log("DRY_RUN_OK: no database changes made");
    return;
  }

  const database = new PGlite(path.join(ROOT, "data", "pgdata"));
  try {
    await database.exec('ALTER TABLE "accounts" ALTER COLUMN "hash" TYPE text');
    const existing = await database.query('SELECT account, name FROM accounts');
    const existingAccounts = new Set(existing.rows.map(row => normalized(row.account)));
    const existingNames = new Set(existing.rows.map(row => normalized(row.name)));
    const conflicts = rows.filter(row =>
      existingAccounts.has(row.account) || existingNames.has(normalized(row.name))
    );
    const rowsToInsert = rows.filter(row => !conflicts.includes(row));

    for (const row of conflicts) {
      console.log(`SKIPPED_CONFLICT: ${row.account}/${row.name}`);
    }

    await database.transaction(async transaction => {
      for (const row of rowsToInsert) {
        await transaction.query(
          'INSERT INTO accounts (account, hash, name, character) VALUES ($1, $2, $3, $4)',
          [row.account, row.hash, row.name, JSON.stringify(row.character)]
        );
      }
    });
    const imported = await database.query('SELECT account, name, character FROM accounts');
    for (const expected of rowsToInsert) {
      const actual = imported.rows.find(row =>
        normalized(row.account) === expected.account
        && normalized(row.name) === normalized(expected.name)
      );
      if (!actual) {
        throw new Error(`Post-import verification failed for ${expected.name}`);
      }
      const character = JSON.parse(actual.character);
      if (character.skills.level !== expected.character.skills.level
        || character.properties.vocation !== expected.character.properties.vocation
        || character.position.x !== SPAWN.x || character.position.y !== SPAWN.y
        || character.position.z !== SPAWN.z) {
        throw new Error(`Post-import character mismatch for ${expected.name}`);
      }
    }
    console.log(`IMPORT_OK: created ${rowsToInsert.length}, skipped ${conflicts.length} PartyZone accounts`);
    console.log(`VERIFY_OK: checked ${rowsToInsert.length} newly created characters`);
  } finally {
    await database.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`IMPORT_FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ITEMS,
  ROSTER,
  SPAWN,
  buildCharacter,
  equipmentFor,
  pointsForLevel,
  resolveMainWeapon,
};
