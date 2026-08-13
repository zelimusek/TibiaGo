"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const worldSource = fs.readFileSync(
  path.join(root, "client", "src", "core", "world.js"),
  "utf8"
);

let cancelled = 0;
let scheduledFor = null;
let replanned = null;
const correctedPosition = { x: 100, y: 100, z: 7 };
const finalDestination = { x: 110, y: 110, z: 7 };
const replacementEvent = { cancel() {} };

const player = {
  __movementEvent: {
    cancel() {
      cancelled += 1;
    },
  },
  __teleported: false,
  __serverWalkConfirmation: false,
  setMovementBuffer(value) {
    assert.strictEqual(value, null);
  },
  getPosition() {
    return correctedPosition;
  },
  unlockMovement() {},
};

const pathfinder = {
  __pathfindCache: [1, 2, 3],
  __finalDestination: finalDestination,
  findPath(from, to, isFinalDestination) {
    assert.strictEqual(
      player.__movementEvent,
      replacementEvent,
      "the short correction barrier must exist before pathfinding can dispatch"
    );
    replanned = { from, to, isFinalDestination };
  },
};

const gameClient = {
  player,
  world: {
    pathfinder,
    checkEntityReferences() {},
    checkChunks() {},
  },
  renderer: {
    updateTileCache() {},
    minimap: { setCenter() {} },
  },
  eventQueue: {
    addEvent(callback, duration) {
      assert.strictEqual(callback instanceof Function, true);
      scheduledFor = duration;
      return replacementEvent;
    },
  },
};

const context = vm.createContext({
  console,
  gameClient,
  Chunk: function Chunk() {},
  Pathfinder: function Pathfinder() {},
  Clock: function Clock() {},
  window: {},
});

vm.runInContext(worldSource + "\nthis.World = World;", context, {
  filename: "world.js",
});

context.World.prototype.handleSelfTeleport.call(gameClient.world);

assert.strictEqual(cancelled, 1,
  "the rejected local prediction timer is cancelled immediately");
assert.strictEqual(player.__serverWalkConfirmation, true);
assert.strictEqual(player.__teleported, true);
assert.strictEqual(pathfinder.__pathfindCache.length, 0,
  "the stale cached route is discarded");
assert.deepStrictEqual(replanned, {
  from: correctedPosition,
  to: finalDestination,
  isFinalDestination: false,
}, "click-to-walk replans from the authoritative position");
assert.strictEqual(scheduledFor, 10,
  "the correction keeps only the short teleport pause");
assert.strictEqual(player.__movementEvent, replacementEvent);

console.log(
  "PASS: self teleports cancel rejected prediction and replan autowalk."
);
