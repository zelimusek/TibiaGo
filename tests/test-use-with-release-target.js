"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const mouseFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "input",
  "mouse.js"
);
const context = vm.createContext({ console });
vm.runInContext(
  fs.readFileSync(mouseFile, "utf8") + "\nthis.Mouse = Mouse;",
  context,
  { filename: mouseFile }
);

const mouse = Object.create(context.Mouse.prototype);
const rune = { which: { name: "explosion rune" }, index: 3 };
const pressedTile = { which: { name: "old tile" }, index: 0xFF };
const releasedTile = { which: { name: "release tile" }, index: 0xFF };
const releaseEvent = { clientX: 500, clientY: 300 };
let resolvedEvent = null;
let usedFrom = null;
let usedOn = null;

mouse.__multiUseObject = rune;
mouse.__mouseDownObject = pressedTile;
mouse.getWorldObject = function(event) {
  resolvedEvent = event;
  return releasedTile;
};
mouse.__handleItemUseWith = function(fromObject, toObject) {
  usedFrom = fromObject;
  usedOn = toObject;
};

mouse.__handleCanvasMouseUp(releaseEvent);

assert.strictEqual(resolvedEvent, releaseEvent, "the release event must be resolved against the current camera");
assert.strictEqual(usedFrom, rune, "the selected rune must remain the source object");
assert.strictEqual(usedOn, releasedTile, "Use With must target the SQM under mouseup, not mousedown");
assert.notStrictEqual(usedOn, pressedTile, "movement while holding must not preserve the stale tile");

console.log("PASS: Use With resolves its world target when the button is released.");
