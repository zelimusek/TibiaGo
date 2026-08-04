"use strict";

const assert = require("assert");
require("../require");

const CommandHandler = requireModule("utils/command-handler");
const CreatureHandler = requireModule("core/world-creature-handler");
const Position = requireModule("utils/position");

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;
let starts = 0;
let stops = 0;

global.gameServer = process.gameServer = {
  world: {
    creatureHandler: {
      laserChairs: {
        start() { starts++; return { ok: true, message: "started" }; },
        stop() { stops++; return { ok: true, message: "stopped" }; },
        getStatus() { return "chairs test status"; }
      }
    }
  }
};

try {
  const commandHandler = new CommandHandler();
  const gm = {
    messages: [],
    isGM: () => true,
    sendCancelMessage(message) { this.messages.push(message); }
  };
  assert.strictEqual(commandHandler.handle(gm, "/chair"), true, "/chair without arguments must start the game");
  assert.strictEqual(commandHandler.handle(gm, "/chairs start"), true, "/chairs must be a full alias");
  assert.strictEqual(starts, 2);
  assert.strictEqual(commandHandler.handle(gm, "/chair stop"), true);
  assert.strictEqual(stops, 1);
  commandHandler.handle(gm, "/chairs status");
  assert.strictEqual(gm.messages.at(-1), "chairs test status");

  const movementHandler = Object.create(CreatureHandler.prototype);
  movementHandler.partyBouncers = null;
  movementHandler.floorLava = { handleDestination: () => null };
  movementHandler.bomberman = { handleDestination: () => null };
  movementHandler.laserChairs = {
    handleDestination() { return { position: null }; }
  };
  const player = { isPlayer: () => true };
  assert.strictEqual(
    movementHandler.moveCreature(player, new Position(32508, 32340, 7)),
    false,
    "a participant must not be able to cross the laser floor boundary"
  );

  console.log("PASS: /chair and /chairs route to one game and its movement guard seals the floor.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
