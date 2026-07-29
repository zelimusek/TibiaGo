"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    classes,
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

const chatContainer = { classList: createClassList() };
const expandButton = {
  innerHTML: "",
  title: "",
  attributes: {},
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
};
const lockCalls = [];
let unlockCalls = 0;

const context = vm.createContext({
  console,
  navigator: {
    maxTouchPoints: 0,
    vibrate() {},
  },
  document: {
    getElementById(id) {
      return id === "mobile-chat-expand" ? expandButton : null;
    },
    querySelector(selector) {
      assert.strictEqual(selector, "#game-wrapper .main .lower");
      return chatContainer;
    },
  },
  window: {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener() {},
  },
  gameClient: {
    interface: {
      channelManager: {
        unlockInputForTouch() {
          unlockCalls++;
        },
        setInputLocked(value) {
          lockCalls.push(value);
        },
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
touch.chatExpandBtn = expandButton;
const touchEvent = {
  preventDefault() {},
  stopPropagation() {},
};

touch.__handleChatButton(touchEvent);
assert.strictEqual(
  chatContainer.classList.contains("mobile-chat-active"),
  true,
  "The mobile chat button should open the chat."
);
assert.strictEqual(
  unlockCalls,
  1,
  "Opening mobile chat should unlock and focus the input immediately."
);

touch.__handleChatExpandButton(touchEvent);
assert.strictEqual(
  chatContainer.classList.contains("mobile-chat-expanded"),
  true,
  "The expand button should enlarge the mobile chat."
);
assert.strictEqual(expandButton.innerHTML, "unfold_less");

const increments = [];
context.gameClient.interface.channelManager.handleChannelIncrement = (value) => {
  increments.push(value);
};
touch.__handleMobileChannelIncrement(-1, touchEvent);
touch.__handleMobileChannelIncrement(1, touchEvent);
assert.deepStrictEqual(increments, [-1, 1]);

let tabClicks = 0;
touch.__handleMobileChannelTab({
  preventDefault() {},
  stopPropagation() {},
  target: {
    closest(selector) {
      assert.strictEqual(selector, ".chat-title");
      return {
        click() {
          tabClicks++;
        },
      };
    },
  },
});
assert.strictEqual(tabClicks, 1, "Touching a channel tab should select it.");

touch.__handleChatButton(touchEvent);
assert.strictEqual(
  chatContainer.classList.contains("mobile-chat-active"),
  false,
  "The mobile chat button should close an open chat."
);
assert.strictEqual(
  chatContainer.classList.contains("mobile-chat-expanded"),
  false,
  "Closing chat should reset its expanded state."
);
assert.deepStrictEqual(lockCalls, [true]);

const html = fs.readFileSync(
  path.join(__dirname, "..", "client", "index.html"),
  "utf8"
);
assert.match(html, /id="mobile-chat-expand"/);

const css = fs.readFileSync(
  path.join(__dirname, "..", "client", "css", "mobile.css"),
  "utf8"
);
assert.match(css, /\.mobile-chat-active\.mobile-chat-expanded/);
assert.match(css, /min-height:\s*92px/);
assert.match(css, /#chat-lock-resize\s*\{\s*display:\s*none/);
assert.match(css, /\.wrapper-header\s*>\s*\.symbol-button-long/);

console.log("PASS: mobile chat input, sizing and channel controls work by touch.");
