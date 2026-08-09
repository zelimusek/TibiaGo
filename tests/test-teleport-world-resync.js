"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

require("../require");

const CreatureHandler = requireModule("core/world-creature-handler");
const Position = requireModule("utils/position");

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;

function chunk(id, x, y) {
  return {
    id,
    position: new Position(x, y, 0),
    layers: new Array(8).fill(null),
    neighbours: [],
    players: new Set(),
    npcs: new Set(),
    monsters: new Set(),
  };
}

const center = chunk(101, 1, 1);
const north = chunk(102, 1, 0);
const west = chunk(103, 0, 1);
center.neighbours = [center, north, west, center];

const player = {
  id: 77,
  position: new Position(32515, 32346, 7),
  packets: [],
  isPlayer() { return true; },
  getId() { return this.id; },
  getPosition() { return this.position; },
  write(packet) { this.packets.push(packet); },
};
const opponent = {
  id: 88,
  position: new Position(32521, 32352, 7),
  getId() { return this.id; },
  getPosition() { return this.position; },
};
center.players.add(player);
north.players.add(opponent);

global.gameServer = process.gameServer = {
  world: {
    getChunkFromWorldPosition() { return center; },
  },
};

try {
  const handler = Object.create(CreatureHandler.prototype);
  assert.strictEqual(handler.resyncPlayerWorld(player, "teleport-test"), 3,
    "an authoritative teleport refresh sends each visible chunk once");
  assert.strictEqual(player.packets.length, 5,
    "chunk snapshots are followed by opponent and self position anchors");
  assert.strictEqual(player.packets.at(-1).constructor.name, "CreatureTeleportPacket",
    "self teleport is the final cache-rebuild barrier");
  assert.strictEqual(player.packets.at(-2).constructor.name, "CreatureTeleportPacket");

  const root = path.resolve(__dirname, "..");
  const packetHandler = fs.readFileSync(
    path.join(root, "client", "src", "network", "packet-handler.js"),
    "utf8"
  );
  const clientWorld = fs.readFileSync(
    path.join(root, "client", "src", "core", "world.js"),
    "utf8"
  );
  const serverWorld = fs.readFileSync(
    path.join(root, "src", "core", "world-creature-handler.js"),
    "utf8"
  );

  assert.ok(packetHandler.includes("gameClient.world.chunks[i] = chunk"),
    "the client replaces a stale chunk with the authoritative snapshot");
  assert.ok(packetHandler.includes("rebindChunkCreatures(chunk)"),
    "creatures are restored onto the replacement Tile instances");
  let rebindIndex = packetHandler.indexOf("rebindChunkCreatures(chunk)");
  let synchronousNeighboursIndex = packetHandler.indexOf(
    "referenceTileNeighbours()",
    rebindIndex
  );
  let scheduledRefreshIndex = packetHandler.indexOf(
    "scheduleChunkRefresh()",
    rebindIndex
  );
  assert.ok(
    synchronousNeighboursIndex > rebindIndex
      && synchronousNeighboursIndex < scheduledRefreshIndex,
    "chunk neighbours are ready synchronously before ACCEPT_LOGIN renders the first frame"
  );
  assert.ok(clientWorld.includes("scheduleChunkRefresh"),
    "renderer and pathfinding caches are rebuilt after the refresh batch");
  assert.ok(serverWorld.includes("this.resyncPlayerWorld(creature"),
    "every player teleport is followed by a visible-world refresh");

  console.log("PASS: teleports replace stale client chunks with authoritative world snapshots.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
