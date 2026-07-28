"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const elements = {
  input: {
    value: "",
    disabled: true,
    placeholder: "",
    focus() {
      documentMock.activeElement = this;
    },
    blur() {},
  },
  wrapper: {
    offsetWidth: 320,
    classes: new Set(["locked"]),
    classList: {
      add(name) {
        elements.wrapper.classes.add(name);
      },
      remove(name) {
        elements.wrapper.classes.delete(name);
      },
      toggle(name, enabled) {
        if (enabled) {
          elements.wrapper.classes.add(name);
        } else {
          elements.wrapper.classes.delete(name);
        }
      },
    },
  },
  indicator: { innerHTML: "lock" },
};

const documentMock = {
  body: {},
  activeElement: {
    blur() {},
  },
};

const context = vm.createContext({
  console,
  clearTimeout,
  setTimeout,
  document: documentMock,
});

const channelManagerFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "utils",
  "channel-manager.js"
);
vm.runInContext(
  fs.readFileSync(channelManagerFile, "utf8") +
    "\nthis.ChannelManager = ChannelManager;",
  context,
  { filename: channelManagerFile }
);

const manager = Object.create(context.ChannelManager.prototype);
manager.__disabled = true;
manager.__inputElement = elements.input;
manager.__inputWrapperElement = elements.wrapper;
manager.__lockIndicatorElement = elements.indicator;
manager.__lockFeedbackTimeout = null;

manager.setInputLocked(false);
assert.strictEqual(elements.input.disabled, false);
assert.strictEqual(elements.input.placeholder, "Press Enter to lock.");
assert.strictEqual(elements.indicator.innerHTML, "lock_open");
assert.strictEqual(elements.wrapper.classes.has("locked"), false);

documentMock.activeElement = { blur() {} };
manager.setInputLocked(true);
assert.strictEqual(elements.input.disabled, true);
assert.strictEqual(elements.input.placeholder, "Press Enter to unlock.");
assert.strictEqual(elements.indicator.innerHTML, "lock");
assert.strictEqual(elements.wrapper.classes.has("locked"), true);

manager.showInputLockedFeedback();
assert.strictEqual(
  elements.wrapper.classes.has("lock-feedback"),
  true,
  "Typing while locked should start the feedback animation."
);
clearTimeout(manager.__lockFeedbackTimeout);

function LocalChannel() {}
function PrivateChannel() {}
function PublicChannel() {}

context.LocalChannel = LocalChannel;
context.PrivateChannel = PrivateChannel;
context.ChannelMessagePacket = function(channelId, loudness, message) {
  this.channelId = channelId;
  this.loudness = loudness;
  this.message = message;
};

const sentPackets = [];
context.gameClient = {
  send(packet) {
    sentPackets.push(packet);
  },
  interface: {
    setCancelMessage() {},
  },
};

const sendingManager = Object.create(context.ChannelManager.prototype);
sendingManager.__disabled = false;
sendingManager.__inputElement = elements.input;
sendingManager.__inputWrapperElement = elements.wrapper;
sendingManager.__lockIndicatorElement = elements.indicator;
sendingManager.__messageHistory = [];
sendingManager.__messageHistoryIndex = 0;
sendingManager.__messageHistoryDraft = "";
sendingManager.__lockFeedbackTimeout = null;
sendingManager.getActiveChannel = () => ({
  constructor: PublicChannel,
  id: 0,
});
sendingManager.getLoudness = () => 1;

elements.input.disabled = false;
elements.input.value = "/m Dragon";
documentMock.activeElement = { blur() {} };
sendingManager.handleMessageSend();

assert.strictEqual(sentPackets.length, 1, "The message packet should be sent.");
assert.strictEqual(sentPackets[0].message, "/m Dragon");
assert.strictEqual(
  sendingManager.__disabled,
  true,
  "Chat should lock immediately after sending a message or command."
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(sendingManager.__messageHistory)),
  ["/m Dragon"],
  "The sent command should remain available in input history."
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

let feedbackCalls = 0;
context.gameClient = {
  interface: {
    channelManager: {
      isDisabled: () => true,
      showInputLockedFeedback: () => feedbackCalls++,
    },
  },
};
documentMock.activeElement = documentMock.body;

const keyboard = Object.create(context.Keyboard.prototype);
keyboard.__activeKeys = new Set();
keyboard.__keyDown({
  key: "b",
  keyCode: 66,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
});
assert.strictEqual(
  feedbackCalls,
  1,
  "An unconfigured alphabetic key should still highlight the locked chat."
);

console.log("PASS: chat lock state, icon and locked-input feedback work.");
