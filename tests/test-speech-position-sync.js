"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const speaker = {
  getPosition: () => ({ x: 100, y: 100, z: 7 }),
  getMoveOffset: () => ({ x: 0.5, y: 0.25 }),
};

let anchoredEntity = null;
const context = vm.createContext({
  console,
  document: {
    hidden: false,
    getElementById: () => ({
      cloneNode: () => ({ style: {} }),
    }),
  },
  gameClient: {
    renderer: {
      getCreatureScreenPosition: (entity) => {
        anchoredEntity = entity;
        return { x: 8.5, y: 6.25 };
      },
      getStaticScreenPosition: () => {
        throw new Error("Creature speech must not use an un-interpolated tile anchor.");
      },
    },
    interface: {
      getSpriteScaling: () => 32,
    },
    player: {
      isMoving: () => false,
    },
    touch: {
      isMobileMode: false,
    },
  },
});

context.window = context;
context.global = context;
context.ScreenElement = function () {};
context.ScreenElement.prototype = {};

const messageFile = path.join(root, "client", "src", "ui", "screen-element-message.js");
vm.runInContext(
  fs.readFileSync(messageFile, "utf8") + "\nthis.MessageElement = MessageElement;",
  context,
  { filename: messageFile }
);

const message = Object.create(context.MessageElement.prototype);
message.__entity = speaker;
message.__position = { x: 101, y: 101, z: 7 };
message.__getAbsoluteOffset = (position) => ({
  left: position.x * 32,
  top: position.y * 32,
});
let finalOffset = null;
message.__updateTextPosition = (offset) => {
  finalOffset = offset;
};

message.setTextPosition();
assert.strictEqual(anchoredEntity, speaker);
assert.deepStrictEqual(finalOffset, {
  left: (8.5 * 32) + (32 * 0.35),
  top: (6.25 * 32) - (32 * 0.05),
});

const managerFile = path.join(root, "client", "src", "ui", "screen-element-manager.js");
vm.runInContext(
  fs.readFileSync(managerFile, "utf8") + "\nthis.ScreenElementManager = ScreenElementManager;",
  context,
  { filename: managerFile }
);

let renderCalls = 0;
message.setTextPosition = () => {
  renderCalls++;
};
const manager = Object.create(context.ScreenElementManager.prototype);
manager.activeTextElements = new Set([message]);
manager.__renderCharacterElements = () => {};
manager.render();

assert.strictEqual(
  renderCalls,
  1,
  "Speech must follow a moving remote speaker even while the local player stands still."
);

console.log("PASS: overhead speech follows creature movement and tile elevation.");
