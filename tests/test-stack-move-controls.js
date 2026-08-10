"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const mouseSource = fs.readFileSync(
  path.join(root, "client", "src", "input", "mouse.js"),
  "utf8"
);

let controlDown = false;
let opened = null;
const moved = [];
const mouseContext = vm.createContext({
  console,
  document: { body: { addEventListener() {} } },
  gameClient: {
    keyboard: {
      isShiftDown: () => false,
      isControlDown: () => controlDown,
    },
    interface: {
      modalManager: {
        open(id, properties) { opened = { id, properties }; }
      }
    }
  }
});
vm.runInContext(mouseSource + "\nthis.Mouse = Mouse;", mouseContext, {
  filename: "mouse.js"
});

const item = {
  count: 73,
  isMoveable: () => true,
  isStackable: () => true,
};
const fromObject = {
  index: 0,
  which: { peekItem: () => item }
};
const toObject = { index: 1, which: {} };
const mouse = Object.create(mouseContext.Mouse.prototype);
mouse.sendItemMove = (from, to, count) => moved.push({ from, to, count });

mouse.__bindMoveCallback(fromObject, toObject);
assert.strictEqual(opened.id, "move-item-modal");
assert.strictEqual(moved.length, 0, "A normal stack drag must ask for the amount");

opened = null;
controlDown = true;
mouse.__bindMoveCallback(fromObject, toObject);
assert.strictEqual(opened, null);
assert.strictEqual(moved.at(-1).count, 73, "Ctrl-drag must move the complete stack");

function createInput() {
  const listeners = new Map();
  return {
    value: "",
    max: "",
    listeners,
    addEventListener(type, listener) { listeners.set(type, listener); },
    focus() { this.focused = true; },
    select() { this.selected = true; },
  };
}

const slider = createInput();
const minusButton = createInput();
const plusButton = createInput();
const output = { innerHTML: "" };
const modalListeners = new Map();
const modalElement = {
  querySelectorAll: () => [],
  addEventListener(type, listener) { modalListeners.set(type, listener); },
  setAttribute(name, value) { this[name] = value; },
  focus() { this.focused = true; },
};
let confirmed = 0;
let moveModal = null;
const modalContext = vm.createContext({
  console,
  Math,
  Number,
  Date,
  Modal: function Modal(id) { this.element = modalContext.document.getElementById(id); },
  Canvas: function Canvas() {
    this.clear = function () {};
    this.drawSprite = function () {};
  },
  Item: function Item() {},
  Position: function Position() {},
  document: {
    getElementById(id) {
      if (id === "move-item-modal") return modalElement;
      if (id === "item-amount") return slider;
      if (id === "item-amount-minus") return minusButton;
      if (id === "item-amount-plus") return plusButton;
      if (id === "item-count") return output;
      return null;
    }
  },
  gameClient: {
    keyboard: { isShiftDown: () => false },
    mouse: {
      sendItemMove(from, to, count) { moved.push({ from, to, count }); }
    },
    interface: {
      modalManager: {
        handleConfirm() {
          confirmed++;
          moveModal.handleConfirm();
        }
      }
    }
  }
});
vm.runInContext(
  "Number.prototype.clamp = function(min, max) { return Math.min(max, Math.max(min, this)); };",
  modalContext
);
const modalSource = fs.readFileSync(
  path.join(root, "client", "src", "ui", "modals", "modal-move-item.js"),
  "utf8"
);
vm.runInContext(modalSource + "\nthis.MoveItemModal = MoveItemModal;", modalContext, {
  filename: "modal-move-item.js"
});

moveModal = new modalContext.MoveItemModal("move-item-modal");
moveModal.handleOpen({ fromObject, toObject, item });
assert.strictEqual(slider.value, 73);
assert.strictEqual(slider.max, 73);
assert.strictEqual(modalElement.focused, true);

let prevented = false;
let stopped = false;
const typeDigit = key => modalListeners.get("keydown")({
  key,
  keyCode: key.charCodeAt(0),
  preventDefault() { prevented = true; },
  stopPropagation() { stopped = true; },
});
typeDigit("1");
typeDigit("8");
assert.strictEqual(slider.value, 18);
assert.strictEqual(output.innerHTML, 18);

minusButton.listeners.get("click")();
assert.strictEqual(slider.value, 17);
plusButton.listeners.get("click")();
assert.strictEqual(slider.value, 18);

modalListeners.get("keydown")({
  key: "ArrowLeft",
  keyCode: 37,
  preventDefault() { prevented = true; },
  stopPropagation() { stopped = true; },
});
assert.strictEqual(slider.value, 17);
modalListeners.get("keydown")({
  key: "ArrowRight",
  keyCode: 39,
  preventDefault() { prevented = true; },
  stopPropagation() { stopped = true; },
});
assert.strictEqual(slider.value, 18);

modalListeners.get("keydown")({
  key: "Enter",
  keyCode: 13,
  preventDefault() { prevented = true; },
  stopPropagation() { stopped = true; },
});
assert.strictEqual(confirmed, 1);
assert.strictEqual(moved.at(-1).count, 18);
assert.strictEqual(prevented, true);
assert.strictEqual(stopped, true);

console.log("PASS: stack dragging defaults to amount selection and supports numeric keyboard input.");
