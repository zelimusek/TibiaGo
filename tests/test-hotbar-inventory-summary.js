"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const manager = fs.readFileSync(path.join(root, "src", "containers", "container-manager.js"), "utf8");
const hotbar = fs.readFileSync(path.join(root, "client", "src", "ui", "hotbar-manager.js"), "utf8");
const serverNetwork = fs.readFileSync(path.join(root, "src", "network", "network-manager.js"), "utf8");

assert.match(manager, /getCarriedItemSummary/, "server must build an authoritative carried inventory summary");
assert.match(manager, /visit\(this\.equipment\)/, "equipment and its nested backpacks must be counted");
assert.match(manager, /visit\(this\.keyring\)/, "the carried keyring must be counted");
assert.doesNotMatch(manager.slice(manager.indexOf("getCarriedItemSummary"), manager.indexOf("findCarriedItemByType")), /depot/, "depot must not be counted");
assert.match(hotbar, /count === 0 \? "#ff3030"/, "zero count must be rendered in red");
assert.match(hotbar, /new Item\(slot\.item\.id, 1\)/, "item icons must not depend on an opened backpack");
assert.match(serverNetwork, /INVENTORY_ITEM_USE_WITH/, "closed-container use-with must be resolved on the server");

const moduleBox = { exports: {} };
const sandbox = {
  module: moduleBox,
  requireModule() { return function Stub() {}; },
  CONST: { CONTAINER: {} },
  console
};
vm.createContext(sandbox);
vm.runInContext(manager, sandbox);
const ContainerManager = moduleBox.exports;
const nestedRune = { id: 3160, count: 37 };
const backpack = {
  id: 1988,
  count: 1,
  container: { getSlots() { return [nestedRune]; } },
  getSlots() { return this.container.getSlots(); }
};
const equipment = { container: { getSlots() { return [backpack]; } } };
const keyring = { container: { getSlots() { return [{ id: 2088, count: 2 }]; } } };
const instance = Object.create(ContainerManager.prototype);
instance.equipment = equipment;
instance.keyring = keyring;
instance.depot = { container: { getSlots() { return [{ id: 3160, count: 99 }]; } } };
const summary = instance.getCarriedItemSummary();
assert.strictEqual(summary.get(3160), 37, "closed nested stacks must be counted while depot copies are ignored");
assert.strictEqual(instance.findCarriedItemByType(3160).item, nestedRune, "server use must locate an item in a closed nested backpack");

console.log("PASS: permanent item hotkeys use the carried-inventory summary and exclude depot.");
