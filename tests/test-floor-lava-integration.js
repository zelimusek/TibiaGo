"use strict";

const assert = require("assert");

require("../require");

const CommandHandler = requireModule("utils/command-handler");
const CreatureHandler = requireModule("core/world-creature-handler");
const Position = requireModule("utils/position");

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;

let startCalls = 0;
let stopCalls = 0;
let redirectedPosition = null;
let redirectOptions = null;

const audiencePosition = new Position(32507, 32343, 7);

global.gameServer = process.gameServer = {
  world: {
    creatureHandler: {
      floorLava: {
        start() {
          startCalls++;
          return { ok: true, message: "started" };
        },
        stop() {
          stopCalls++;
          return { ok: true, message: "stopped" };
        },
        getStatus() {
          return "test status";
        },
      },
    },
  },
};

try {
  const commandHandler = new CommandHandler();
  const gm = {
    messages: [],
    isGM: () => true,
    sendCancelMessage(message) {
      this.messages.push(message);
    },
  };

  assert.strictEqual(commandHandler.handle(gm, "/lava start"), true);
  assert.strictEqual(startCalls, 1);
  assert.strictEqual(commandHandler.handle(gm, "/lava stop"), true);
  assert.strictEqual(stopCalls, 1);
  commandHandler.handle(gm, "/lava status");
  assert.strictEqual(gm.messages.at(-1), "test status");

  const movementHandler = Object.create(CreatureHandler.prototype);
  movementHandler.floorLava = {
    handleDestination() {
      return { position: audiencePosition, eliminated: true };
    },
  };
  movementHandler.teleportCreature = function (creature, position, options) {
    redirectedPosition = position;
    redirectOptions = options;
    return true;
  };

  const player = {
    isPlayer: () => true,
  };

  assert.strictEqual(
    movementHandler.moveCreature(player, new Position(32509, 32340, 7)),
    true
  );
  assert.strictEqual(redirectedPosition, audiencePosition);
  assert.deepStrictEqual(redirectOptions, { ignoreFloorLava: true });

  console.log(
    "PASS: /lava commands are routed and blocked movement redirects through a safe teleport."
  );
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
