"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = vm.createContext({ console });

const positionFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "utils",
  "position.js"
);
vm.runInContext(
  fs.readFileSync(positionFile, "utf8") + "\nthis.Position = Position;",
  context,
  { filename: positionFile }
);

const heapFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "utils",
  "binary-heap.js"
);
vm.runInContext(
  fs.readFileSync(heapFile, "utf8") + "\nthis.BinaryHeap = BinaryHeap;",
  context,
  { filename: heapFile }
);

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

function makeTile(name, x, y, occupied = false) {
  return {
    name,
    __position: new context.Position(x, y, 7),
    neighbours: [],
    isOccupied() {
      return occupied;
    },
    getCost() {
      return 1;
    },
    cleanPathfinding() {
      this.__f = 0;
      this.__g = 0;
      this.__h = 0;
      this.__visited = false;
      this.__closed = false;
      this.__parent = null;
    },
  };
}

function makeGraph(blockCardinalAlternative) {
  const start = makeTile("start", 0, 0);
  const east = makeTile("east", 1, 0, blockCardinalAlternative);
  const target = makeTile("target", 1, 1);

  start.neighbours = [target, east];
  east.neighbours = [target];

  [start, east, target].forEach((tile) => tile.cleanPathfinding());

  return { start, east, target };
}

const openGraph = makeGraph(false);
const openPath = new context.Pathfinder().search(
  openGraph.start,
  openGraph.target
);

assert.deepStrictEqual(
  Array.from(openPath, (tile) => tile.name),
  ["east", "target"],
  "Two cardinal steps with total cost 2 must beat one diagonal step with cost 3."
);
assert.strictEqual(openGraph.target.__g, 2);

const blockedGraph = makeGraph(true);
const blockedPath = new context.Pathfinder().search(
  blockedGraph.start,
  blockedGraph.target
);

assert.deepStrictEqual(
  Array.from(blockedPath, (tile) => tile.name),
  ["target"],
  "A diagonal step must remain available when the cardinal alternative is blocked."
);
assert.strictEqual(
  blockedGraph.target.__g,
  3,
  "A diagonal edge over a unit-cost tile must have an exact pathfinding cost of 3."
);

console.log(
  "PASS: diagonal pathfinding costs 3 and yields to a cheaper cardinal route."
);
