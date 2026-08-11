"use strict";

const assert = require("assert");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PGlite } = require("@electric-sql/pglite");

require("../require");

const Skill = requireModule("utils/skill");
const { parseScryptHash, verifyPassword } = requireModule("auth/password-verifier");
const {
  ITEMS,
  ROSTER,
  SPAWN,
  buildCharacter,
  resolveMainWeapon,
} = require("../scripts/import-partyzone-guild-accounts");

async function main() {
  const migrationDirectory = path.resolve(__dirname, "../.agent/pglite-hash-migration-test");
  fs.rmSync(migrationDirectory, { recursive: true, force: true });
  const migrationDatabase = new PGlite(migrationDirectory);
  try {
    await migrationDatabase.exec(
      'CREATE TABLE accounts (hash varchar(60) NOT NULL);'
      + 'ALTER TABLE accounts ALTER COLUMN hash TYPE text;'
    );
    const migrated = await migrationDatabase.query(
      "SELECT data_type FROM information_schema.columns "
      + "WHERE table_name = 'accounts' AND column_name = 'hash'"
    );
    assert.strictEqual(migrated.rows[0].data_type, "text");
  } finally {
    await migrationDatabase.close();
    fs.rmSync(migrationDirectory, { recursive: true, force: true });
  }

  const salt = "partyzone-test-salt";
  const params = { N: 16384, r: 8, p: 1 };
  const expected = crypto.scryptSync("correct horse", salt, 32, params).toString("base64url");
  const hash = `scrypt$${params.N}$${params.r}$${params.p}$${salt}$${expected}`;

  assert.ok(parseScryptHash(hash));
  assert.strictEqual(await verifyPassword("correct horse", hash), true);
  assert.strictEqual(await verifyPassword("wrong", hash), false);
  assert.strictEqual(parseScryptHash("scrypt$3$8$1$salt$bad"), null);

  const bcryptHash = await bcrypt.hash("legacy password", 4);
  assert.strictEqual(await verifyPassword("legacy password", bcryptHash), true);
  assert.strictEqual(await verifyPassword("wrong", bcryptHash), false);

  for (const [promoted, base, type] of [
    [CONST.VOCATION.ELITE_KNIGHT, CONST.VOCATION.KNIGHT, CONST.PROPERTIES.SWORD],
    [CONST.VOCATION.ROYAL_PALADIN, CONST.VOCATION.PALADIN, CONST.PROPERTIES.DISTANCE],
    [CONST.VOCATION.MASTER_SORCERER, CONST.VOCATION.SORCERER, CONST.PROPERTIES.MAGIC],
    [CONST.VOCATION.ELDER_DRUID, CONST.VOCATION.DRUID, CONST.PROPERTIES.MAGIC],
  ]) {
    const skill = new Skill(type, 0);
    const promotedPoints = skill.getRequiredSkillPoints(85, promoted);
    const basePoints = skill.getRequiredSkillPoints(85, base);
    assert.ok(Number.isFinite(promotedPoints));
    assert.strictEqual(promotedPoints, basePoints);
    assert.strictEqual(new Skill(type, promotedPoints).getSkillLevel(promoted), 85);
  }

  const knight = buildCharacter(
    { name: "Scrappy", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "sword" },
    { name: "Scrappy", level: 132, experience: 36941855 },
    { main: 97, shielding: 92, magic: null }
  );
  assert.deepStrictEqual(knight.character.position, SPAWN);
  assert.deepStrictEqual(knight.character.templePosition, SPAWN);
  assert.strictEqual(knight.character.properties.outfit.id, CONST.LOOKTYPES.MALE.KNIGHT);
  assert.strictEqual(knight.character.properties.health, 2045);
  assert.strictEqual(knight.character.properties.mana, 710);
  assert.strictEqual(knight.character.properties.capacityMax, 3570);
  assert.strictEqual(knight.character.properties.speed, 241);
  assert.strictEqual(
    new Skill(CONST.PROPERTIES.SWORD, knight.character.skills.sword)
      .getSkillLevel(CONST.VOCATION.ELITE_KNIGHT),
    97
  );
  assert.strictEqual(
    new Skill(CONST.PROPERTIES.SHIELDING, knight.character.skills.shielding)
      .getSkillLevel(CONST.VOCATION.ELITE_KNIGHT),
    92
  );
  assert.ok(knight.character.containers.equipment.some(entry =>
    entry.slot === CONST.EQUIPMENT.RIGHT && entry.item.id === ITEMS.MAGIC_SWORD
  ));
  assert.ok(knight.character.containers.equipment.some(entry =>
    entry.slot === CONST.EQUIPMENT.BOOTS && entry.item.id === ITEMS.STEEL_BOOTS
  ));

  const mage = buildCharacter(
    { name: "Narkotyczny Maniak", vocation: CONST.VOCATION.MASTER_SORCERER, main: "magic" },
    { name: "Narkotyczny Maniak", level: 117, experience: 25729532 },
    { main: null, shielding: null, magic: 92 }
  );
  assert.strictEqual(mage.character.properties.outfit.id, CONST.LOOKTYPES.MALE.MAGE);
  assert.strictEqual(mage.character.properties.health, 730);
  assert.strictEqual(mage.character.properties.mana, 3360);
  assert.ok(mage.character.containers.equipment.some(entry =>
    entry.slot === CONST.EQUIPMENT.RIGHT && entry.item.id === ITEMS.FIRE_SWORD
  ));
  assert.ok(!mage.character.containers.equipment.some(entry => entry.slot === CONST.EQUIPMENT.BOOTS));
  assert.deepStrictEqual(mage.character.storage, {});

  const grappler = buildCharacter(
    { name: "Grappler", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "axe" },
    { name: "Grappler", level: 265, experience: 303491105 },
    { main: 96, shielding: 92, magic: null }
  );
  assert.strictEqual(
    new Skill(CONST.PROPERTIES.AXE, grappler.character.skills.axe)
      .getSkillLevel(CONST.VOCATION.ELITE_KNIGHT),
    96
  );
  assert.ok(grappler.character.containers.equipment.some(entry =>
    entry.slot === CONST.EQUIPMENT.RIGHT && entry.item.id === ITEMS.STONECUTTER_AXE
  ));
  assert.ok(ROSTER.some(entry => entry.name === "Grappler" && entry.main === "axe"));

  assert.strictEqual(resolveMainWeapon(
    { name: "Neked", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "auto" },
    { club: 92, axe: 42, sword: 29 }
  ).main, "club");
  assert.strictEqual(resolveMainWeapon(
    { name: "Axe Knight", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "auto" },
    { club: 30, axe: 96, sword: 87 }
  ).main, "axe");
  assert.strictEqual(resolveMainWeapon(
    { name: "Sword Knight", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "auto" },
    { club: 30, axe: 87, sword: 96 }
  ).main, "sword");
  assert.ok(ROSTER.some(entry => entry.name === "Neked" && entry.main === "auto"));

  const neked = buildCharacter(
    { name: "Neked", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "club" },
    { name: "Neked", level: 211, experience: 152958863 },
    { main: 92, shielding: 87, magic: null }
  );
  assert.strictEqual(
    new Skill(CONST.PROPERTIES.CLUB, neked.character.skills.club)
      .getSkillLevel(CONST.VOCATION.ELITE_KNIGHT),
    92
  );
  assert.strictEqual(
    new Skill(CONST.PROPERTIES.AXE, neked.character.skills.axe)
      .getSkillLevel(CONST.VOCATION.ELITE_KNIGHT),
    15
  );
  assert.ok(neked.character.containers.equipment.some(entry =>
    entry.slot === CONST.EQUIPMENT.RIGHT && entry.item.id === ITEMS.THUNDER_HAMMER
  ));

  const lastRaven = buildCharacter(
    { name: "Last Raven", vocation: CONST.VOCATION.ELITE_KNIGHT, main: "axe" },
    { name: "Last Raven", level: 151, experience: 55762470 },
    { main: 91, shielding: 83, magic: null }
  );
  assert.ok(lastRaven.character.containers.equipment.some(entry =>
    entry.slot === CONST.EQUIPMENT.RIGHT && entry.item.id === ITEMS.STONECUTTER_AXE
  ));

  console.log("PartyZone account import prerequisites passed.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
