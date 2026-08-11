"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let storedHotbar = JSON.stringify([
  { itemId: 3160, mode: "self" }
]);
let spriteDraws = 0;
const drawingContext = {
  save() {}, restore() {}, strokeText() {}, fillText() {}
};

const slot = {
  spell: null,
  text: null,
  item: null,
  canvas: {
    clear() {},
    drawSprite() { spriteDraws++; },
    context: drawingContext,
    canvas: {
      parentNode: {
        lastElementChild: { style: {} },
        title: ""
      }
    }
  }
};

const context = {
  console,
  Image: function () { return {}; },
  Item: function (id, count) { this.id = id; this.count = count; },
  Position: function (x, y, z) { this.x = x; this.y = y; this.z = z; },
  localStorage: {
    getItem(key) { return key === "hotbar" ? storedHotbar : null; },
    setItem(key, value) {
      if (key === "hotbar") storedHotbar = value;
    }
  },
  gameClient: {
    player: null,
    inventoryCounts: new Map(),
    itemDefinitions: {
      3160: { properties: { name: "ultimate healing rune" } }
    },
    dataObjects: null
  }
};

vm.createContext(context);
const source = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "ui", "hotbar-manager.js"),
  "utf8"
);
vm.runInContext(
  "String.prototype.capitalize = function () { return this.toString(); };\n" +
  "String.prototype.format = function () { return this.toString(); };\n" +
  source +
  "\nthis.HotbarManager = HotbarManager;",
  context
);

const manager = Object.create(context.HotbarManager.prototype);
manager.slots = [slot];

assert.doesNotThrow(
  () => manager.__loadConfiguration(new Set()),
  "a saved item hotkey must not abort Player construction during reconnect"
);
assert.strictEqual(slot.item.id, 3160, "the saved item hotkey should be preserved");
assert.strictEqual(slot.item.mode, "self");
assert.strictEqual(spriteDraws, 1, "the configured icon should remain visible without a Player");

const rune = { id: 3160 };
const equipment = {
  slots: [rune],
  getSlotItem(index) { return this.slots[index] || null; },
  peekItem(index) { return this.slots[index] || null; }
};
context.gameClient.player = {
  equipment,
  __openedContainers: new Set()
};

manager.render();
assert.strictEqual(spriteDraws, 2, "the next render should keep the permanent icon visible");

console.log("PASS: saved item hotkeys survive a clean reconnect before Player assignment.");
