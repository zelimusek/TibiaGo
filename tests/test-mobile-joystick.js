"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let nextFrameId = 1;
const animationFrames = new Map();
const cancelledFrames = new Set();

const context = vm.createContext({
  console,
  navigator: {
    maxTouchPoints: 1,
    vibrate() {},
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
    requestAnimationFrame(callback) {
      const id = nextFrameId++;
      animationFrames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      cancelledFrames.add(id);
      animationFrames.delete(id);
    },
  },
  CONST: {
    DIRECTION: {
      NORTH: 0,
      EAST: 1,
      SOUTH: 2,
      WEST: 3,
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
context.gameClient = {
  player: {
    clearDirectionMovementBuffer() {},
  },
};
touch.joystick = {
  active: false,
  startX: 50,
  startY: 50,
  currentX: 50,
  currentY: 50,
  direction: null,
  animationFrame: null,
};
touch.joystickZone = {
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  },
};
touch.joystickKnob = { style: { transform: "" } };
touch.virtualJoystick = {
  direction: null,
  setAttribute(name, value) {
    if (name === "data-direction") this.direction = value;
  },
  removeAttribute(name) {
    if (name === "data-direction") this.direction = null;
  },
};

const DIRECTION = context.CONST.DIRECTION;
assert.strictEqual(touch.__vectorToCardinalDirection(30, 8), DIRECTION.EAST);
assert.strictEqual(touch.__vectorToCardinalDirection(-30, 8), DIRECTION.WEST);
assert.strictEqual(touch.__vectorToCardinalDirection(8, 30), DIRECTION.SOUTH);
assert.strictEqual(touch.__vectorToCardinalDirection(8, -30), DIRECTION.NORTH);
assert.strictEqual(
  touch.__vectorToCardinalDirection(30, 30),
  DIRECTION.EAST,
  "Even a perfect diagonal must resolve to one cardinal direction."
);

const moves = [];
touch.__moveInDirection = (direction) => moves.push(direction);

let prevented = false;
touch.__handleJoystickStart({
  preventDefault() {
    prevented = true;
  },
  changedTouches: [{ identifier: 7, clientX: 95, clientY: 85 }],
});

assert.strictEqual(prevented, true);
assert.strictEqual(touch.joystick.active, true);
assert.strictEqual(touch.joystick.direction, DIRECTION.EAST);
assert.deepStrictEqual(moves, [DIRECTION.EAST]);
assert.strictEqual(touch.virtualJoystick.direction, "east");
assert.strictEqual(
  touch.joystickKnob.style.transform,
  "translate(9px, 0px)",
  "The D-pad knob must move only along one axis."
);
assert.notStrictEqual(
  touch.joystick.animationFrame,
  null,
  "Holding the D-pad should schedule movement on animation frames."
);

const scheduledFrame = touch.joystick.animationFrame;
animationFrames.get(scheduledFrame)();
assert.deepStrictEqual(
  moves,
  [DIRECTION.EAST, DIRECTION.EAST],
  "The held direction should be retried on the next rendered frame."
);

const activeFrame = touch.joystick.animationFrame;
touch.__handleJoystickEnd({
  preventDefault() {},
  changedTouches: [{ identifier: 7 }],
});
assert.strictEqual(touch.joystick.active, false);
assert.strictEqual(touch.joystick.direction, null);
assert.strictEqual(touch.joystick.animationFrame, null);
assert.strictEqual(cancelledFrames.has(activeFrame), true);
assert.strictEqual(touch.joystickKnob.style.transform, "translate(0, 0)");
assert.strictEqual(touch.virtualJoystick.direction, null);

console.log("PASS: mobile joystick is cardinal-only, immediate and frame-synchronised.");
