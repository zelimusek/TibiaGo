"use strict";

const assert = require("assert");
require("../require");

const PartyAchievementSystem = requireModule("core/party-achievement-system");
const { PartyAchievementPacket, CreatureTitlePacket } = requireModule("network/protocol");

const packets = [];
const messages = [];
const player = {
  storage: {},
  position: { x: 32515, y: 32346, z: 7 },
  getId: function () { return 1234; },
  getProperty: function (property) {
    return property === CONST.PROPERTIES.NAME ? "Tester" : 0;
  },
  isPlayer: function () { return true; },
  write: function (packet) { packets.push(packet.getBuffer()); },
  broadcast: function (packet) { packets.push(packet.getBuffer()); },
  sendCancelMessage: function (message) { messages.push(message); }
};

const handler = {
  getConnectedPlayers: function () { return new Set([player]); },
  isInsidePartyRadioZone: function () { return true; },
  isPlayerOnline: function () { return true; },
  announceNpcYell: function () {}
};

process.gameServer = global.gameServer = {
  world: {
    creatureHandler: handler,
    sendMagicEffect: function () {}
  }
};

handler.partyAchievements = new PartyAchievementSystem(handler);
const system = handler.partyAchievements;
system.initializePlayer(player);

assert.strictEqual(system.getOverview(player).totalCount, 12);
system.recordLavaWin(player);
assert.ok(system.getState(player).unlocked["lava-survivor"]);

system.increment(player, "bombsPlaced", 100);
system.setMaximum(player, "largestBombChain", 5);
system.recordBombermanWin(player, "mayhem", 0);
system.recordBombermanWin(player, "elimination", 1);
assert.ok(system.getState(player).unlocked["last-one-dancing"]);
assert.ok(system.getState(player).unlocked["untouchable"]);

let titleResult = system.setTitle(player, "Lava Survivor");
assert.strictEqual(titleResult.ok, true);
assert.strictEqual(system.getActiveTitle(player).title, "Lava Survivor");

const overviewPacket = new PartyAchievementPacket("overview", system.getOverview(player)).getBuffer();
assert.strictEqual(overviewPacket[0], CONST.PROTOCOL.SERVER.PARTY_ACHIEVEMENT);
const payloadLength = overviewPacket.readUInt16LE(1);
const payload = JSON.parse(overviewPacket.subarray(3, 3 + payloadLength).toString("utf8"));
assert.strictEqual(payload.action, "overview");
assert.strictEqual(payload.data.totalCount, 12);

const storedEntry = system.getLeaderboardEntry("Tester", {
  storage: { partyAchievements: system.getState(player) }
}, true);
assert.strictEqual(storedEntry.online, true);
assert.strictEqual(storedEntry.totalAchievements, 12);
assert.ok(storedEntry.unlockedCount >= 5);
const leaderboards = system.createPublicLeaderboards([
  storedEntry,
  system.getLeaderboardEntry("Listener", {
    storage: { partyAchievements: { clubTimeSeconds: 100000, unlocked: {} } }
  }, false)
], 50);
assert.strictEqual(leaderboards.partyTime[0].name, "Listener");
assert.strictEqual(leaderboards.achievements[0].name, "Tester");

const titlePacket = new CreatureTitlePacket(1234, "Bouncer's Favourite", "rare").getBuffer();
assert.strictEqual(titlePacket[0], CONST.PROTOCOL.SERVER.CREATURE_TITLE);
assert.strictEqual(titlePacket.readUInt32LE(1), 1234);

assert.ok(messages.some(function (message) { return message.indexOf("Lava Survivor") !== -1; }));
console.log("Party achievement tests passed.");
