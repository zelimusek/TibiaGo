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

const handler = Object.create(CreatureHandler.prototype);
handler.__spotlightFocus = null;
handler.__creatureMap = new Map([[target.getId(), target]]);
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
    preset: "fire",
    intensity: "intense",
    title: "DANCE FLOOR STAR!"
  });
  assert.ok(/fire VIP laser show \(intense\)/i.test(messages.at(-1)));
  assert.strictEqual(handler.__getSpotlightFocusPayload().vipShow.preset, "fire");
  commands.handle(gm, "/show status");
  assert.ok(/Party Hero has the fire VIP show/i.test(messages.at(-1)));
  commands.handle(gm, "/show stop");
  assert.strictEqual(handler.__spotlightFocus, null);
  assert.ok(/VIP laser show stopped/i.test(messages.at(-1)));

  handler.isInsidePartyRadioZone = () => false;
  commands.handle(gm, "/spotlight Party Hero");
  assert.strictEqual(handler.__spotlightFocus, null);
  assert.ok(/inside the dance hall/i.test(messages.at(-1)));

  console.log("PASS: manual spotlight focus, winner celebrations and targeted VIP shows synchronize correctly.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
