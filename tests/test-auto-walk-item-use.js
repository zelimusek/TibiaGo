"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function Position(x, y, z = 7) {
  this.x = x;
  this.y = y;
  this.z = z;
}

Position.prototype.besides = function (other) {
  return (
    this.z === other.z &&
    Math.abs(this.x - other.x) <= 1 &&
    Math.abs(this.y - other.y) <= 1
  );
};

Position.prototype.north = function () {
  return new Position(this.x, this.y - 1, this.z);
};
Position.prototype.east = function () {
  return new Position(this.x + 1, this.y, this.z);
};
Position.prototype.south = function () {
  return new Position(this.x, this.y + 1, this.z);
};
Position.prototype.west = function () {
  return new Position(this.x - 1, this.y, this.z);
};
Position.prototype.northeast = function () {
  return new Position(this.x + 1, this.y - 1, this.z);
};
Position.prototype.southeast = function () {
  return new Position(this.x + 1, this.y + 1, this.z);
};
Position.prototype.southwest = function () {
  return new Position(this.x - 1, this.y + 1, this.z);
};
Position.prototype.northwest = function () {
  return new Position(this.x - 1, this.y - 1, this.z);
};

function Tile(position, item = null) {
  this.position = position;
  this.item = item;
  this.monsters = new Set();
}

Tile.prototype.getPosition = function () {
  return this.position;
};
Tile.prototype.peekItem = function () {
  return this.item;
};
Tile.prototype.isOccupied = function () {
  return false;
};

function ItemUsePacket(object) {
  this.object = object;
}

const documentMock = {
  body: {
    style: {},
    addEventListener() {},
  },
};

const context = vm.createContext({
  console,
  document: documentMock,
  Tile,
  Container: function Container() {},
  ItemUsePacket,
});

const mouseFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "input",
  "mouse.js"
);

vm.runInContext(
  fs.readFileSync(mouseFile, "utf8") + "\nthis.Mouse = Mouse;",
  context,
  { filename: mouseFile }
);

const ladderPosition = new Position(110, 110);
const ladderItem = {
  isMultiUse() {
    return false;
  },
};
const ladderTile = new Tile(ladderPosition, ladderItem);
const approachTile = new Tile(ladderPosition.north());
let playerPosition = new Position(100, 100);
let pathRequest = null;
const sentPackets = [];

context.gameClient = {
  isSelf() {
    return false;
  },
  player: {
    getPosition() {
      return playerPosition;
    },
    isInProtectionZone() {
      return false;
    },
  },
  world: {
    getTileFromWorldPosition(position) {
      if (
        position.x === approachTile.position.x &&
        position.y === approachTile.position.y &&
        position.z === approachTile.position.z
      ) {
        return approachTile;
      }
      return null;
    },
    pathfinder: {
      findPath(from, to) {
        pathRequest = { from, to };
      },
    },
  },
  interface: {
    setCancelMessage(message) {
      throw new Error(message);
    },
  },
  send(packet) {
    sentPackets.push(packet);
  },
};

const mouse = Object.create(context.Mouse.prototype);
mouse.__pendingItemMove = null;
mouse.__pendingItemUse = null;
mouse.__multiUseObject = null;

const ladderObject = {
  which: ladderTile,
  index: 0xff,
};

mouse.use(ladderObject);

assert.strictEqual(
  mouse.__pendingItemUse,
  ladderObject,
  "A distant ladder must be saved as a deferred Use action."
);
assert.strictEqual(sentPackets.length, 0);
assert.deepStrictEqual(
  { x: pathRequest.to.x, y: pathRequest.to.y, z: pathRequest.to.z },
  { x: 110, y: 109, z: 7 },
  "The player must walk to an adjacent reachable SQM."
);

playerPosition = approachTile.position;
assert.strictEqual(mouse.handlePendingItemUse(), true);
assert.strictEqual(mouse.__pendingItemUse, null);
assert.strictEqual(sentPackets.length, 1);
assert.strictEqual(sentPackets[0].object, ladderObject);

// A new ordinary movement/click can safely discard a deferred action.
mouse.__pendingItemUse = ladderObject;
mouse.cancelPendingActions();
assert.strictEqual(mouse.__pendingItemUse, null);
assert.strictEqual(mouse.__pendingItemMove, null);

console.log(
  "PASS: distant simple-use items are used automatically after walking beside them."
);
