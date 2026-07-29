"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let nextTimerId = 1;
const timers = new Map();
const clearedTimers = new Set();

const context = vm.createContext({
  console,
  performance: { now: () => 1000 },
  setTimeout(callback) {
    const id = nextTimerId++;
    timers.set(id, callback);
    return id;
  },
  clearTimeout(id) {
    clearedTimers.add(id);
  },
  CONST: {
    DIRECTION: {
      NORTH: 0,
      EAST: 1,
      SOUTH: 2,
      WEST: 3,
      NORTH_EAST: 4,
      SOUTH_EAST: 5,
      SOUTH_WEST: 6,
      NORTH_WEST: 7,
    },
  },
  Keyboard: function Keyboard() {},
  BinaryHeap: function BinaryHeap() {},
});

context.Keyboard.prototype.KEYS = {
  UP_ARROW: 38,
  RIGHT_ARROW: 39,
  DOWN_ARROW: 40,
  LEFT_ARROW: 37,
  KEYPAD_9: 33,
  KEYPAD_3: 34,
  KEYPAD_1: 35,
  KEYPAD_7: 36,
};

const pathfinderFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "input",
  "pathfinder.js"
);
vm.runInContext(
  fs.readFileSync(pathfinderFile, "utf8") + "\nthis.Pathfinder = Pathfinder;",
  context,
  { filename: pathfinderFile }
);

function makePosition(x, y, direction) {
  return {
    x,
    y,
    z: 7,
    direction,
    getLookDirection(target) {
      return target.direction;
    },
  };
}

function makeTile(position) {
  return {
    __position: position,
    neighbours: [],
    isOccupied: () => false,
  };
}

const startPosition = makePosition(100, 100, null);
const eastPosition = makePosition(101, 100, context.CONST.DIRECTION.EAST);
const southPosition = makePosition(100, 101, context.CONST.DIRECTION.SOUTH);
const startTile = makeTile(startPosition);
const eastTile = makeTile(eastPosition);
const southTile = makeTile(southPosition);
const tiles = [startTile, eastTile, southTile];

let playerMoving = true;
let serverWalkConfirmed = true;
let playerPositionReads = 0;
const movementKeys = [];
const pathfinder = new context.Pathfinder();
pathfinder.search = (start, end) => [end];

context.gameClient = {
  player: {
    isMoving: () => playerMoving,
    get __serverWalkConfirmation() {
      return serverWalkConfirmed;
    },
    setMovementBuffer() {},
    getPosition() {
      playerPositionReads++;
      return startPosition;
    },
  },
  world: {
    pathfinder,
    getTileFromWorldPosition(position) {
      return (
        tiles.find(
          (tile) =>
            tile.__position.x === position.x &&
            tile.__position.y === position.y &&
            tile.__position.z === position.z
        ) || null
      );
    },
  },
  keyboard: {
    handleCharacterMovement(key) {
      movementKeys.push(key);
    },
  },
  interface: {
    setCancelMessage() {},
  },
};

pathfinder.findPath(startPosition, eastPosition);
const firstRequestId = pathfinder.__requestId;
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(pathfinder.__pathfindCache)),
  [context.CONST.DIRECTION.EAST]
);

pathfinder.findPath(startPosition, southPosition);
assert.strictEqual(pathfinder.__requestId, firstRequestId + 1);
assert.strictEqual(pathfinder.__finalDestination, southPosition);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(pathfinder.__pathfindCache)),
  [context.CONST.DIRECTION.SOUTH],
  "A rapid second click must replace, not append to, the old route."
);

// Schedule a continuation for the current destination.
playerMoving = false;
pathfinder.__pathfindCache = [];
pathfinder.handlePathfind();
const staleTimerId = pathfinder.__continuationTimer;
const staleTimer = timers.get(staleTimerId);
assert.strictEqual(typeof staleTimer, "function");

// A newer click invalidates and clears that continuation.
playerMoving = true;
pathfinder.findPath(startPosition, eastPosition);
assert.strictEqual(clearedTimers.has(staleTimerId), true);
assert.strictEqual(pathfinder.__finalDestination, eastPosition);

assert.doesNotThrow(() => staleTimer());
assert.strictEqual(
  pathfinder.__finalDestination,
  eastPosition,
  "A stale timer must not restore its captured destination."
);

// Finishing the visual step before the server acknowledgement must not consume
// and dispatch the next cached direction. It is resumed by confirmation.
playerMoving = false;
serverWalkConfirmed = false;
pathfinder.__pathfindCache = [context.CONST.DIRECTION.WEST];
pathfinder.handlePathfind();
assert.deepStrictEqual(movementKeys, []);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(pathfinder.__pathfindCache)),
  [context.CONST.DIRECTION.WEST]
);

serverWalkConfirmed = true;
pathfinder.handlePathfind();
assert.deepStrictEqual(movementKeys, [context.Keyboard.prototype.KEYS.LEFT_ARROW]);

// A delayed continuation must also be harmless after logout.
playerMoving = false;
pathfinder.__pathfindCache = [];
pathfinder.handlePathfind();
const logoutTimer = timers.get(pathfinder.__continuationTimer);
context.gameClient.player = null;
assert.doesNotThrow(() => logoutTimer());

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

function Tile(position) {
  this.position = position;
}
Tile.prototype.getPosition = function() {
  return this.position;
};

let clickedFrom = null;
let clickedTo = null;
context.gameClient.player = {
  isMoving: () => true,
  getPosition: () => startPosition,
};
context.gameClient.keyboard = {
  isControlDown: () => false,
  isShiftDown: () => false,
};
context.gameClient.world.pathfinder = {
  findPath(from, to) {
    clickedFrom = from;
    clickedTo = to;
  },
};

const mouse = Object.create(context.Mouse.prototype);
mouse.__multiUseObject = null;
mouse.__mouseDownObject = {
  which: new Tile(southPosition),
};

assert.doesNotThrow(
  () => mouse.__handleMouseClick(),
  "Click-to-walk must not depend on a global browser event."
);
assert.strictEqual(clickedFrom, startPosition);
assert.strictEqual(clickedTo, southPosition);

console.log(
  "PASS: rapid clicks replace old routes and stale continuations cannot backtrack or crash."
);
