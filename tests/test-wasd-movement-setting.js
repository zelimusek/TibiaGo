"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const storedValues = new Map();
const elements = {
  "enable-sound": { checked: true },
  "enable-lighting": { checked: true },
  "enable-weather": { checked: true },
  "show-performance": { checked: false },
  "anti-aliasing": { checked: true },
  "enable-wasd-movement": { checked: true },
  "fps-mode": { value: "0" },
  "mouse-control-mode": { value: "regular" },
  "enable-resolution": { checked: false },
  "resolution": { value: "640x480" },
};

Object.values(elements).forEach((element) => {
  element.addEventListener = function() {};
});

const context = vm.createContext({
  console,
  document: {
    body: {},
    activeElement: {},
    getElementById(id) {
      return elements[id];
    },
  },
  localStorage: {
    getItem(key) {
      return storedValues.has(key) ? storedValues.get(key) : null;
    },
    setItem(key, value) {
      storedValues.set(key, value);
    },
    removeItem(key) {
      storedValues.delete(key);
    },
  },
});

const settingsFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "ui",
  "settings.js"
);
vm.runInContext(
  fs.readFileSync(settingsFile, "utf8") + "\nthis.Settings = Settings;",
  context,
  { filename: settingsFile }
);

const settings = Object.create(context.Settings.prototype);
settings.__state = settings.__getCleanState();

assert.strictEqual(
  settings.__state["anti-aliasing"],
  true,
  "Anti-aliasing should be enabled for a fresh or cleared client."
);

assert.strictEqual(
  settings.isWASDMovementEnabled(),
  true,
  "WASD movement should be enabled by default."
);

let keyboardResetCalls = 0;
context.gameClient = {
  keyboard: {
    setInactive() {
      keyboardResetCalls++;
    },
  },
};

settings.__toggle({
  target: {
    id: "enable-wasd-movement",
    checked: false,
  },
});

assert.strictEqual(settings.isWASDMovementEnabled(), false);
assert.strictEqual(keyboardResetCalls, 1);
assert.strictEqual(
  JSON.parse(storedValues.get("settings"))["enable-wasd-movement"],
  false,
  "The checkbox state should be persisted."
);

const keyboardFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "input",
  "keyboard.js"
);
vm.runInContext(
  fs.readFileSync(keyboardFile, "utf8") + "\nthis.Keyboard = Keyboard;",
  context,
  { filename: keyboardFile }
);

context.gameClient.interface = {
  settings,
  channelManager: {
    isDisabled: () => false,
    showInputLockedFeedback() {},
  },
  modalManager: {
    isOpened: () => false,
  },
};

const keyboard = Object.create(context.Keyboard.prototype);
keyboard.__activeKeys = new Set();

const baseEvent = {
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  preventDefault() {},
};

context.document.activeElement = context.document.body;
keyboard.__keyDown({
  ...baseEvent,
  key: "w",
  keyCode: keyboard.KEYS.KEY_W,
});
assert.strictEqual(
  keyboard.__activeKeys.has(keyboard.KEYS.KEY_W),
  false,
  "W should not enter the movement buffer when WASD movement is disabled."
);

keyboard.__keyDown({
  ...baseEvent,
  key: "ArrowUp",
  keyCode: keyboard.KEYS.UP_ARROW,
});
assert.strictEqual(
  keyboard.__activeKeys.has(keyboard.KEYS.UP_ARROW),
  true,
  "Arrow movement should remain enabled."
);

settings.__state["enable-wasd-movement"] = true;
keyboard.__keyDown({
  ...baseEvent,
  key: "w",
  keyCode: keyboard.KEYS.KEY_W,
});
assert.strictEqual(
  keyboard.__activeKeys.has(keyboard.KEYS.KEY_W),
  true,
  "W should move again after the setting is enabled."
);

console.log("PASS: WASD movement setting defaults on, persists and gates only WASD.");
