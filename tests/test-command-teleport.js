"use strict";

const assert = require("assert");

require("../require");

const CommandHandler = requireModule("utils/command-handler");
const Position = requireModule("utils/position");

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;

const teleportCalls = [];
const validPosition = new Position(32515, 32346, 7);

const gm = {
  messages: [],
  isGM: () => true,
  sendCancelMessage(message) {
    this.messages.push(message);
    return message;
  },
};

global.gameServer = process.gameServer = {
  world: {
    getTileFromWorldPosition(position) {
      return position.equals(validPosition) ? {} : null;
    },
    creatureHandler: {
      teleportCreature(creature, position, options) {
        teleportCalls.push({ creature, position, options });
        return true;
      },
    },
  },
};

try {
  const commandHandler = new CommandHandler();

  commandHandler.handle(gm, "/teleport 32515 32346 7");

  assert.strictEqual(teleportCalls.length, 1);
  assert.strictEqual(teleportCalls[0].creature, gm);
  assert.deepStrictEqual(teleportCalls[0].position.toJSON(), {
    x: 32515,
    y: 32346,
    z: 7,
  });
  assert.deepStrictEqual(teleportCalls[0].options, {
    ignoreFloorLava: true,
    ignoreBomberman: true,
  });
  assert.strictEqual(gm.messages.at(-1), "Teleported to 32515, 32346, 7.");

  commandHandler.handle(gm, "/teleport 32515 nope 7");
  assert.strictEqual(teleportCalls.length, 1);
  assert.strictEqual(gm.messages.at(-1), "Usage: /teleport X Y Z");

  commandHandler.handle(gm, "/teleport 1 2 3");
  assert.strictEqual(teleportCalls.length, 1);
  assert.strictEqual(
    gm.messages.at(-1),
    "There is no valid tile at that destination."
  );

  console.log("PASS: /teleport validates XYZ and bypasses minigame movement guards.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
