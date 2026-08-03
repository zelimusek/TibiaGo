"use strict";

const assert = require("assert");

require("../require");

const CreatureHandler = requireModule("core/world-creature-handler");
const CommandHandler = requireModule("utils/command-handler");

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;
let resyncs = 0;

const handler = Object.create(CreatureHandler.prototype);
handler.__laserShow = null;
handler.__spotlightFocus = { targetId: 1 };
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
  commands.handle(gm, "/lasershow");
  assert.strictEqual(handler.__laserShow.mode, "default");
  assert.strictEqual(handler.__laserShow.text, "CYRK");
  assert.strictEqual(handler.__laserShow.endsAt - handler.__laserShow.startedAt, 35000);
  assert.strictEqual(handler.__spotlightFocus, null, "a laser show should replace a conflicting player focus");
  assert.ok(/35-second CYRK laser show/i.test(messages.at(-1)));

  const payload = handler.__getLaserShowPayload();
  assert.strictEqual(payload.mode, "default");
  assert.strictEqual(payload.text, "CYRK");
  assert.strictEqual(payload.durationMs, 35000);
  assert.ok(payload.elapsedMs >= 0);

  commands.handle(gm, "/lasershow status");
  assert.ok(/CYRK.*remaining/i.test(messages.at(-1)));
  commands.handle(gm, "/lasershow off");
  assert.ok(handler.__laserShow.endsAt - Date.now() <= 1300);
  assert.ok(/finishing smoothly/i.test(messages.at(-1)));

  commands.handle(gm, "/lasershow text PARTY ZONE");
  assert.strictEqual(handler.__laserShow.mode, "text");
  assert.strictEqual(handler.__laserShow.text, "PARTY ZONE");
  assert.strictEqual(handler.__laserShow.endsAt - handler.__laserShow.startedAt, 23600);
  assert.ok(/drawing 'PARTY ZONE'/i.test(messages.at(-1)));

  const previousShow = handler.__laserShow;
  commands.handle(gm, "/lasershow text THIS TEXT IS TOO LONG");
  assert.strictEqual(handler.__laserShow, previousShow, "invalid text must not replace the active show");
  assert.ok(/at most 12 characters/i.test(messages.at(-1)));
  assert.ok(resyncs >= 3);

  console.log("PASS: /lasershow starts, synchronizes, validates, reports and fades default or custom text shows.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
