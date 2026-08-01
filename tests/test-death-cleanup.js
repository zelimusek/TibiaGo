"use strict";

const assert = require("assert");
require("../require");

const CreatureHandler = requireModule("core/world-creature-handler");

let tileCreatures = new Set();
let chunkPlayers = new Set();
let exits = 0;
let cleanups = 0;
let forgets = 0;
let creature = {
  getId() { return 70001; },
  cleanup() { cleanups++; },
  broadcast() { forgets++; },
  getChunk() {
    return {
      removeCreature(value) { chunkPlayers.delete(value); }
    };
  },
  getTile() {
    return {
      removeCreature(value) { tileCreatures.delete(value); },
      emit(event, tile, value) {
        if (event === "exit" && value === creature) exits++;
      }
    };
  }
};

tileCreatures.add(creature);
chunkPlayers.add(creature);

let handler = Object.create(CreatureHandler.prototype);
handler.__creatureMap = new Map([[creature.getId(), creature]]);
handler.__playerMap = new Map();
handler.__detachedCreaturePositions = new WeakSet();

assert.strictEqual(handler.detachCreaturePosition(creature), true);
assert.strictEqual(tileCreatures.has(creature), false);
assert.strictEqual(chunkPlayers.has(creature), false);
assert.strictEqual(exits, 1);

// The operation is idempotent while the socket waits for death confirmation.
assert.strictEqual(handler.detachCreaturePosition(creature), false);
assert.strictEqual(exits, 1);

// Normal socket cleanup later removes references without trying to leave the
// same tile a second time.
handler.removeCreature(creature);
assert.strictEqual(handler.exists(creature), false);
assert.strictEqual(exits, 1);
assert.strictEqual(cleanups, 1);
assert.strictEqual(forgets, 1);

console.log("PASS: dead players release their corpse tile before disconnecting.");
