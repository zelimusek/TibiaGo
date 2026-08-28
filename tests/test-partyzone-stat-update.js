"use strict";
const assert = require("assert/strict");
const { buildCharacter } = require("../scripts/import-partyzone-guild-accounts");
const { mergeStats, validateSource } = require("../scripts/update-partyzone-guild-stats");
const Skill = requireModule("utils/skill");
const experience = level => new Skill(CONST.PROPERTIES.EXPERIENCE, 0).getRequiredSkillPoints(level) + 100;

for (const [name, vocation, main, magic] of [
  ["Scrappy", CONST.VOCATION.ELITE_KNIGHT, "sword", 9],
  ["Neked", CONST.VOCATION.ELITE_KNIGHT, "club", 9],
  ["Narkotyczny Maniak", CONST.VOCATION.MASTER_SORCERER, "magic", 96],
]) {
  const knight = main !== "magic";
  const current = buildCharacter({ name, vocation, main },
    { name, level: 150, experience: experience(150) }, { main: 92, shielding: 87, magic: 92 }).character;
  current.storage = { achievement: 790, radioTime: 123456, arbitrary: { keep: true } };
  current.position = { x: 32520, y: 32380, z: 7 };
  current.friends = ["God"];
  current.pvpPreferences = { secureMode: false };
  current.unknownFutureField = { nested: [1, 2] };
  current.skills.futureSkill = 123;
  current.containers.equipment[0].item.customAttribute = "preserved";
  current.properties.health = Math.floor(current.properties.healthMax / 2);
  current.properties.mana = 0;
  const original = JSON.parse(JSON.stringify(current));
  const source = { name, vocation, main, level: 170, experience: experience(170),
    skills: { magic, fist: 15, club: 15, sword: 15, axe: 15, distance: 15, shielding: knight ? 94 : 15, fishing: 15 } };
  source.skills[main] = knight ? 98 : magic;
  const updated = mergeStats(current, source);
  assert.deepEqual(current, original, "merge must not mutate original");
  assert.equal(updated.skills.futureSkill, 123);
  assert.equal(updated.properties.speed, 279);
  assert.equal(updated.properties.mana, 0);
  assert.equal(updated.properties.health, Math.round(updated.properties.healthMax *
    current.properties.health / current.properties.healthMax));
  assert.equal(new Skill(CONST.PROPERTIES.EXPERIENCE, updated.skills.experience).getSkillLevel(), 170);
  assert.equal(new Skill(CONST.PROPERTIES[main.toUpperCase()], updated.skills[main]).getSkillLevel(vocation),
    source.skills[main]);
  // Everything outside the explicit stats whitelist must remain byte-equivalent.
  const stripStats = character => {
    const stripped = JSON.parse(JSON.stringify(character));
    for (const key of ["experience", "level", "magic", "fist", "club", "sword", "axe", "distance", "shielding", "fishing"])
      delete stripped.skills[key];
    for (const key of ["health", "mana", "healthMax", "manaMax", "maxHealth", "maxMana", "maxCapacity", "capacityMax", "speed"])
      delete stripped.properties[key];
    return stripped;
  };
  assert.deepEqual(stripStats(updated), stripStats(original));
  assert.throws(() => mergeStats({ ...current, properties: { ...current.properties, name: "God" } }, source));
  assert.throws(() => validateSource({ ...source, experience: experience(20) }));
  assert.throws(() => validateSource({ ...source, skills: { ...source.skills, [main]: NaN } }));
  assert.throws(() => validateSource({ ...source, level: 1000 }));
  const dead = JSON.parse(JSON.stringify(current));
  dead.properties.health = 0;
  assert.equal(mergeStats(dead, source).properties.health, 0);
  const lower = { ...source, level: 130, experience: experience(130) };
  assert.equal(mergeStats(current, lower).skills.level, 130);
  const serialized = JSON.parse(JSON.stringify(updated));
  assert.deepEqual(mergeStats(serialized, source), updated, "repeat update must be idempotent");
}
console.log("PartyZone stat-update validation, preservation and skill round-trip tests passed.");
