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

assert.strictEqual(system.getOverview(player).totalCount, 15);
for (let index = 0; index < 20; index++) system.recordLavaWin(player);
assert.ok(system.getState(player).unlocked["lava-survivor"]);
assert.ok(system.getState(player).unlocked["hot-feet"]);

system.increment(player, "bombsPlaced", 790);
system.setMaximum(player, "largestBombChain", 12);
for (let index = 0; index < 10; index++) {
  system.recordBombermanWin(player, "mayhem", index < 5 ? 0 : 1);
  system.recordBombermanWin(player, "elimination", 1);
  system.recordLaserChairsWin(player);
}
system.increment(player, "danceFloorSeconds", 36000);
system.increment(player, "partyVisitDays", 29);
system.increment(player, "pipeUses", 500);
system.increment(player, "bouncerPasses", 25);
assert.ok(system.getState(player).unlocked["triple-crown"]);
assert.ok(system.getState(player).unlocked["untouchable"]);
assert.ok(system.getState(player).unlocked["chair-dancer"]);
assert.ok(system.getState(player).unlocked["chair-champion"]);
assert.ok(system.getState(player).unlocked["party-legend"]);

let titleResult = system.setTitle(player, "Lava Survivor");
assert.strictEqual(titleResult.ok, true);
assert.strictEqual(system.getActiveTitle(player).title, "Lava Survivor");

const overviewPacket = new PartyAchievementPacket("overview", system.getOverview(player)).getBuffer();
assert.strictEqual(overviewPacket[0], CONST.PROTOCOL.SERVER.PARTY_ACHIEVEMENT);
const payloadLength = overviewPacket.readUInt16LE(1);
const payload = JSON.parse(overviewPacket.subarray(3, 3 + payloadLength).toString("utf8"));
assert.strictEqual(payload.action, "overview");
assert.strictEqual(payload.data.totalCount, 15);
const bombProgress = payload.data.achievements.find(function (entry) { return entry.id === "bomb-maniac"; });
assert.strictEqual(bombProgress.progress, 790, "unlocked lifetime progress must not be capped at its target");
assert.strictEqual(bombProgress.target, 500);
const crownProgress = payload.data.achievements.find(function (entry) { return entry.id === "triple-crown"; });
assert.strictEqual(crownProgress.progressDetails.length, 4);
assert.strictEqual(crownProgress.progressDetails[3].progress, 10);

const storedEntry = system.getLeaderboardEntry("Tester", {
  storage: { partyAchievements: system.getState(player) }
}, true);
assert.strictEqual(storedEntry.online, true);
assert.strictEqual(storedEntry.totalAchievements, 15);
assert.strictEqual(storedEntry.unlockedCount, 15);
const leaderboards = system.createPublicLeaderboards([
  storedEntry,
  system.getLeaderboardEntry("Listener", {
    storage: { partyAchievements: { clubTimeSeconds: 100000, unlocked: {} } }
  }, false),
  { name: "Newcomer", seconds: 1799, clubRank: "Newcomer", unlockedCount: 1, totalAchievements: 15, online: false },
  { name: "Empty Guest", seconds: 1800, clubRank: "Party Guest", unlockedCount: 0, totalAchievements: 15, online: false }
], 50);
assert.strictEqual(leaderboards.partyTime[0].name, "Listener");
assert.strictEqual(leaderboards.achievements[0].name, "Tester");
assert.strictEqual(leaderboards.partyTime.some(function (entry) { return entry.name === "Newcomer"; }), false,
  "Party Time must hide players below Party Guest");
assert.strictEqual(leaderboards.partyTime.some(function (entry) { return entry.name === "Empty Guest"; }), true,
  "Party Time must include Party Guest even without achievements");
assert.strictEqual(leaderboards.achievements.some(function (entry) { return entry.name === "Newcomer"; }), true,
  "Achievements must include every player with at least one unlock");
assert.strictEqual(leaderboards.achievements.some(function (entry) { return entry.name === "Empty Guest"; }), false,
  "Achievements must hide players without an unlock");

const legacyPlayer = {
  storage: {
    partyAchievements: {
      counters: { bombsPlaced: 120 },
      unlocked: { "bomb-maniac": "2026-01-01T00:00:00.000Z" },
      activeTitle: "bomb-maniac",
      visitDates: [],
      rulesetVersion: 1
    }
  }
};
system.preparePlayer(legacyPlayer);
assert.strictEqual(legacyPlayer.storage.partyAchievements.counters.bombsPlaced, 120);
assert.strictEqual(Boolean(legacyPlayer.storage.partyAchievements.unlocked["bomb-maniac"]), false,
  "a legacy unlock below the new target must be relocked without losing its counter"
);
assert.strictEqual(legacyPlayer.storage.partyAchievements.activeTitle, null);

const titlePacket = new CreatureTitlePacket(1234, "Bouncer's Favourite", "rare").getBuffer();
assert.strictEqual(titlePacket[0], CONST.PROTOCOL.SERVER.CREATURE_TITLE);
assert.strictEqual(titlePacket.readUInt32LE(1), 1234);

assert.ok(messages.some(function (message) { return message.indexOf("Lava Survivor") !== -1; }));
console.log("Party achievement tests passed.");
