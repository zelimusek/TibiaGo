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
let walks = 0;
let nextTimer = 1;
const timers = new Map();

const context = vm.createContext({
  console,
  Date: {
    now() {
      return now;
    },
  },
  navigator: { maxTouchPoints: 0 },
  setTimeout(callback) {
    const id = nextTimer++;
    timers.set(id, callback);
    return id;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
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
        findPath(from, to) {
          assert.deepStrictEqual(from, { x: 10, y: 20, z: 7 });
          assert.deepStrictEqual(to, { x: 11, y: 20, z: 7 });
          walks++;
        },
      },
      targetMonster() {},
    },
    player: {
      isDead: false,
      getPosition() {
        return { x: 10, y: 20, z: 7 };
      },
    },
    renderer: {
      screen: {
        getWorldCoordinates() {
          return { __position: { x: 11, y: 20, z: 7 } };
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
touch.pendingCanvasWalkTimer = null;
touch.canvasTapHighlight = null;
touch.canvasTapHighlightTimer = null;

assert.strictEqual(touch.__performCanvasDoubleTapAction(), false);
assert.strictEqual(uses, 0);
touch.__performTapAction();
assert.strictEqual(walks, 0, "A single tap must reserve walking instead of moving immediately.");
assert.strictEqual(timers.size, 1, "A single tap should wait briefly for a possible second tap.");

now += 200;
assert.strictEqual(touch.__performCanvasDoubleTapAction(), true);
assert.strictEqual(uses, 1);
assert.strictEqual(walks, 0, "A double tap must cancel the reserved walk before Use.");
assert.strictEqual(timers.size, 0, "Using a tile must clear the delayed walk.");
assert.strictEqual(cancels, 2);
assert.strictEqual(pathCancels, 2);

now += 500;
assert.strictEqual(touch.__performCanvasDoubleTapAction(), false);
assert.strictEqual(uses, 1);
touch.__performTapAction();
assert.strictEqual(walks, 0);
assert.strictEqual(timers.size, 1);
const delayedWalk = Array.from(timers.values())[0];
timers.clear();
delayedWalk();
assert.strictEqual(walks, 1, "A single tap must walk after the double-tap window expires.");

const css = fs.readFileSync(
  path.join(__dirname, "..", "client", "css", "mobile.css"),
  "utf8"
);
assert.match(css, /\.mobile-tap-tile-highlight/);
assert.match(css, /@keyframes mobile-tap-tile-feedback/);

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
