"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "core", "index.js"),
  "utf8"
);

function createContext(readyState) {
  const listeners = {
    window: {},
    document: {},
  };
  const enterGame = { disabled: false };
  let clientInstances = 0;
  let resizerInstances = 0;

  const windowObject = {
    gameClient: null,
    addEventListener(name, callback) {
      listeners.window[name] = callback;
    },
  };

  const context = vm.createContext({
    console,
    window: windowObject,
    document: {
      readyState,
      addEventListener(name, callback) {
        listeners.document[name] = callback;
      },
      getElementById(id) {
        return id === "enter-game" ? enterGame : null;
      },
    },
    GameClient: function GameClient() {
      clientInstances++;
    },
    ChatResizer: function ChatResizer() {
      resizerInstances++;
    },
  });

  vm.runInContext(source, context, { filename: "client/src/core/index.js" });

  return {
    windowObject,
    listeners,
    enterGame,
    getClientInstances: () => clientInstances,
    getResizerInstances: () => resizerInstances,
  };
}

const lateLoad = createContext("complete");
assert.strictEqual(
  lateLoad.getClientInstances(),
  1,
  "A desktop that has already fired window.load must initialize immediately."
);
assert.strictEqual(lateLoad.getResizerInstances(), 1);
assert.strictEqual(lateLoad.enterGame.disabled, true);
assert.strictEqual(lateLoad.listeners.window.load, undefined);

const earlyLoad = createContext("loading");
assert.strictEqual(earlyLoad.getClientInstances(), 0);
assert.strictEqual(earlyLoad.enterGame.disabled, false);
assert.strictEqual(typeof earlyLoad.listeners.window.load, "function");
assert.strictEqual(typeof earlyLoad.listeners.document.DOMContentLoaded, "function");

earlyLoad.listeners.document.DOMContentLoaded();
assert.strictEqual(earlyLoad.enterGame.disabled, true);

earlyLoad.listeners.window.load();
earlyLoad.listeners.window.load();
assert.strictEqual(
  earlyLoad.getClientInstances(),
  1,
  "Repeated load callbacks must not create two clients."
);
assert.strictEqual(earlyLoad.getResizerInstances(), 1);

console.log("PASS: client bootstraps before or after window.load without duplication.");
