"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function Tile(creature) {
  this.creature = creature;
}

Tile.prototype.getCreature = function () {
  return this.creature;
};

let serverHandlerSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "network", "packet-handler.js"),
  "utf8"
);
let lookResolver = serverHandlerSource.match(
  /PacketHandler\.prototype\.__getLookCreature = function \(which\) \{[\s\S]*?\n\};/
);
assert.ok(lookResolver, "The dead-creature Look resolver should exist.");
let serverContext = vm.createContext({ PacketHandler: function () {} });
vm.runInContext(lookResolver[0], serverContext);

let handler = Object.create(serverContext.PacketHandler.prototype);
let living = { isDead: false, isZeroHealth() { return false; } };
let dead = { isDead: true, isZeroHealth() { return true; } };
let zeroHealth = { isDead: false, isZeroHealth() { return true; } };

assert.strictEqual(handler.__getLookCreature(new Tile(living)), living);
assert.strictEqual(handler.__getLookCreature(new Tile(dead)), null);
assert.strictEqual(handler.__getLookCreature(new Tile(zeroHealth)), null);

let clientRoot = path.join(__dirname, "..", "client");
let context = vm.createContext({
  console: console,
  document: {},
  gameClient: {}
});

let conditionSource = fs.readFileSync(path.join(clientRoot, "src", "entities", "condition.js"), "utf8");
vm.runInContext(conditionSource + "\nthis.ConditionManager = ConditionManager;", context);
let statusSource = fs.readFileSync(path.join(clientRoot, "src", "ui", "status-bar.js"), "utf8");
vm.runInContext(statusSource + "\nthis.StatusBar = StatusBar;", context);

let combatCondition = context.ConditionManager.prototype.COMBAT_LOCK;
assert.strictEqual(combatCondition, 17);
assert.strictEqual(context.StatusBar.prototype.STATUS.get(combatCondition).title, "You are in a fight.");
assert.strictEqual(context.StatusBar.prototype.STATUS.get(combatCondition).src, "/png/status/status-combat.png");
assert.ok(fs.existsSync(path.join(clientRoot, "png", "status", "status-combat.png")));

console.log("PASS: dead-player Look fallback and in-fight status icon.");
