"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourceFile = path.join(__dirname, "..", "client", "src", "rendering", "canvas.js");
const source = fs.readFileSync(sourceFile, "utf8") + "\nthis.Canvas = Canvas;\n";
const context = vm.createContext({
  console,
  FrameGroup: function FrameGroup() {},
});

context.FrameGroup.prototype.NONE = 0;
vm.runInContext(source, context, { filename: sourceFile });

function renderedOffsets(width, height) {
  const frameGroup = {
    width,
    height,
    layers: 1,
    getSpriteIndex: (_frame, _px, _py, _pz, _layer, x, y) => `${x},${y}`,
    getSprite: (index) => index,
  };
  const thing = {
    getFrameGroup: () => frameGroup,
    getFrame: () => 0,
    getPattern: () => ({ x: 0, y: 0, z: 0 }),
  };
  const offsets = [];
  const canvas = Object.create(context.Canvas.prototype);
  canvas.__drawSprite = (_sprite, _position, x, y) => offsets.push([x, y]);
  canvas.drawSprite(thing, { x: 10, y: 10 }, 32);
  return offsets;
}

assert.deepStrictEqual(
  renderedOffsets(2, 1),
  [[1, 0], [0, 0]],
  "A 2x1 sprite must be drawn from its left part towards the tile anchor."
);
assert.deepStrictEqual(
  renderedOffsets(1, 2),
  [[0, 1], [0, 0]],
  "A 1x2 sprite must be drawn from its top part towards the tile anchor."
);
assert.deepStrictEqual(
  renderedOffsets(2, 2),
  [[1, 1], [1, 0], [0, 1], [0, 0]],
  "Both axes of a 2x2 sprite must use bottom-right anchoring."
);

console.log("PASS: multi-tile sprites use the DAT bottom-right anchor.");
