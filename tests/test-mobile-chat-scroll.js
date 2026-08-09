"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const animationFrames = [];
const timeouts = [];
const chatbox = {
  scrollTop: 0,
  scrollHeight: 400,
  offsetHeight: 100,
  innerHTML: "",
  appendChild() {}
};

const context = vm.createContext({
  console,
  document: {
    getElementById(id) {
      assert.strictEqual(id, "chat-text-area");
      return chatbox;
    }
  },
  requestAnimationFrame(callback) {
    animationFrames.push(callback);
  },
  setTimeout(callback, delay) {
    timeouts.push({ callback, delay });
  }
});

const channelFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "utils",
  "channel.js"
);
vm.runInContext(
  fs.readFileSync(channelFile, "utf8") + "\nthis.Channel = Channel;",
  context,
  { filename: channelFile }
);

const channel = Object.create(context.Channel.prototype);
channel.name = "Default";
channel.__contents = [{ createNode: () => ({}) }];
context.gameClient = {
  touch: { isMobileMode: true },
  interface: {
    channelManager: {
      isActive(candidate) {
        return candidate === channel;
      }
    }
  }
};

channel.render(true);
assert.strictEqual(chatbox.scrollTop, 400, "a forced render should scroll immediately");
assert.strictEqual(animationFrames.length, 1, "mobile scrolling should wait for layout frames");
assert.strictEqual(timeouts.length, 1, "mobile scrolling should include a keyboard-layout fallback");
assert.strictEqual(timeouts[0].delay, 250);

chatbox.scrollHeight = 520;
animationFrames.shift()();
assert.strictEqual(animationFrames.length, 1, "the scroll should wait for a second painted frame");
animationFrames.shift()();
assert.strictEqual(chatbox.scrollTop, 520, "the newest mobile message should remain visible after resize");

chatbox.scrollHeight = 560;
timeouts[0].callback();
assert.strictEqual(chatbox.scrollTop, 560, "the delayed fallback should use the final keyboard layout");

console.log("PASS: forced mobile chat scrolling follows virtual-keyboard layout changes.");
