"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const protocolSource = fs.readFileSync(
  path.join(root, "client", "src", "network", "protocol.js"),
  "utf8"
);
const handlerSource = fs.readFileSync(
  path.join(root, "client", "src", "network", "packet-handler.js"),
  "utf8"
);

function PacketWriter(opcode, size) {
  this.opcode = opcode;
  this.size = size;
  this.values = [];
}
PacketWriter.prototype.writeUInt32 = function (value) {
  this.values.push(value);
};

const protocolContext = vm.createContext({
  PacketWriter,
  CONST: { PROTOCOL: { CLIENT: { CREATURE_RESYNC: 31 } } },
});
vm.runInContext(
  protocolSource + "\nthis.CreatureResyncPacket = CreatureResyncPacket;",
  protocolContext,
  { filename: "protocol.js" }
);

const request = new protocolContext.CreatureResyncPacket(65578);
assert.strictEqual(request.opcode, 31);
assert.strictEqual(request.size, 4, "the request payload is exactly one uint32");
assert.deepStrictEqual(request.values, [65578]);

const constants = ["740", "760", "780"].map(version => JSON.parse(
  fs.readFileSync(path.join(root, "client", "data", version, "constants.json"), "utf8")
));
constants.forEach(data => assert.strictEqual(data.PROTOCOL.CLIENT.CREATURE_RESYNC, 31));

let sent = [];
let spoken = [];
let diagnostics = [];
let creatures = Object.create(null);
let scheduledRecovery = null;
let confirmedWalks = 0;

function Creature(packet) {
  this.id = packet.id;
  this.setPosition = function (position) {
    this.position = position;
    return true;
  };
  this.say = function (message) {
    spoken.push({ id: this.id, message: message.message });
  };
}

function CreatureResyncPacket(id) {
  this.id = id;
}

const gameClient = {
  player: {
    id: 1,
    isDead: false,
    getPosition() { return { x: 10, y: 10, z: 7 }; },
    setPosition() { return false; },
    confirmClientWalk() { confirmedWalks++; },
    canSeeSmall() { return true; },
    setTarget() {},
  },
  world: {
    __entityReferenceGrace: new Map(),
    getCreature(id) { return creatures[id] || null; },
    __handleCreatureMove() { return false; },
    checkEntityReferences() {},
    checkChunks() { return false; },
    addCreature() {},
    createCreature(id, creature) {
      creatures[id] = creature;
      return creature;
    },
  },
  interface: {
    windowManager: {
      getWindow() {
        return { addCreature() {}, removeCreature() {} };
      },
    },
  },
  isSelf(creature) { return creature === this.player; },
  renderer: { updateTileCache() {} },
  send(packet) { sent.push(packet); },
};

const handlerContext = vm.createContext({
  Creature,
  CreatureResyncPacket,
  gameClient,
  window: {
    setTimeout(callback) { scheduledRecovery = callback; return 1; },
    clearTimeout() { scheduledRecovery = null; },
    tibiaDiagnostics: {
      record(type, details) { diagnostics.push({ type, details }); },
    },
  },
});
vm.runInContext(
  handlerSource + "\nthis.PacketHandler = PacketHandler;",
  handlerContext,
  { filename: "packet-handler.js" }
);

const handler = new handlerContext.PacketHandler();
const lostSpeech = { id: 77, message: "I am still here!" };
handler.handleDefaultMessage(lostSpeech);
assert.strictEqual(sent.length, 1, "unknown speech requests one targeted repair");
assert.strictEqual(sent[0].id, 77);

handler.handleCreatureServerMove({ id: 77, position: {}, speed: 100 });
assert.strictEqual(sent.length, 1, "events for the same ID are coalesced for one second");

handler.handleEntityReference({ id: 77 });
assert.deepStrictEqual(spoken, [],
  "queued speech waits for the authoritative teleport anchor");
handler.handleEntityTeleport({ id: 77, position: { x: 100, y: 100, z: 7 } });
assert.deepStrictEqual(spoken, [{ id: 77, message: "I am still here!" }],
  "queued speech is replayed once after the creature state arrives");
assert.strictEqual(handler.__creatureRecovery.size, 0);
assert.strictEqual(diagnostics.at(-1).type, "creature-resync-completed");

handler.handleDefaultMessage({ id: 88, message: "must be forgotten" });
handler.handleEntityRemove(88);
handler.handleEntityReference({ id: 88 });
assert.strictEqual(spoken.length, 1,
  "an explicit server forget discards pending speech instead of resurrecting it");

handler.__resetCreatureRecovery();
sent = [];
creatures[1] = gameClient.player;
handler.handleCreatureServerMove({
  id: 1,
  position: { equals() { return false; } },
  speed: 100,
});
assert.deepStrictEqual(sent.map(packet => packet.id), [1],
  "a missing self destination tile requests an authoritative self anchor");
assert.strictEqual(confirmedWalks, 0,
  "a self step is not acknowledged until its missing tile is repaired");
handler.handleEntityTeleport({
  id: 1,
  position: { x: 11, y: 10, z: 7 },
});
assert.strictEqual(sent.length, 1,
  "a missing self teleport tile is coalesced with the active repair");
assert.strictEqual(handler.__creatureRecovery.get(1).requestQueued, true,
  "self recovery remains queued until its authoritative chunk is available");
delete creatures[1];

handler.__resetCreatureRecovery();
sent = [];
handler.handleCreatureTurn({ id: 90, direction: 2 });
assert.deepStrictEqual(sent.map(packet => packet.id), [90],
  "a missing static creature can recover from a turn-only update");

handler.__resetCreatureRecovery();
sent = [];
[101, 102, 103, 104, 105].forEach(id => {
  handler.handleDefaultMessage({ id, message: "crowd" });
});
assert.strictEqual(sent.length, 4,
  "the immediate repair burst stays within the client-side limit");
assert.strictEqual(typeof scheduledRecovery, "function",
  "a repair delayed by the burst limit receives one shared retry timer");
handler.__creatureRecoveryRequests = [];
scheduledRecovery();
assert.strictEqual(sent.length, 5,
  "the queued fifth creature is repaired instead of being forgotten");

console.log("PASS: missing client creatures recover with bounded request and speech replay.");
