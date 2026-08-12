"use strict";

const assert = require("assert");

require("../require");

const PacketHandler = requireModule("network/packet-handler");
const Position = requireModule("utils/position");

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;

const observerChunk = {
  id: 1,
  position: new Position(1, 1, 0),
  layers: new Array(8).fill(null),
  neighbours: [],
};
const targetChunk = {
  id: 2,
  position: new Position(2, 1, 0),
  layers: new Array(8).fill(null),
  neighbours: [],
};
const farChunk = {
  id: 3,
  position: new Position(9, 9, 0),
  layers: new Array(8).fill(null),
  neighbours: [],
};
const targetChunk2 = {
  id: 4,
  position: new Position(3, 1, 0),
  layers: new Array(8).fill(null),
  neighbours: [],
};
const targetChunk3 = {
  id: 5,
  position: new Position(4, 1, 0),
  layers: new Array(8).fill(null),
  neighbours: [],
};
observerChunk.neighbours = [observerChunk, targetChunk, targetChunk2, targetChunk3];

function npc(id, chunk) {
  return {
    constructor: { name: "NPC" },
    id,
    position: new Position(32514, 32344, 7),
    getId() { return this.id; },
    getPosition() { return this.position; },
    getChunk() { return chunk; },
    getTile() { return {}; },
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
}

const visible = npc(77, targetChunk);
const hidden = npc(88, farChunk);
const creatures = new Map([[77, visible], [88, hidden]]);
let playerHealth = 245;
const player = {
  id: 1,
  position: new Position(32513, 32344, 7),
  getId() { return this.id; },
  getPosition() { return this.position; },
  getChunk() { return observerChunk; },
  getTile() { return {}; },
  getProperty(property) {
    return property === CONST.PROPERTIES.HEALTH ? playerHealth : 0;
  },
  write() { throw new Error("repair must target only the requesting socket"); },
};
creatures.set(player.id, player);
const packets = [];
const gameSocket = {
  player,
  isController() { return true; },
  write(packet) { packets.push(packet); },
};

const server = {
  isFeatureEnabled() { return true; },
  world: {
    creatureHandler: {
      getCreatureFromId(id) { return creatures.get(id) || null; },
      isCreaturePositioned(creature) {
        return creature === player || creatures.get(creature.id) === creature;
      },
    },
    combatHandler: null,
  },
};

global.gameServer = process.gameServer = server;

try {
  const handler = new PacketHandler();
  assert.strictEqual(handler.handleCreatureResync(gameSocket, 77), true);
  assert.deepStrictEqual(
    packets.map(packet => packet.constructor.name),
    ["ChunkPacket", "CreatureStatePacket", "CreatureTeleportPacket"],
    "the server refreshes the tile before introducing and anchoring the creature"
  );

  assert.strictEqual(handler.handleCreatureResync(gameSocket, 77), false,
    "the same ID is limited to one request per second");
  assert.strictEqual(packets.length, 3);

  const visibleSameChunk = npc(78, targetChunk);
  creatures.set(78, visibleSameChunk);
  assert.strictEqual(handler.handleCreatureResync(gameSocket, 78), true);
  assert.deepStrictEqual(
    packets.slice(3).map(packet => packet.constructor.name),
    ["CreatureStatePacket", "CreatureTeleportPacket"],
    "several repairs in one chunk reuse the same one-second tile snapshot"
  );

  assert.strictEqual(handler.handleCreatureResync(gameSocket, 88), false,
    "a creature outside the observer chunk neighbourhood is never exposed");
  assert.strictEqual(packets.length, 5);

  assert.strictEqual(handler.handleCreatureResync({
    player,
    isController() { return false; },
    write() { throw new Error("spectator must not receive repair data"); },
  }, 77), false, "spectator sockets cannot request creature state");

  const selfPackets = [];
  const selfSocket = {
    player,
    isController() { return true; },
    write(packet) { selfPackets.push(packet); },
  };
  assert.strictEqual(handler.handleCreatureResync(selfSocket, player.id), true);
  assert.deepStrictEqual(
    selfPackets.map(packet => packet.constructor.name),
    ["ChunkPacket", "CreatureTeleportPacket"],
    "self recovery refreshes its tile and anchor without reconstructing Player"
  );

  playerHealth = 0;
  creatures.set(79, npc(79, targetChunk));
  const deadPackets = packets.length;
  assert.strictEqual(handler.handleCreatureResync(gameSocket, 79), false,
    "a dead or detached controller cannot request world snapshots");
  assert.strictEqual(packets.length, deadPackets);

  playerHealth = 245;
  creatures.set(80, npc(80, targetChunk));
  creatures.set(81, npc(81, targetChunk2));
  creatures.set(82, npc(82, targetChunk3));
  const budgetPackets = [];
  const budgetSocket = {
    player,
    isController() { return true; },
    write(packet) { budgetPackets.push(packet); },
  };
  assert.strictEqual(handler.handleCreatureResync(budgetSocket, 80), true);
  assert.strictEqual(handler.handleCreatureResync(budgetSocket, 81), true);
  assert.strictEqual(handler.handleCreatureResync(budgetSocket, 82), true);
  assert.strictEqual(
    budgetPackets.filter(packet => packet.constructor.name === "ChunkPacket").length,
    2,
    "one connection cannot force more than two unique chunk snapshots per second"
  );

  console.log("PASS: server creature resync is targeted, ordered, visible and rate limited.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
