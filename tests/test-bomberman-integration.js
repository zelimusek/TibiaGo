"use strict";

const assert = require("assert");

require("../require");

const CommandHandler = requireModule("utils/command-handler");
const CreatureHandler = requireModule("core/world-creature-handler");
const PlayerMovementHandler = requireModule("player/player-movement-handler");
const Position = requireModule("utils/position");

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;

let startCalls = 0;
let stopCalls = 0;
let bombCalls = 0;
let startMode = null;
let redirectedPosition = null;
let redirectOptions = null;
const audiencePosition = new Position(32507, 32343, 7);

global.gameServer = process.gameServer = {
  world: {
    creatureHandler: {
      bomberman: {
        start(mode) {
          startCalls++;
          startMode = mode;
          return { ok: true, message: "started" };
        },
        stop() {
          stopCalls++;
          return { ok: true, message: "stopped" };
        },
        getStatus() {
          return "bomber test status";
        },
        placeBomb() {
          bombCalls++;
          return { ok: true, message: "placed" };
        },
      },
    },
  },
};

try {
  const commandHandler = new CommandHandler();
  const messages = [];
  const gm = {
    isGM: () => true,
    sendCancelMessage(message) {
      messages.push(message);
    },
  };
  const regularPlayer = {
    isGM: () => false,
    sendCancelMessage(message) {
      messages.push(message);
    },
  };

  assert.strictEqual(commandHandler.handle(gm, "/bomber start elimination"), true);
  assert.strictEqual(startCalls, 1);
  assert.strictEqual(startMode, "elimination");
  assert.strictEqual(commandHandler.handle(gm, "/bomber stop"), true);
  assert.strictEqual(stopCalls, 1);
  commandHandler.handle(gm, "/bomber status");
  assert.strictEqual(messages.at(-1), "bomber test status");

  assert.strictEqual(commandHandler.handle(regularPlayer, "/bomb"), true);
  assert.strictEqual(bombCalls, 1);
  commandHandler.handle(regularPlayer, "/bomber start");
  assert.match(messages.at(-1), /Only GMs/i);

  const movementHandler = Object.create(CreatureHandler.prototype);
  movementHandler.floorLava = {
    handleDestination() {
      return null;
    },
  };
  movementHandler.bomberman = {
    handleDestination() {
      return { position: audiencePosition };
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
  assert.deepStrictEqual(redirectOptions, { ignoreBomberman: true });

  let correctionOptions = null;
  let currentPosition = {
    getPositionFromDirection() {
      return destinationPosition;
    },
    isDiagonal() {
      return false;
    },
  };
  let destinationPosition = {
    isDiagonal() {
      return false;
    },
  };
  const bufferedMovement = Object.create(PlayerMovementHandler.prototype);
  bufferedMovement.__player = {
    isDead: false,
    position: currentPosition,
    getPosition() {
      return currentPosition;
    },
    getStepDuration() {
      return 100;
    },
  };
  bufferedMovement.__moveLock = {
    isLocked() {
      return false;
    },
    lock() {},
  };
  gameServer.world.getTileFromWorldPosition = function () {
    return {
      id: 1,
      getFriction() {
        return 100;
      },
    };
  };
  gameServer.world.creatureHandler = {
    moveCreature() {
      return false;
    },
    teleportCreature(creature, position, options) {
      assert.strictEqual(creature, bufferedMovement.__player);
      assert.strictEqual(position, currentPosition);
      correctionOptions = options;
      return true;
    },
  };

  bufferedMovement.handleMovement(0);
  assert.deepStrictEqual(correctionOptions, {
    ignoreFloorLava: true,
    ignoreBomberman: true,
  });

  console.log(
    "PASS: Bomberman commands, arena redirects and blocked-movement resync are integrated."
  );
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
