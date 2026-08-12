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
  constructor: { name: "NPC" },
  id: 88,
  position: new Position(32521, 32352, 7),
  getId() { return this.id; },
  getPosition() { return this.position; },
  getProperty(property) {
    if (property === CONST.PROPERTIES.NAME) return "Lichomek";
    if (property === CONST.PROPERTIES.DIRECTION) return CONST.DIRECTION.SOUTH;
    if (property === CONST.PROPERTIES.HEALTH) return 245;
    if (property === CONST.PROPERTIES.HEALTH_MAX) return 245;
    if (property === CONST.PROPERTIES.SPEED) return 220;
    return 0;
  },
  getOutfit() {
    return {
      id: 128,
      details: { head: 0, body: 0, legs: 0, feet: 0 },
      mount: 0,
      mounted: false,
      addonOne: false,
      addonTwo: false,
    };
  },
  isPlayer() { return false; },
};
center.players.add(player);
north.players.add(opponent);

global.gameServer = process.gameServer = {
  isFeatureEnabled() { return true; },
  world: {
    getChunkFromWorldPosition() { return center; },
  },
};

try {
  const handler = Object.create(CreatureHandler.prototype);
  assert.strictEqual(handler.resyncPlayerWorld(player, "teleport-test"), 3,
    "an authoritative teleport refresh sends each visible chunk once");
  assert.strictEqual(player.packets.length, 6,
    "chunk snapshots are followed by opponent state and position anchors");
  assert.strictEqual(player.packets.at(-1).constructor.name, "CreatureTeleportPacket",
    "self teleport is the final cache-rebuild barrier");
  assert.strictEqual(player.packets.at(-2).constructor.name, "CreatureTeleportPacket");
  assert.strictEqual(player.packets.at(-3).constructor.name, "CreatureStatePacket",
    "an unknown remote creature is introduced before its teleport anchor");

  const movingPlayer = Object.assign({}, opponent, {
    constructor: { name: "Player" },
    id: 99,
    position: new Position(32514, 32344, 7),
    packets: [],
    getChunk() { return center; },
    isPlayer() { return true; },
    write(packet) { this.packets.push(packet); },
  });
  center.players = new Set([player, movingPlayer]);
  north.players = new Set();
  west.players = new Set();
  player.packets = [];
  process.gameServer.world.combatHandler = {
    getPvPManager() {
      return {
        getSkullFor(observer, target) {
          assert.strictEqual(observer, player);
          assert.strictEqual(target, movingPlayer);
          return 3;
        },
      };
    },
  };
  assert.strictEqual(handler.__broadcastCreatureTeleport(movingPlayer), true);
  assert.deepStrictEqual(
    player.packets.map(packet => packet.constructor.name),
    ["CreatureStatePacket", "CreatureSkullPacket", "CreatureTeleportPacket"],
    "destination observers receive player state and skull before the teleport anchor"
  );
  assert.deepStrictEqual(
    movingPlayer.packets.map(packet => packet.constructor.name),
    ["CreatureTeleportPacket"],
    "the teleported player receives only its own authoritative anchor"
  );

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
  assert.ok(serverWorld.includes("this.__broadcastCreatureTeleport(creature)"),
    "the production teleport path uses state-before-teleport broadcasting");

  console.log("PASS: teleports replace stale client chunks with authoritative world snapshots.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
