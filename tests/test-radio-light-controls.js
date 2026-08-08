"use strict";

const assert = require("assert");

require("../require");

const CommandHandler = requireModule("utils/command-handler");

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;
const saved = [];

global.gameServer = process.gameServer = {
  world: {
    creatureHandler: {
      setRadioZoneAt() {
        saved.push(Array.from(arguments));
        return true;
      },
    },
  },
};

const gm = {
  position: { x: 32515, y: 32346, z: 7 },
  isGM: () => true,
  getProperty: () => "God",
  sendCancelMessage(message) {
    return message;
  },
  write(packet) {
    return packet;
  },
};

try {
  const commands = new CommandHandler();

  commands.handle(
    gm,
    "/radio set https://example.com/stream 6 8 1 disco 2 3 128 fog purple 1 0 90 175 auto 72"
  );
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0][11], true, "spotlights should be enabled");
  assert.strictEqual(saved[0][12], false, "lasers should be disabled independently");
  assert.strictEqual(saved[0][13], 90, "shared canvas intensity should be retained");
  assert.strictEqual(saved[0][14], 175, "spotlight speed slider value should be retained");
  assert.strictEqual(saved[0][15], "auto", "bass rhythm mode should be retained");
  assert.strictEqual(saved[0][16], 72, "bass sensitivity should be retained");

  // A cached pre-checkbox client sends the former aggregate flag and
  // intensity only. It must continue enabling both effects during rollout.
  commands.handle(
    gm,
    "/radio set https://example.com/stream 6 8 1 disco 2 3 128 fog purple 1 75"
  );
  assert.strictEqual(saved.length, 2);
  assert.strictEqual(saved[1][11], true);
  assert.strictEqual(saved[1][12], true);
  assert.strictEqual(saved[1][13], 75);
  assert.strictEqual(saved[1][14], 100, "legacy clients should default to Normal speed");
  assert.strictEqual(saved[1][15], "auto");
  assert.strictEqual(saved[1][16], 50);

  // A cached client with independent light toggles but without the new speed
  // slider must also keep working and receive the current normal speed.
  commands.handle(
    gm,
    "/radio set https://example.com/stream 6 8 1 disco 2 3 128 fog purple 1 0 90"
  );
  assert.strictEqual(saved.length, 3);
  assert.strictEqual(saved[2][11], true);
  assert.strictEqual(saved[2][12], false);
  assert.strictEqual(saved[2][13], 90);
  assert.strictEqual(saved[2][14], 100, "cached clients should default to Normal speed");
  assert.strictEqual(saved[2][15], "auto");
  assert.strictEqual(saved[2][16], 50);

  commands.handle(
    gm,
    "/radio set https://example.com/stream 6 8 1 disco 2 3 128 fog purple 1 0 90 173"
  );
  assert.strictEqual(saved.length, 3, "invalid slider steps must not update the radio zone");

  console.log("PASS: /radio saves independent spotlight and laser controls with legacy compatibility.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
