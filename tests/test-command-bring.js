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
  isTileOccupied: () => false,
  getPosition: () => targetPosition,
  getProperty(property) {
    if (property === CONST.PROPERTIES.NAME) {
      return "Sir Testowy";
    }

    return null;
  },
};

const secondTarget = {
  isTileOccupied: () => false,
  getPosition: () => new Position(120, 121, 7),
  getProperty(property) {
    if (property === CONST.PROPERTIES.NAME) {
      return "Another Player";
    }

    return null;
  },
};

global.gameServer = process.gameServer = {
  world: {
    creatureHandler: {
      __creatureMap: new Map([[1, target], [2, secondTarget]]),
      getConnectedPlayers() {
        return new Map([
          ["God", gm],
          ["Sir Testowy", target],
          ["Another Player", secondTarget],
        ]);
      },
      teleportCreature(creature, position, options) {
        teleportCalls.push({ creature, position, options });
        return true;
      },
    },
    getTileFromWorldPosition(position) {
      return { position };
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

  commandHandler.handle(gm, "/bring all");

  assert.strictEqual(teleportCalls.length, 4);
  const allCalls = teleportCalls.slice(2);
  assert.deepStrictEqual(new Set(allCalls.map(call => call.creature)), new Set([target, secondTarget]));
  assert.strictEqual(allCalls.every(call => !call.position.equals(gmPosition)), true);
  assert.strictEqual(
    new Set(allCalls.map(call => call.position.toString())).size,
    2,
    "/bring all must assign a separate SQM to each player"
  );
  assert.strictEqual(allCalls.every(call => call.options.ignorePartyGameFlow === true), true);
  assert.strictEqual(gm.messages.at(-1), "Brought 2 of 2 players to you.");

  commandHandler.handle(gm, "/bring all2");

  assert.strictEqual(teleportCalls.length, 6);
  const stackedCalls = teleportCalls.slice(4);
  assert.strictEqual(stackedCalls.every(call => call.position.equals(gmPosition)), true);
  assert.strictEqual(stackedCalls.every(call => call.options.resyncReason === "bring-all-stacked"), true);
  assert.strictEqual(gm.messages.at(-1), "Brought 2 of 2 players onto your SQM.");

  console.log("PASS: /bring handles named, distributed-all, and stacked-all teleports.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
