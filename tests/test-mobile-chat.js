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
assert.strictEqual(expandButton.innerHTML, "close_fullscreen");

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

console.log("PASS: mobile chat opens the keyboard and supports expanded history.");
