"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const documentMock = {
  body: {},
  activeElement: null,
  addEventListener() {},
};

const context = vm.createContext({
  console,
  document: documentMock,
  window: {},
});

const keyboardSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "input", "keyboard.js"),
  "utf8"
);
vm.runInContext(keyboardSource + "\nthis.Keyboard = Keyboard;", context, {
  filename: "keyboard.js",
});

let modalOpened = false;
context.gameClient = {
  player: {},
  interface: {
    channelManager: {
      isDisabled: () => false,
      showInputLockedFeedback() {},
    },
    modalManager: {
      isOpened: () => modalOpened,
    },
    settings: {
      isWASDMovementEnabled: () => true,
    },
  },
};

const keyboard = Object.create(context.Keyboard.prototype);
keyboard.__activeKeys = new Set();

let buttonBlurred = 0;
const gameButton = {
  tagName: "BUTTON",
  blur() {
    buttonBlurred++;
    documentMock.activeElement = documentMock.body;
  },
};
let prevented = 0;

documentMock.activeElement = gameButton;
keyboard.__keyDown({
  key: "ArrowUp",
  keyCode: keyboard.KEYS.UP_ARROW,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  preventDefault() { prevented++; },
});

assert.strictEqual(buttonBlurred, 1, "a clicked game button must release focus on the next direction key");
assert.strictEqual(prevented, 1);
assert.strictEqual(keyboard.__activeKeys.has(keyboard.KEYS.UP_ARROW), true);

const input = {
  tagName: "INPUT",
  blur() { throw new Error("text input focus must be preserved"); },
};
documentMock.activeElement = input;
keyboard.__keyDown({
  key: "ArrowDown",
  keyCode: keyboard.KEYS.DOWN_ARROW,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  preventDefault() {},
});
assert.strictEqual(keyboard.__activeKeys.has(keyboard.KEYS.DOWN_ARROW), false);

modalOpened = true;
documentMock.activeElement = gameButton;
keyboard.__keyDown({
  key: "ArrowLeft",
  keyCode: keyboard.KEYS.LEFT_ARROW,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  preventDefault() {},
});
assert.strictEqual(keyboard.__activeKeys.has(keyboard.KEYS.LEFT_ARROW), false, "open modals must continue blocking movement");

console.log("PASS: game UI buttons release keyboard focus without stealing text or modal input.");
