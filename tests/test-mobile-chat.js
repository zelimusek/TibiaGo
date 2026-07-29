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
      return id === "chat-lock-resize" ? expandButton : null;
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
assert.match(html, /id="chat-lock-resize"/);
assert.match(html, /id="left-channel"/);
assert.match(html, /id="right-channel"/);
assert.match(html, /id="cheader"/);
assert.doesNotMatch(html, /id="mobile-chat-header"/);

const css = fs.readFileSync(
  path.join(__dirname, "..", "client", "css", "mobile.css"),
  "utf8"
);
assert.match(css, /\.mobile-chat-active\.mobile-chat-expanded/);
assert.match(css, /min-height:\s*92px/);
assert.match(css, /\.mobile-chat-active\s+\.wrapper-header\s*\{\s*display:\s*flex/);
assert.match(css, /\.mobile-chat-active\s+\.chat-header/);
assert.match(css, /\.mobile-chat-active\s+#chat-lock-resize/);

const channelManagerSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "utils", "channel-manager.js"),
  "utf8"
);
assert.doesNotMatch(channelManagerSource, /__updateMobileChannelLabel/);

const touchSource = fs.readFileSync(touchFile, "utf8");
assert.match(touchSource, /document\.getElementById\('chat-lock-resize'\)/);
assert.match(touchSource, /document\.getElementById\('left-channel'\)/);
assert.match(touchSource, /document\.getElementById\('right-channel'\)/);
assert.doesNotMatch(touchSource, /__ensureMobileChatHeader/);

const serviceWorkerSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "service-worker.js"),
  "utf8"
);
assert.match(serviceWorkerSource, /tibiago-static-v10/);

console.log("PASS: mobile chat input, sizing and channel controls work by touch.");
