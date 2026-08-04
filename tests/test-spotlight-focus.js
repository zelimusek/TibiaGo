"use strict";

const assert = require("assert");

require("../require");

const CreatureHandler = requireModule("core/world-creature-handler");
const CommandHandler = requireModule("utils/command-handler");
const Position = requireModule("utils/position");

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;
let resyncs = 0;

const target = {
  position: new Position(32515, 32346, 7),
  getId: () => 777,
  getProperty(property) {
    return property === CONST.PROPERTIES.NAME ? "Party Hero" : null;
  },
  is(type) {
    return type === "Player";
  },
};
const spectator = {
  position: new Position(32516, 32347, 7),
  getId: () => 778,
  getProperty(property) {
    return property === CONST.PROPERTIES.NAME ? "Club Friend" : null;
  },
  is(type) {
    return type === "Player";
  },
};
const newcomer = {
  position: new Position(32522, 32345, 7),
  getId: () => 779,
  getProperty(property) {
    return property === CONST.PROPERTIES.NAME ? "New Dancer" : null;
  },
  is(type) {
    return type === "Player";
  },
};

const handler = Object.create(CreatureHandler.prototype);
handler.__spotlightFocus = null;
handler.__creatureMap = new Map([[target.getId(), target], [spectator.getId(), spectator]]);
handler.__playerMap = new Map([["PARTY HERO", target], ["CLUB FRIEND", spectator]]);
handler.isInsidePartyRadioZone = () => true;
handler.__resyncRadioAmbience = () => { resyncs++; };

global.gameServer = process.gameServer = {
  world: { creatureHandler: handler },
};

const messages = [];
const gm = {
  isGM: () => true,
  sendCancelMessage(message) {
    messages.push(message);
    return message;
  },
};

try {
  const commands = new CommandHandler();
  commands.handle(gm, "/spotlight Party Hero");

  assert.strictEqual(handler.__spotlightFocus.targetId, 777);
  assert.strictEqual(handler.__spotlightFocus.endsAt, null);
  assert.strictEqual(handler.__spotlightFocus.flashDurationMs, 0);
  assert.strictEqual(handler.__spotlightFocus.flashCount, 0);
  assert.strictEqual(handler.__spotlightFocus.includeLasers, false);
  assert.strictEqual(resyncs, 1);
  assert.ok(/following Party Hero until \/spotlight off/i.test(messages.at(-1)));

  target.position = new Position(32517, 32348, 7);
  const payload = handler.__getSpotlightFocusPayload();
  assert.deepStrictEqual(payload.targetPosition, { x: 32517, y: 32348, z: 7 });
  assert.strictEqual(payload.persistent, true);
  assert.strictEqual(payload.durationMs, null);
  assert.ok(payload.elapsedMs >= 0);

  commands.handle(gm, "/spotlight off");
  assert.strictEqual(handler.__spotlightFocus, null);
  assert.strictEqual(resyncs, 2);

  commands.handle(gm, "/spotlights Party Hero 10");
  assert.strictEqual(handler.__spotlightFocus.endsAt - handler.__spotlightFocus.startedAt, 10000);
  assert.strictEqual(handler.__spotlightFocus.flashCount, 0);
  assert.strictEqual(handler.__spotlightFocus.includeLasers, true);
  assert.ok(/spotlights and lasers are now following Party Hero for 10 seconds/i.test(messages.at(-1)));
  commands.handle(gm, "/spotlights off");

  const celebration = handler.celebratePartyWinner(target);
  assert.strictEqual(celebration.ok, true);
  assert.strictEqual(handler.__spotlightFocus.endsAt - handler.__spotlightFocus.startedAt, 11200);
  assert.strictEqual(handler.__spotlightFocus.flashDurationMs, 3000);
  assert.strictEqual(handler.__spotlightFocus.flashCount, 3);
  assert.strictEqual(handler.__spotlightFocus.includeLasers, true);
  handler.clearSpotlightFocus();

  commands.handle(gm, "/show Party Hero fire intense");
  assert.strictEqual(handler.__spotlightFocus.source, "vip-show");
  assert.strictEqual(handler.__spotlightFocus.includeLasers, true);
  assert.strictEqual(handler.__spotlightFocus.endsAt - handler.__spotlightFocus.startedAt, 12000);
  assert.deepStrictEqual(handler.__spotlightFocus.vipShow, {
    effect: "laser",
    preset: "fire",
    intensity: "intense",
    crowd: false,
    participants: [{ targetId: 778, targetName: "Club Friend", target: spectator }]
  });
  assert.ok(/laser show in fire style \(intense\)/i.test(messages.at(-1)));
  assert.strictEqual(handler.__getSpotlightFocusPayload().vipShow.preset, "fire");
  assert.strictEqual(handler.__getSpotlightFocusPayload().vipShow.effect, "laser");
  assert.strictEqual(handler.__getSpotlightFocusPayload().vipShow.title, undefined, "show payloads must contain no projection title");
  assert.deepStrictEqual(handler.__getSpotlightFocusPayload().vipShow.participants[0].targetPosition, {
    x: 32516, y: 32347, z: 7
  });
  commands.handle(gm, "/show status");
  assert.ok(/Party Hero has the laser show in fire style/i.test(messages.at(-1)));
  commands.handle(gm, "/show stop");
  assert.strictEqual(handler.__spotlightFocus, null);
  assert.ok(/VIP show stopped/i.test(messages.at(-1)));

  commands.handle(gm, "/show effects");
  assert.ok(/hologram.*discoball.*all/i.test(messages.at(-1)));

  commands.handle(gm, "/show Party Hero vortex toxic soft");
  assert.strictEqual(handler.__spotlightFocus.vipShow.effect, "vortex");
  assert.strictEqual(handler.__spotlightFocus.vipShow.preset, "toxic");
  assert.strictEqual(handler.__spotlightFocus.vipShow.intensity, "soft");
  handler.clearSpotlightFocus();

  commands.handle(gm, "/show Party Hero disco romance");
  assert.strictEqual(handler.__spotlightFocus.vipShow.effect, "discoball", "friendly effect aliases should work");
  handler.clearSpotlightFocus();

  commands.handle(gm, "/show Party Hero all");
  assert.strictEqual(handler.__spotlightFocus.vipShow.effect, "all");
  assert.strictEqual(handler.__spotlightFocus.endsAt - handler.__spotlightFocus.startedAt, 54000);
  assert.ok(/all show in rainbow style/i.test(messages.at(-1)));
  handler.clearSpotlightFocus();

  commands.handle(gm, "/show Party Hero circuit");
  assert.strictEqual(handler.__spotlightFocus, null, "circuit must not start as a targeted solo show");
  assert.ok(/crowd-only/i.test(messages.at(-1)));

  commands.handle(gm, "/show crowd all fire intense");
  assert.strictEqual(handler.__spotlightFocus.source, "vip-crowd-show");
  assert.strictEqual(handler.__spotlightFocus.vipShow.crowd, true);
  assert.strictEqual(handler.__spotlightFocus.vipShow.effect, "all");
  assert.strictEqual(handler.__spotlightFocus.vipShow.participants.length, 2);
  assert.strictEqual(handler.__spotlightFocus.endsAt - handler.__spotlightFocus.startedAt, 54000);
  assert.ok(/started for 2 dancers/i.test(messages.at(-1)));
  assert.strictEqual(handler.__getSpotlightFocusPayload().vipShow.crowd, true);

  handler.__playerMap.set("NEW DANCER", newcomer);
  handler.__creatureMap.set(newcomer.getId(), newcomer);
  assert.strictEqual(handler.__refreshCrowdShowParticipants(), false);
  assert.strictEqual(handler.__spotlightFocus.vipShow.participants.length, 2, "a player outside the exact 13x13 floor must not join the show");
  newcomer.position = new Position(32521, 32345, 7);
  assert.strictEqual(handler.__refreshCrowdShowParticipants(), true);
  assert.strictEqual(handler.__spotlightFocus.vipShow.participants.length, 3, "a player entering during the show must join it");

  handler.__playerMap.delete("PARTY HERO");
  handler.__creatureMap.delete(target.getId());
  assert.strictEqual(handler.__refreshCrowdShowParticipants(), true);
  assert.notStrictEqual(handler.__spotlightFocus.targetId, target.getId(), "the crowd show must choose a new anchor when its first dancer leaves");
  assert.strictEqual(handler.__spotlightFocus.vipShow.participants.length, 2);
  commands.handle(gm, "/show status");
  assert.ok(/Crowd all show.*2 dancers/i.test(messages.at(-1)));
  commands.handle(gm, "/show stop");
  handler.__playerMap.set("PARTY HERO", target);
  handler.__creatureMap.set(target.getId(), target);
  handler.__playerMap.delete("NEW DANCER");
  handler.__creatureMap.delete(newcomer.getId());

  commands.handle(gm, "/show crowd circuit ice intense");
  assert.strictEqual(handler.__spotlightFocus.vipShow.effect, "circuit");
  assert.strictEqual(handler.__spotlightFocus.vipShow.crowd, true);
  assert.strictEqual(handler.__spotlightFocus.vipShow.participants.length, 2);
  assert.ok(/Crowd circuit show started for 2 dancers/i.test(messages.at(-1)));
  commands.handle(gm, "/show stop");

  handler.isInsidePartyRadioZone = () => false;
  commands.handle(gm, "/spotlight Party Hero");
  assert.strictEqual(handler.__spotlightFocus, null);
  assert.ok(/inside the dance hall/i.test(messages.at(-1)));

  console.log("PASS: manual spotlight focus, targeted shows and dynamic crowd shows synchronize correctly.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
