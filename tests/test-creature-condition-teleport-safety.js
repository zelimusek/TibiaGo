"use strict";

const assert = require("assert");
const path = require("path");

require("../require");

const Creature = requireModule("entities/creature");
const Player = requireModule("player/player");
const World = requireModule("core/world");

assert.strictEqual(
  typeof Creature.prototype.sendCancelMessage,
  "function",
  "Every creature should expose a safe cancel-message API."
);
assert.notStrictEqual(
  Player.prototype.sendCancelMessage,
  Creature.prototype.sendCancelMessage,
  "Players must retain their packet-sending implementation."
);

const monsterLikeCreature = Object.create(Creature.prototype);
const conditionNames = ["burning", "electrified", "poisoned"];

conditionNames.forEach((name) => {
  const definition = require(path.join(
    __dirname,
    "..",
    "data",
    "760",
    "conditions",
    "definitions",
    name + ".js"
  ));

  assert.doesNotThrow(
    () => definition.onStart.call({}, monsterLikeCreature),
    name + " should start safely on a monster."
  );
  assert.doesNotThrow(
    () => definition.onExpire.call({}, monsterLikeCreature),
    name + " should expire safely on a monster."
  );
});

let delegatedCreature = null;
let delegatedPosition = null;
const world = Object.create(World.prototype);
world.creatureHandler = {
  teleportCreature(creature, position) {
    delegatedCreature = creature;
    delegatedPosition = position;
    return true;
  },
};

const creature = { name: "Test creature" };
const position = { x: 100, y: 200, z: 7 };
assert.strictEqual(world.teleportCreature(creature, position), true);
assert.strictEqual(delegatedCreature, creature);
assert.strictEqual(delegatedPosition, position);

const originalGameServer = process.gameServer;
let magicEffects = 0;
world.findPath = () => [position];
world.sendMagicEffect = () => magicEffects++;
process.gameServer = { world };

try {
  const teleportRune = require(path.join(
    __dirname,
    "..",
    "data",
    "760",
    "runes",
    "definitions",
    "teleport.js"
  ));
  const source = {
    position: { x: 1, y: 1, z: 7 },
    sendCancelMessage() {},
  };
  const target = {
    position: { x: 2, y: 2, z: 7 },
  };

  delegatedCreature = null;
  delegatedPosition = null;

  assert.strictEqual(teleportRune(source, target), true);
  assert.strictEqual(delegatedCreature, source);
  assert.strictEqual(delegatedPosition, target.position);
  assert.strictEqual(magicEffects, 2);
} finally {
  process.gameServer = originalGameServer;
}

console.log(
  "PASS: monster field conditions and legacy world teleport API are safe."
);
