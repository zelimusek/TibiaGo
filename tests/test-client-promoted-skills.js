"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CONST = require("../client/data/760/constants.json");
const context = vm.createContext({ CONST, console });

function load(relativePath, exportExpression) {
  const filename = path.join(__dirname, "..", relativePath);
  vm.runInContext(
    fs.readFileSync(filename, "utf8") + "\n" + exportExpression,
    context,
    { filename }
  );
}

load("client/src/utils/vocation.js", "this.normalizeSkillVocation = normalizeSkillVocation;");
load("client/src/entities/skills.js", "this.Skills = Skills;");
load("client/src/network/packet-handler.js", "this.PacketHandler = PacketHandler;");

const mappings = [
  [CONST.VOCATION.ELITE_KNIGHT, CONST.VOCATION.KNIGHT],
  [CONST.VOCATION.ROYAL_PALADIN, CONST.VOCATION.PALADIN],
  [CONST.VOCATION.MASTER_SORCERER, CONST.VOCATION.SORCERER],
  [CONST.VOCATION.ELDER_DRUID, CONST.VOCATION.DRUID],
];
for (const [promoted, base] of mappings) {
  assert.strictEqual(context.normalizeSkillVocation(promoted), base);
}

function pointsFor(level, offset, A, B) {
  return Math.ceil(A * ((Math.pow(B, level - offset) - 1) / (B - 1)));
}

const magicPoints = pointsFor(92, 0, 1600, 1.1);
const skills = Object.create(context.Skills.prototype);
skills.vocation = CONST.VOCATION.MASTER_SORCERER;
assert.strictEqual(skills.__getSkillLevel("magic", magicPoints), 92);

const packetHandler = Object.create(context.PacketHandler.prototype);
const magicResult = packetHandler.__calculateSkillLevelAndPercentage(
  CONST.PROPERTIES.MAGIC,
  magicPoints,
  CONST.VOCATION.MASTER_SORCERER
);
assert.strictEqual(magicResult.level, 92);

const axePoints = pointsFor(96, 10, 50, 1.1);
skills.vocation = CONST.VOCATION.ELITE_KNIGHT;
assert.strictEqual(skills.__getSkillLevel("axe", axePoints), 96);
const axeResult = packetHandler.__calculateSkillLevelAndPercentage(
  CONST.PROPERTIES.AXE,
  axePoints,
  CONST.VOCATION.ELITE_KNIGHT
);
assert.strictEqual(axeResult.level, 96);

console.log("PASS: promoted vocations use their base skill formulas throughout the client.");
