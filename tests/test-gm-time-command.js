"use strict";

const assert = require("assert");

require("../require");

const CommandHandler = requireModule("utils/command-handler");
const WorldClock = requireModule("core/world-clock");

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;
const originalSpeed = CONFIG.WORLD.CLOCK.SPEED;

let changedTo = null;
let currentTime = "12:34";
let messages = [];
let broadcasts = [];

const gm = {
  isGM: () => true,
  sendCancelMessage(message) {
    messages.push(message);
    return message;
  },
};

const regularPlayer = {
  isGM: () => false,
  sendCancelMessage(message) {
    return message;
  },
};

global.gameServer = process.gameServer = {
  world: {
    clock: {
      getTimeString: () => currentTime,
      changeTime(time) {
        changedTo = time;
        currentTime = time;
      },
    },
  },
};

try {
  CONFIG.WORLD.CLOCK.SPEED = 6;
  const commandHandler = new CommandHandler();

  commandHandler.handle(gm, "/time 18:30");
  assert.strictEqual(changedTo, "18:30");
  assert.strictEqual(messages.at(-1), "World time set to 18:30.");

  commandHandler.handle(gm, "/day");
  assert.strictEqual(changedTo, "15:00");

  commandHandler.handle(gm, "/night");
  assert.strictEqual(changedTo, "03:00");

  commandHandler.handle(gm, "/time status");
  assert.strictEqual(
    messages.at(-1),
    "World time: 03:00. Clock speed: 6x (full day: 240 real minutes)."
  );

  for (const invalid of ["24:00", "12:60", "7:00", "nope"]) {
    changedTo = null;
    commandHandler.handle(gm, "/time " + invalid);
    assert.strictEqual(changedTo, null);
    assert.strictEqual(messages.at(-1), "Usage: /time HH:MM or /time status");
  }

  assert.strictEqual(
    commandHandler.handle(regularPlayer, "/time 18:30"),
    "Only GMs can use game master commands."
  );

  process.gameServer = {
    world: {
      broadcastPacket(packet) {
        broadcasts.push(packet);
      },
    },
  };
  const clock = new WorldClock();
  clock.changeTime("18:30");
  assert.strictEqual(clock.getTimeString(), "18:30");
  assert.strictEqual(broadcasts.length, 1);

  console.log("PASS: GM time commands validate input and synchronize the global clock.");
} finally {
  CONFIG.WORLD.CLOCK.SPEED = originalSpeed;
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
