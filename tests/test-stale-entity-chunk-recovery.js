"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const worldSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "core", "world.js"),
  "utf8"
);
const chunkSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "entities", "chunk.js"),
  "utf8"
);

let removed = [];
let diagnostics = [];
const playerChunk = {
  besides(chunk) {
    return chunk && chunk.near === true;
  }
};
const self = { id: 1, getChunk() { return playerChunk; } };
const repairedChunk = { near: true };
const stale = {
  id: 2,
  chunk: null,
  getChunk() { return this.chunk; },
  getPosition() { return { marker: 2 }; },
  refreshChunkReference() { this.chunk = repairedChunk; return this.chunk; }
};
const missing = {
  id: 3,
  getChunk() { return null; },
  getPosition() { return { marker: 3 }; },
  refreshChunkReference() { return null; }
};

const context = vm.createContext({
  window: {
    tibiaDiagnostics: {
      record(type, details) { diagnostics.push({ type, details }); }
    }
  },
  gameClient: {
    player: self,
    isSelf(creature) { return creature === self; },
    networkManager: {
      packetHandler: {
        handleEntityRemove(id) { removed.push(id); }
      }
    }
  }
});

vm.runInContext(worldSource + "\nthis.World = World;", context, { filename: "world.js" });
vm.runInContext(chunkSource + "\nthis.Chunk = Chunk;", context, { filename: "chunk.js" });

let rebound = [];
const reboundTile = {
  monsters: new Set(),
  addCreature(creature) { this.monsters.add(creature); }
};
const fakeWorld = {
  activeCreatures: { 1: self, 2: stale, 3: missing },
  __entityReferenceGrace: new Map(),
  __entityReferenceGraceTimer: null,
  ENTITY_REFERENCE_GRACE_MS: 200,
  __scheduleEntityReferenceSweep() {},
  getTileFromWorldPosition(position) {
    return position && position.marker === 2 ? reboundTile : null;
  },
  addCreature(creature) {
    rebound.push(creature.id);
    reboundTile.addCreature(creature);
  }
};
const changes = context.World.prototype.checkEntityReferences.call(fakeWorld);

assert.strictEqual(changes, 1, "one stale reference is repaired while a transient miss receives grace");
assert.deepStrictEqual(rebound, [2]);
assert.deepStrictEqual(removed, []);
assert.strictEqual(diagnostics.at(-1).details.repaired, 1);
assert.strictEqual(diagnostics.at(-1).details.removed, 0);

fakeWorld.__entityReferenceGrace.set(3, Date.now() - 250);
const expiredChanges = context.World.prototype.checkEntityReferences.call(fakeWorld);
assert.strictEqual(expiredChanges, 1, "an unavailable entity is removed after the grace period");
assert.deepStrictEqual(removed, [3]);
assert.strictEqual(diagnostics.at(-1).type, "stale-entity-chunk-recovered");
assert.strictEqual(diagnostics.at(-1).details.repaired, 0);
assert.strictEqual(diagnostics.at(-1).details.removed, 1);

let reboundReference = 0;
let tileAttachments = 0;
const rebindCreature = {
  getPosition() { return { x: 10, y: 10, z: 7 }; },
  refreshChunkReference() { reboundReference++; return { near: true }; }
};
const replacementChunk = {
  id: 44,
  getTileFromWorldPosition() {
    return { addCreature() { tileAttachments++; } };
  }
};
context.World.prototype.rebindChunkCreatures.call({
  activeCreatures: { 4: rebindCreature },
  getChunkPositionFromWorldPosition() { return {}; },
  getChunkIndex() { return 44; }
}, replacementChunk);
assert.strictEqual(reboundReference, 1, "an authoritative chunk replacement refreshes the creature's cached chunk");
assert.strictEqual(tileAttachments, 1, "the repaired creature is attached to the replacement tile");

const fakePosition = { besides() { throw new Error("must not run for a missing chunk"); } };
assert.strictEqual(
  context.Chunk.prototype.besides.call({ position: fakePosition }, null),
  false,
  "Chunk.besides must reject a missing neighbour without throwing"
);

console.log("PASS: stale creature chunk references self-heal without breaking movement packets.");
