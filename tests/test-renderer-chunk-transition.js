"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rendererSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "rendering", "renderer.js"),
  "utf8"
);
const packetHandlerSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "network", "packet-handler.js"),
  "utf8"
);
const worldSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "core", "world.js"),
  "utf8"
);

const diagnostics = [];
const position = { x: 32521, y: 32346, z: 7 };
let renderedLights = 0;

const rendererContext = vm.createContext({
  console,
  Date,
  window: {
    tibiaDiagnostics: {
      record(type, details, sendToServer) {
        diagnostics.push({ type, details, sendToServer });
      },
    },
  },
  gameClient: {
    world: {
      chunks: [],
      getChunkFromWorldPosition() {
        return null;
      },
    },
    player: {
      getMaxFloor() {
        return -1;
      },
    },
  },
});

vm.runInContext(
  rendererSource + "\nthis.Renderer = Renderer;",
  rendererContext,
  { filename: "renderer.js" }
);

const renderer = Object.create(rendererContext.Renderer.prototype);
renderer.__lastMissingLightChunkDiagnostic = 0;
renderer.__renderLightThing = function () {
  renderedLights += 1;
};

assert.doesNotThrow(() => {
  renderer.__renderLight({ getPosition: () => position }, position, {});
}, "A stale light tile must not stop the render loop.");
assert.strictEqual(renderedLights, 0, "A light from an unloaded chunk must be skipped.");
assert.strictEqual(diagnostics.length, 1, "The stale cache condition should remain diagnosable.");
assert.strictEqual(diagnostics[0].type, "renderer-missing-light-chunk");
assert.strictEqual(
  JSON.stringify(diagnostics[0].details.position),
  JSON.stringify(position)
);
assert.strictEqual(diagnostics[0].sendToServer, true);

rendererContext.gameClient.world.getChunkFromWorldPosition = function () {
  return {
    getFirstFloorFromBottomProjected() {
      return null;
    },
  };
};
renderer.__renderLight({ getPosition: () => position }, position, {});
assert.strictEqual(renderedLights, 1, "A light from a loaded chunk must still render normally.");

const callOrder = [];
const player = {
  confirmClientWalk() {
    callOrder.push("confirm");
  },
};
const packetContext = vm.createContext({
  console,
  gameClient: {
    player,
    isSelf(entity) {
      return entity === player;
    },
    world: {
      getCreature() {
        return player;
      },
      __handleCreatureMove() {
        callOrder.push("move");
      },
      checkEntityReferences() {
        callOrder.push("entities");
      },
      checkChunks() {
        callOrder.push("chunks");
        return true;
      },
    },
    renderer: {
      updateTileCache() {
        callOrder.push("cache");
      },
    },
  },
});

vm.runInContext(
  packetHandlerSource + "\nthis.PacketHandler = PacketHandler;",
  packetContext,
  { filename: "packet-handler.js" }
);

new packetContext.PacketHandler().handleCreatureServerMove({
  id: 1,
  position,
  speed: 100,
});
assert.deepStrictEqual(
  callOrder,
  ["move", "confirm", "entities", "chunks", "cache"],
  "The tile cache must be rebuilt after obsolete chunks are removed."
);

const retainedChunk = { id: 1 };
const removedChunk = { id: 2 };
const playerChunk = {
  besides(chunk) {
    return chunk === retainedChunk;
  },
};
const worldContext = vm.createContext({
  gameClient: {
    player: {
      getChunk() {
        return playerChunk;
      },
    },
  },
});

vm.runInContext(worldSource + "\nthis.World = World;", worldContext, {
  filename: "world.js",
});

const fakeWorld = { chunks: [retainedChunk, removedChunk] };
assert.strictEqual(
  worldContext.World.prototype.checkChunks.call(fakeWorld),
  true,
  "Removing a sector must invalidate dependent caches."
);
assert.deepStrictEqual(fakeWorld.chunks, [retainedChunk]);
assert.strictEqual(
  worldContext.World.prototype.checkChunks.call(fakeWorld),
  false,
  "An unchanged sector set must not trigger unnecessary cache work."
);

console.log("PASS: chunk transitions cannot leave stale light tiles that freeze rendering.");
