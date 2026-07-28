"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function Position(x, y, z) {
  this.x = x;
  this.y = y;
  this.z = z;
}

Position.prototype.projected = function () {
  return this;
};

const context = vm.createContext({
  console,
  Position,
});

const canvasFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "rendering",
  "canvas.js"
);

vm.runInContext(
  fs.readFileSync(canvasFile, "utf8") + "\nthis.Canvas = Canvas;",
  context,
  { filename: canvasFile }
);

const playerPosition = new Position(100, 100, 7);
let moveOffset = new Position(0, 0, 0);
let resolvedPosition = null;

context.gameClient = {
  interface: {
    getSpriteScalingVector() {
      return { x: 32, y: 32 };
    },
  },
  player: {
    getPosition() {
      return playerPosition;
    },
    getMoveOffset() {
      return moveOffset;
    },
  },
  world: {
    getChunkFromWorldPosition() {
      return {
        getFirstTileFromTop(position) {
          resolvedPosition = position;
          return position;
        },
      };
    },
  },
};

const canvas = Object.create(context.Canvas.prototype);
canvas.canvas = {
  getBoundingClientRect() {
    return { left: 0, top: 0 };
  },
};

function resolveAt(tileX, tileY) {
  resolvedPosition = null;

  canvas.getWorldCoordinates({
    clientX: (tileX + 0.5) * 32,
    clientY: (tileY + 0.5) * 32,
  });

  return {
    x: resolvedPosition.x,
    y: resolvedPosition.y,
    z: resolvedPosition.z,
  };
}

// Stationary: screen tile 9/7 is world position 102/102.
assert.deepStrictEqual(resolveAt(9, 7), { x: 102, y: 102, z: 7 });

// During an east/south step the rendered map is shifted by a fraction of a
// tile. A click in the visual centre of the same SQM must still resolve to it.
moveOffset = new Position(0.75, 0.75, 0);
assert.deepStrictEqual(resolveAt(9.75, 7.75), {
  x: 102,
  y: 102,
  z: 7,
});

// The inverse directions need the same correction and used to resolve one
// tile behind the visible cursor.
moveOffset = new Position(-0.75, -0.75, 0);
assert.deepStrictEqual(resolveAt(8.25, 6.25), {
  x: 102,
  y: 102,
  z: 7,
});

console.log(
  "PASS: clicks during camera movement resolve to the visually selected SQM."
);
