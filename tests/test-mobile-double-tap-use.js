"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let now = 1000;
const tile = {};
const tileObject = { which: tile, index: 0xff };
let uses = 0;
let cancels = 0;
let pathCancels = 0;

const context = vm.createContext({
  console,
  Date: {
    now() {
      return now;
    },
  },
  navigator: { maxTouchPoints: 0 },
  document: {
    getElementById() {
      return null;
    },
  },
  window: {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener() {},
  },
  gameClient: {
    world: {
      pathfinder: {
        setPathfindCache(path) {
          assert.strictEqual(path, null);
          pathCancels++;
        },
      },
    },
    mouse: {
      getWorldObject() {
        return tileObject;
      },
      getOtherCreatures() {
        return new Set();
      },
      cancelPendingActions() {
        cancels++;
      },
      use(object) {
        assert.strictEqual(object, tileObject);
        uses++;
      },
    },
  },
});

const touchFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "input",
  "touch.js"
);
vm.runInContext(
  fs.readFileSync(touchFile, "utf8") + "\nthis.Touch = Touch;",
  context,
  { filename: touchFile }
);

const touch = Object.create(context.Touch.prototype);
touch.touchStartX = 100;
touch.touchStartY = 200;
touch.actionMode = null;
touch.lastCanvasTapTime = 0;
touch.lastCanvasTapTile = null;

assert.strictEqual(touch.__performCanvasDoubleTapAction(), false);
assert.strictEqual(uses, 0);

now += 200;
assert.strictEqual(touch.__performCanvasDoubleTapAction(), true);
assert.strictEqual(uses, 1);
assert.strictEqual(cancels, 1);
assert.strictEqual(pathCancels, 1);

now += 500;
assert.strictEqual(touch.__performCanvasDoubleTapAction(), false);
assert.strictEqual(uses, 1);

const html = fs.readFileSync(
  path.join(__dirname, "..", "client", "index.html"),
  "utf8"
);
assert.doesNotMatch(
  html,
  /id="mobile-use-btn"/,
  "The obsolete green mobile Use button must not be rendered."
);

console.log("PASS: same-SQM double tap uses world objects and the old Use button is removed.");
