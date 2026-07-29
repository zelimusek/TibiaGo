"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const worldFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "core",
  "world.js"
);

const packets = [];
const targets = [];
const monster = {
  id: 1234,
  constructor: { name: "Creature" },
};

const player = {
  target: null,
  isCreatureTarget(creature) {
    return this.target === creature;
  },
  setTarget(creature) {
    this.target = creature;
    targets.push(creature);
  },
};

function TargetPacket(id) {
  this.id = id;
}

const context = vm.createContext({
  console,
  Chunk: function () {},
  Pathfinder: function () {},
  Clock: function () {},
  TargetPacket,
  gameClient: {
    player,
    send(packet) {
      packets.push(packet.id);
    },
    interface: {
      notificationManager: {
        setCancelMessage() {},
      },
    },
  },
});

context.Chunk.prototype.WIDTH = 1;
context.Chunk.prototype.HEIGHT = 1;
context.Chunk.prototype.DEPTH = 1;

vm.runInContext(
  fs.readFileSync(worldFile, "utf8") + "\nthis.World = World;",
  context,
  { filename: worldFile }
);

const world = Object.create(context.World.prototype);

assert.strictEqual(world.toggleCreatureTarget(monster), true);
assert.strictEqual(player.target, monster);
assert.deepStrictEqual(packets, [1234]);

assert.strictEqual(world.toggleCreatureTarget(monster), false);
assert.strictEqual(player.target, null);
assert.deepStrictEqual(packets, [1234, 0]);
assert.deepStrictEqual(targets, [monster, null]);

const touchSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "input", "touch.js"),
  "utf8"
);
const battleSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "ui", "window-battle.js"),
  "utf8"
);

assert.match(
  touchSource,
  /getOtherCreatures\(tileObject\.which\)[\s\S]*?targetMonster\(otherCreatures\)/,
  "A regular mobile tap on an occupied tile must target its creature."
);
assert.strictEqual(
  (battleSource.match(/toggleCreatureTarget\(creature\)/g) || []).length,
  2,
  "Desktop and mobile Battle List taps must both use target toggling."
);

console.log("PASS: creature targeting toggles on repeated map and Battle List taps.");
