"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add(name) {
      classes.add(name);
    },
    remove(name) {
      classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    },
    toggle(name, enabled) {
      if (typeof enabled === "boolean") {
        enabled ? classes.add(name) : classes.delete(name);
        return enabled;
      }
      if (classes.has(name)) {
        classes.delete(name);
        return false;
      }
      classes.add(name);
      return true;
    },
  };
}

const styleValues = {};
const chatContainer = {
  classList: createClassList(),
  style: {
    setProperty(name, value) {
      styleValues[name] = value;
    },
    removeProperty(name) {
      delete styleValues[name];
    },
  },
};

const inputListeners = {};
const inputListenerCounts = {};
const input = {
  addEventListener(name, callback) {
    inputListeners[name] = callback;
    inputListenerCounts[name] = (inputListenerCounts[name] || 0) + 1;
  },
};

const mobileStatusBar = {
  getBoundingClientRect() {
    return { bottom: 36 };
  },
};

const viewportListeners = {};
const viewportListenerCounts = {};
const visualViewport = {
  offsetTop: 10,
  offsetLeft: 0,
  height: 240,
  width: 640,
  addEventListener(name, callback) {
    viewportListeners[name] = callback;
    viewportListenerCounts[name] = (viewportListenerCounts[name] || 0) + 1;
  },
};

const windowListeners = {};
const windowListenerCounts = {};
const documentMock = {
  activeElement: input,
  getElementById(id) {
    if (id === "chat-input") return input;
    if (id === "mobile-status-bar") return mobileStatusBar;
    return null;
  },
  querySelector(selector) {
    assert.strictEqual(selector, "#game-wrapper .main .lower");
    return chatContainer;
  },
};

const context = vm.createContext({
  console,
  clearTimeout,
  setTimeout,
  navigator: { maxTouchPoints: 1 },
  document: documentMock,
  window: {
    innerHeight: 295,
    innerWidth: 640,
    visualViewport,
    addEventListener(name, callback) {
      windowListeners[name] = callback;
      windowListenerCounts[name] = (windowListenerCounts[name] || 0) + 1;
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
touch.isMobileMode = true;
touch.__mobileChatInput = input;
touch.__mobileChatInputFocused = true;
touch.__mobileChatBlurPending = false;
touch.__mobileChatViewportBound = false;
touch.__mobileChatViewportTimers = [];

touch.__syncMobileChatViewport();

assert(chatContainer.classList.contains("mobile-chat-active"));
assert(chatContainer.classList.contains("mobile-chat-keyboard-open"));
assert(chatContainer.classList.contains("mobile-chat-keyboard-tiny"));
assert.strictEqual(styleValues["--mobile-chat-viewport-top"], "40px");
assert.strictEqual(styleValues["--mobile-chat-viewport-height"], "52px");
assert.strictEqual(styleValues["--mobile-chat-viewport-width"], "640px");
assert.strictEqual(styleValues["--mobile-chat-viewport-center-x"], "320px");

// Samsung/Gboard can keep reporting an over-large visualViewport even though
// its accessory bar already covers the lower page. Height must not affect the
// safe top-anchored composer.
visualViewport.offsetTop = 2;
visualViewport.height = 90;
touch.__syncMobileChatViewport();

assert(chatContainer.classList.contains("mobile-chat-keyboard-tiny"));
assert.strictEqual(styleValues["--mobile-chat-viewport-top"], "40px");
assert.strictEqual(styleValues["--mobile-chat-viewport-height"], "52px");

visualViewport.offsetTop = 50;
touch.__syncMobileChatViewport();
assert.strictEqual(styleValues["--mobile-chat-viewport-top"], "54px");

touch.__mobileChatBlurPending = true;
documentMock.activeElement = null;
touch.__syncMobileChatViewport();
assert(chatContainer.classList.contains("mobile-chat-keyboard-open"));

touch.__mobileChatBlurPending = false;
touch.__mobileChatInputFocused = false;
touch.__syncMobileChatViewport();

assert(!chatContainer.classList.contains("mobile-chat-keyboard-open"));
assert(!chatContainer.classList.contains("mobile-chat-keyboard-tiny"));
assert.strictEqual(Object.keys(styleValues).length, 0);

touch.__bindMobileChatViewport();
touch.__bindMobileChatViewport();

assert.strictEqual(typeof inputListeners.focus, "function");
assert.strictEqual(typeof inputListeners.blur, "function");
assert.strictEqual(typeof viewportListeners.resize, "function");
assert.strictEqual(typeof viewportListeners.scroll, "function");
assert.strictEqual(typeof windowListeners.orientationchange, "function");
assert.strictEqual(inputListenerCounts.focus, 1);
assert.strictEqual(inputListenerCounts.blur, 1);
assert.strictEqual(viewportListenerCounts.resize, 1);
assert.strictEqual(viewportListenerCounts.scroll, 1);
assert.strictEqual(windowListenerCounts.orientationchange, 1);

console.log("PASS: mobile chat composer stays inside the software-keyboard viewport.");
