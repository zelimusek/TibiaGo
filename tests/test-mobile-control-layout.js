"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createClassList(initial) {
  const classes = new Set(initial || []);
  return {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    contains: (name) => classes.has(name)
  };
}

function createElement(left, top, width, height) {
  const values = new Map();
  const listeners = new Map();
  const classList = createClassList();

  return {
    classList,
    listeners,
    style: {
      setProperty: (name, value) => values.set(name, value),
      removeProperty: (name) => values.delete(name)
    },
    addEventListener: (name, listener) => listeners.set(name, listener),
    getBoundingClientRect: () => {
      const positioned = classList.contains("mobile-control-positioned");
      const x = positioned ? Number.parseFloat(values.get("--mobile-control-x")) || 0 : 0;
      const y = positioned ? Number.parseFloat(values.get("--mobile-control-y")) || 0 : 0;
      return {
        left: left + x,
        top: top + y,
        width,
        height,
        right: left + x + width,
        bottom: top + y + height
      };
    }
  };
}

function touch(identifier, x, y) {
  return { identifier, clientX: x, clientY: y };
}

function event(touches, changedTouches, target) {
  return {
    touches,
    changedTouches,
    target,
    preventDefault() {},
    stopPropagation() {}
  };
}

const storage = new Map();
const context = {
  console,
  Map,
  Number,
  Math,
  JSON,
  Object,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key)
  },
  navigator: { vibrate() {} },
  window: {
    innerWidth: 1000,
    innerHeight: 500,
    visualViewport: null,
    addEventListener() {}
  }
};

const source = fs.readFileSync(
  path.join(__dirname, "..", "client/src/input/mobile-control-layout.js"),
  "utf8"
);
vm.createContext(context);
vm.runInContext(source + "\nthis.MobileControlLayout = MobileControlLayout;", context);

const layout = new context.MobileControlLayout();
const button = createElement(800, 420, 48, 48);
let taps = 0;
let holds = 0;

layout.register(button, "chat", {
  onTap: () => { taps += 1; },
  onLongPress: () => { holds += 1; }
});

button.listeners.get("touchstart")(event([touch(1, 824, 444)], [touch(1, 824, 444)], button));
button.listeners.get("touchend")(event([], [touch(1, 824, 444)], button));
assert.strictEqual(taps, 1, "A short tap should execute the control action");

// A finger held on the joystick must not make the second touch disappear.
const joystickTouch = touch(99, 80, 420);
button.listeners.get("touchstart")(
  event([joystickTouch, touch(4, 824, 444)], [touch(4, 824, 444)], button)
);
button.listeners.get("touchend")(
  event([joystickTouch], [touch(4, 824, 444)], button)
);
assert.strictEqual(taps, 2, "A control should work while another finger holds the joystick");

button.listeners.get("touchstart")(event([touch(2, 824, 444)], [touch(2, 824, 444)], button));
layout.__beginLongPress(layout.__active);
button.listeners.get("touchend")(event([], [touch(2, 824, 444)], button));
assert.strictEqual(taps, 2, "A long press must not execute the tap action");
assert.strictEqual(holds, 1, "A stationary long press should call onLongPress");

button.listeners.get("touchstart")(event([touch(3, 824, 444)], [touch(3, 824, 444)], button));
layout.__beginLongPress(layout.__active);
button.listeners.get("touchmove")(event([touch(3, 500, 250)], [touch(3, 500, 250)], button));
button.listeners.get("touchend")(event([], [touch(3, 500, 250)], button));

assert.strictEqual(holds, 1, "Dragging after a long press must not open an editor");
assert.strictEqual(button.classList.contains("mobile-control-positioned"), true);
assert.strictEqual(button.classList.contains("mobile-control-dragging"), false);

const saved = JSON.parse(storage.get(layout.STORAGE_KEY));
assert.ok(saved.landscape.chat, "Landscape position should be persisted");
assert.ok(saved.landscape.chat.x >= 0 && saved.landscape.chat.x <= 1);
assert.ok(saved.landscape.chat.y >= 0 && saved.landscape.chat.y <= 1);

layout.reset();
assert.strictEqual(storage.has(layout.STORAGE_KEY), false);
assert.strictEqual(button.classList.contains("mobile-control-positioned"), false);

console.log("Mobile control layout tests passed.");
