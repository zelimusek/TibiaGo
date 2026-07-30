"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const speaker = {
  name: "God",
  __position: {
    x: 101,
    y: 101,
    z: 7,
    copy: () => ({ x: 101, y: 101, z: 7 }),
  },
  getPosition: () => ({ x: 100, y: 100, z: 7 }),
  getMoveOffset: () => ({ x: 0.5, y: 0.25 }),
};

let staticWorldPosition = null;
const context = vm.createContext({
  console,
  document: {
    hidden: false,
    getElementById: () => ({
      cloneNode: () => {
        const spans = [{ innerHTML: "", style: {} }, { innerHTML: "", style: {} }];
        return {
          style: {},
          querySelectorAll: () => spans,
        };
      },
    }),
  },
  gameClient: {
    world: {
      getTileFromWorldPosition: () => ({ __renderElevation: 0.5 }),
    },
    renderer: {
      getCreatureScreenPosition: () => {
        throw new Error("Frozen speech must not follow the speaker.");
      },
      getStaticScreenPosition: (position) => {
        staticWorldPosition = position;
        return { x: 8.5, y: 6.25 };
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
context.Interface = function () {};
context.Interface.prototype.getHexColor = () => "#ffffff";
context.ScreenElement = function () {
  this.element = context.document.getElementById().cloneNode(true);
};
context.ScreenElement.prototype = {};

const messageFile = path.join(root, "client", "src", "ui", "screen-element-message.js");
vm.runInContext(
  fs.readFileSync(messageFile, "utf8") + "\nthis.MessageElement = MessageElement;",
  context,
  { filename: messageFile }
);

const message = new context.MessageElement(speaker, "czesc", 0);
message.__getAbsoluteOffset = (position) => ({
  left: position.x * 32,
  top: position.y * 32,
});
let finalOffset = null;
message.__updateTextPosition = (offset) => {
  finalOffset = offset;
};

message.setTextPosition();
assert.deepStrictEqual(staticWorldPosition, message.__position);
assert.strictEqual(message.__visualOffset.x, 1);
assert.strictEqual(message.__visualOffset.y, 0.75);
assert.deepStrictEqual(finalOffset, {
  left: ((8.5 - 1) * 32) + (32 * 0.35),
  top: ((6.25 - 0.75) * 32) - (32 * 0.05),
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
  0,
  "Speech must not follow a moving remote speaker while the camera stands still."
);

context.gameClient.player.isMoving = () => true;
manager.render();
assert.strictEqual(
  renderCalls,
  1,
  "Frozen world speech must still be repositioned when the camera moves."
);

console.log("PASS: overhead speech stays where it was spoken without jumping mid-step.");
