"use strict";

const assert = require("assert");

global.CONST = {
  EFFECT: {
    PROJECTILE: { ENERGY: 1, DEATH: 2 },
    MAGIC: { ENERGYHIT: 3, MORTAREA: 4 }
  },
  COLOR: { LIGHTBLUE: 5, WHITE: 6 }
};

const originalRandom = Number.prototype.random;
const originalGameServer = process.gameServer;
Number.prototype.random = function (minimum) {
  return minimum;
};

function exerciseRune(modulePath) {
  const rune = require(modulePath);
  const source = { position: { x: 1, y: 1, z: 7 } };
  const player = { position: { x: 2, y: 1, z: 7 } };
  const target = {
    position: player.position,
    monsters: new Set(),
    players: new Set([player])
  };
  const calls = [];
  let allowed = false;

  process.gameServer = {
    world: {
      combatHandler: {
        canAttack(attacker, victim, notify) {
          calls.push(["policy", attacker, victim, notify]);
          return allowed;
        }
      },
      sendDistanceEffect() {
        calls.push(["distance"]);
      },
      sendMagicEffect() {
        calls.push(["magic"]);
      },
      __damageEntity(attacker, victim, damage) {
        calls.push(["damage", attacker, victim, damage]);
      }
    }
  };

  assert.strictEqual(rune(source, target), false);
  assert.deepStrictEqual(calls.map((entry) => entry[0]), ["policy"]);

  calls.length = 0;
  allowed = true;

  assert.strictEqual(rune(source, target), true);
  assert.deepStrictEqual(
    calls.map((entry) => entry[0]),
    ["policy", "distance", "magic", "damage"]
  );
}

try {
  exerciseRune("../data/760/runes/definitions/heavy-magic-missile");
  exerciseRune("../data/760/runes/definitions/sudden-death");
} finally {
  Number.prototype.random = originalRandom;
  process.gameServer = originalGameServer;
}

console.log("PASS: protected PvP targets do not consume HMM or SD charges.");
