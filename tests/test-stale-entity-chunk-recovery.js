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
  refreshChunkReference() { this.chunk = repairedChunk; return this.chunk; }
};
const missing = {
  id: 3,
  getChunk() { return null; },
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
const fakeWorld = {
  activeCreatures: { 1: self, 2: stale, 3: missing },
  addCreature(creature) { rebound.push(creature.id); }
};
const changes = context.World.prototype.checkEntityReferences.call(fakeWorld);

assert.strictEqual(changes, 2, "one stale reference is repaired and one unavailable entity is removed");
assert.deepStrictEqual(rebound, [2]);
assert.deepStrictEqual(removed, [3]);
assert.strictEqual(diagnostics.at(-1).type, "stale-entity-chunk-recovered");
assert.strictEqual(diagnostics.at(-1).details.repaired, 1);
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
