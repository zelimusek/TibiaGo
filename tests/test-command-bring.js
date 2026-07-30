"use strict";

const assert = require("assert");

require("../require");

const CommandHandler = requireModule("utils/command-handler");
const Position = requireModule("utils/position");

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;

const gmPosition = new Position(100, 100, 7);
const targetPosition = new Position(110, 111, 7);
const teleportCalls = [];

const gm = {
  messages: [],
  isGM: () => true,
  getPosition: () => gmPosition,
  sendCancelMessage(message) {
    this.messages.push(message);
  },
};

const target = {
  getPosition: () => targetPosition,
  getProperty(property) {
    if (property === CONST.PROPERTIES.NAME) {
      return "Sir Testowy";
    }

    return null;
  },
};

global.gameServer = process.gameServer = {
  world: {
    creatureHandler: {
      __creatureMap: new Map([[1, target]]),
      teleportCreature(creature, position) {
        teleportCalls.push({ creature, position });
        return true;
      },
    },
  },
};

try {
  const commandHandler = new CommandHandler();

  commandHandler.handle(gm, "/bring Sir Testowy");

  assert.strictEqual(teleportCalls.length, 1);
  assert.strictEqual(teleportCalls[0].creature, target);
  assert.strictEqual(teleportCalls[0].position, gmPosition);
  assert.strictEqual(gm.messages.at(-1), "Brought Sir Testowy to you.");

  commandHandler.handle(gm, "/goto Sir Testowy");

  assert.strictEqual(teleportCalls.length, 2);
  assert.strictEqual(teleportCalls[1].creature, gm);
  assert.strictEqual(teleportCalls[1].position, targetPosition);
  assert.strictEqual(gm.messages.at(-1), "Teleported to Sir Testowy.");

  commandHandler.handle(gm, "/bring Missing Player");

  assert.strictEqual(teleportCalls.length, 2);
  assert.strictEqual(gm.messages.at(-1), "Creature not found: missing player");

  console.log("PASS: /bring teleports a named creature to the GM.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
