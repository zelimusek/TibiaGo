"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function Creature() {}
Creature.prototype = {};

const context = vm.createContext({
  console,
  Creature,
  Equipment: function Equipment() {},
  Spellbook: function Spellbook() {},
  ConditionManager: function ConditionManager() {},
  window: {},
});
context.ConditionManager.prototype.HASTE = 1;

const playerFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "entities",
  "player.js"
);
vm.runInContext(
  fs.readFileSync(playerFile, "utf8") + "\nthis.Player = Player;",
  context,
  { filename: playerFile }
);

const player = Object.create(context.Player.prototype);
player.__movementBuffer = null;
player.__directionMovementBuffer = null;
player.__serverWalkConfirmation = false;
player.isMoving = () => false;
player.getMovingFraction = () => 0.5;

const resumed = [];
context.gameClient = {
  renderer: {
    updateTileCache() {},
  },
  keyboard: {
    handleCharacterMovement(key) {
      resumed.push(["key", key]);
    },
    handleMoveKey(direction) {
      resumed.push(["direction", direction]);
    },
  },
  mouse: {
    handlePendingActions() {
      return false;
    },
  },
  world: {
    pathfinder: {
      __pathfindCache: [],
      __finalDestination: null,
      handlePathfind() {
        throw new Error("Unexpected path continuation");
      },
    },
  },
};

player.setMovementBuffer(37);
player.setMovementBuffer(38);
assert.strictEqual(player.consumeMovementBuffer(), false);
assert.deepStrictEqual(resumed, []);

player.confirmClientWalk();
assert.deepStrictEqual(resumed, [["key", 38]]);
assert.strictEqual(player.__movementBuffer, null);

player.__serverWalkConfirmation = false;
player.setDirectionMovementBuffer(1);
player.setDirectionMovementBuffer(3);
player.confirmClientWalk();
assert.deepStrictEqual(resumed, [["key", 38], ["direction", 3]]);

player.__serverWalkConfirmation = false;
player.setDirectionMovementBuffer(2);
player.clearDirectionMovementBuffer();
player.confirmClientWalk();
assert.deepStrictEqual(
  resumed,
  [["key", 38], ["direction", 3]],
  "Releasing the joystick must prevent an extra buffered step."
);

player.__serverWalkConfirmation = false;
player.setMovementBuffer(39);
player.isMoving = () => true;
player.confirmClientWalk();
assert.strictEqual(player.__movementBuffer, 39);
player.isMoving = () => false;
assert.strictEqual(player.consumeMovementBuffer(), true);
assert.deepStrictEqual(resumed[resumed.length - 1], ["key", 39]);

console.log(
  "PASS: one-slot movement buffering survives latency and clears on release."
);
