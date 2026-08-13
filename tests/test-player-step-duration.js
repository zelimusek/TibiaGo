"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

require("../require");

const Creature = requireModule("entities/creature");
const CreatureProperties = requireModule("entities/creature-properties");
const Player = requireModule("player/player");

function calculateServerStepDuration(speed, friction) {
  const A = 857.36;
  const B = 261.29;
  const C = -4795.009;
  const calculatedStepSpeed = Math.max(
    1,
    Math.round(A * Math.log(speed + B) + C)
  );

  return Math.max(
    1,
    Math.ceil(
      Math.floor((1000 * friction) / calculatedStepSpeed) /
        CONFIG.SERVER.MS_TICK_INTERVAL
    )
  );
}

(function testCreaturePropertiesAcceptsAnExplicitSpeed() {
  const properties = Object.create(CreatureProperties.prototype);
  let storedSpeedReads = 0;

  properties.getProperty = function (type) {
    assert.strictEqual(type, CONST.PROPERTIES.SPEED);
    storedSpeedReads += 1;
    return 110;
  };

  assert.strictEqual(
    properties.getStepDuration(150),
    calculateServerStepDuration(110, 150),
    "the default creature calculation must keep using its stored speed"
  );
  assert.strictEqual(storedSpeedReads, 1);

  assert.strictEqual(
    properties.getStepDuration(150, 249),
    calculateServerStepDuration(249, 150),
    "an explicit dynamic speed must drive the step-duration calculation"
  );
  assert.strictEqual(
    storedSpeedReads,
    1,
    "an explicit speed must not fall back to the stored creature property"
  );

  assert.strictEqual(
    properties.getStepDuration(1, 100000),
    1,
    "server movement duration must never fall below one tick"
  );
})();

(function testPlayerRoutesEveryStepThroughDynamicSpeed() {
  const player = Object.create(Player.prototype);
  const calls = [];
  let dynamicSpeed = 249;

  player.getSpeed = function () {
    return dynamicSpeed;
  };
  player.properties = {
    getStepDuration() {
      const args = Array.from(arguments);
      calls.push(args);
      return args[1];
    },
  };

  assert.notStrictEqual(
    Player.prototype.getStepDuration,
    Creature.prototype.getStepDuration,
    "players need their own step-duration route"
  );
  assert.strictEqual(player.getStepDuration(150), 249);

  dynamicSpeed = 299;
  assert.strictEqual(player.getStepDuration(150), 299);
  assert.deepStrictEqual(
    calls,
    [
      [150, 249],
      [150, 299],
    ],
    "the player override must read getSpeed() for every step"
  );
})();

(function testNonPlayerKeepsTheStoredSpeedPath() {
  const creature = Object.create(Creature.prototype);
  let receivedArguments = null;

  creature.getSpeed = function () {
    throw new Error("non-player movement must not request a dynamic speed");
  };
  creature.properties = {
    getStepDuration() {
      receivedArguments = Array.from(arguments);
      return 7;
    },
  };

  assert.strictEqual(creature.getStepDuration(150), 7);
  assert.deepStrictEqual(
    receivedArguments,
    [150],
    "monsters and NPCs must keep calling the calculator without an override"
  );
})();

(function testClientTreatsStateSpeedAsAuthoritativeDuringHaste() {
  function ClientCreature() {}
  ClientCreature.prototype = {};

  function ClientConditionManager() {}
  ClientConditionManager.prototype.HASTE = 1;

  const context = vm.createContext({
    console,
    Creature: ClientCreature,
    Equipment: function Equipment() {},
    Spellbook: function Spellbook() {},
    Friendlist: function Friendlist() {},
    Skills: function Skills() {},
    ConditionManager: ClientConditionManager,
    gameClient: {
      getTickInterval() {
        return 50;
      },
    },
  });
  const playerFile = path.join(
    __dirname,
    "..",
    "client",
    "src",
    "entities",
    "player.js"
  );

  vm.runInContext(
    fs.readFileSync(playerFile, "utf8") + "\nthis.ClientPlayer = Player;",
    context,
    { filename: playerFile }
  );

  const player = Object.create(context.ClientPlayer.prototype);
  player.state = { speed: 249 };
  player.hasCondition = function (condition) {
    return condition === ClientConditionManager.prototype.HASTE;
  };

  assert.strictEqual(
    player.getSpeed(),
    249,
    "state.speed already includes haste and must not be multiplied again"
  );
  assert.strictEqual(
    player.getStepDuration({ getFriction: () => 150 }),
    calculateServerStepDuration(249, 150),
    "client prediction must use the same authoritative speed as the server"
  );

  player.state.speed = 110;
  const slowDuration = calculateServerStepDuration(110, 200);
  assert.ok(slowDuration > 12, "the slow-speed fixture must exceed the old cap");
  assert.strictEqual(
    player.getStepDuration({ getFriction: () => 200 }),
    slowDuration,
    "slow client prediction must not be truncated to twelve ticks"
  );

  const ServerPosition = requireModule("utils/position");
  assert.strictEqual(
    new ServerPosition(100, 100, 7).getPlayerWalkDuration(
      new ServerPosition(101, 101, 7),
      slowDuration
    ),
    slowDuration * 3,
    "the uncapped slow duration must receive the diagonal multiplier once"
  );

  player.state.speed = 100000;
  assert.strictEqual(
    player.getStepDuration({ getFriction: () => 1 }),
    1,
    "client prediction must use the same one-tick lower bound as the server"
  );
})();

console.log(
  "PASS: player steps use dynamic server speed without double-applying client haste."
);
