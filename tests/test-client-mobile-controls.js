"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadConstructor(relativePath, constructorName, context) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  vm.createContext(context);
  vm.runInContext(source + `\nthis.${constructorName} = ${constructorName};`, context);
  return context[constructorName];
}

function createButton() {
  const classes = new Set(["is-enabled"]);
  const attributes = new Map();

  return {
    title: "",
    listener: null,
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name),
    addEventListener() {}
  };
}

(function testSecureModeToggle() {
  const button = createButton();
  const sent = [];
  const context = {
    console,
    document: {
      getElementById: (id) => id === "secure-mode-toggle" ? button : null
    },
    gameClient: {
      networkManager: { isConnected: () => true },
      send: (packet) => sent.push(packet)
    },
    SecureModePacket: function (enabled) {
      this.enabled = enabled;
    }
  };

  const SecureModeToggle = loadConstructor(
    "client/src/ui/secure-mode-toggle.js",
    "SecureModeToggle",
    context
  );
  const toggle = new SecureModeToggle();

  assert.strictEqual(button.getAttribute("data-secure"), "true");
  assert.strictEqual(button.getAttribute("aria-pressed"), "true");

  toggle.toggle({ preventDefault() {}, stopPropagation() {} });

  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].enabled, false);
  assert.strictEqual(button.getAttribute("data-secure"), "false");
  assert.strictEqual(button.getAttribute("aria-label"), "Secure Mode: Off");
  assert.strictEqual(button.classList.contains("is-enabled"), false);

  toggle.setFromServer(true);
  assert.strictEqual(button.classList.contains("is-enabled"), true);
})();

(function testMobileEquipmentAndBackpackButtons() {
  const equipmentElement = { style: {}, computedDisplay: "flex" };
  const backpackItem = { id: 1988 };
  const equipment = {
    getSlotItem: (slot) => slot === 6 ? backpackItem : null
  };
  const used = [];
  let cancelMessage = null;

  const context = {
    console,
    navigator: { maxTouchPoints: 0, vibrate() {} },
    window: {
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener() {},
      getComputedStyle: (element) => ({
        display: element.style.display || element.computedDisplay || "flex"
      })
    },
    document: {
      querySelector: (selector) => selector === ".equipment.wrapper" ? equipmentElement : null
    },
    gameClient: {
      player: {
        equipment,
        __openedContainers: new Set()
      },
      mouse: {
        use: (object) => used.push(object)
      },
      interface: {
        setCancelMessage: (message) => { cancelMessage = message; }
      }
    },
    MobileControlLayout: function () {
      this.register = function () {};
      this.reset = function () {};
    }
  };

  const Touch = loadConstructor("client/src/input/touch.js", "Touch", context);
  const touch = new Touch();
  const event = { preventDefault() {}, stopPropagation() {} };

  touch.__handleEquipmentButton(event);
  assert.strictEqual(equipmentElement.style.display, "none");
  touch.__handleEquipmentButton(event);
  assert.strictEqual(equipmentElement.style.display, "flex");

  touch.__handleInventoryButton(event);
  assert.strictEqual(used.length, 1);
  assert.strictEqual(used[0].which, equipment);
  assert.strictEqual(used[0].index, 6);

  const backpackElement = { style: {}, computedDisplay: "flex" };
  const backpack = {
    id: backpackItem.id,
    window: { __element: backpackElement }
  };
  context.gameClient.player.__openedContainers = new Set([backpack]);

  touch.__handleInventoryButton(event);
  assert.strictEqual(backpackElement.style.display, "none");
  touch.__handleInventoryButton(event);
  assert.strictEqual(backpackElement.style.display, "flex");

  context.gameClient.player.equipment = { getSlotItem: () => null };
  touch.__handleInventoryButton(event);
  assert.strictEqual(cancelMessage, "You are not wearing a backpack.");
})();

(function testMobileHotbarTapAndEdit() {
  const opened = [];
  const pressed = [];
  const slots = [
    { spell: null, text: null, item: null },
    { spell: { sid: 1 }, text: null, item: null },
    { spell: null, text: "hi", item: null },
    { spell: null, text: null, item: { id: 3155 } }
  ];
  const context = {
    console,
    navigator: { maxTouchPoints: 0, vibrate() {} },
    window: {
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener() {}
    },
    document: { querySelector: () => null },
    MobileControlLayout: function () {
      this.register = function () {};
      this.reset = function () {};
    },
    gameClient: {
      interface: {
        hotbarManager: {
          slots,
          handleKeyPress: (key) => pressed.push(key)
        },
        modalManager: {
          open: (id, index) => opened.push({ id, index })
        }
      }
    }
  };

  const Touch = loadConstructor("client/src/input/touch.js", "Touch", context);
  const touch = new Touch();

  touch.__handleHotbarSlotTap(0);
  assert.deepStrictEqual(opened, [{ id: "hotbar-config-modal", index: 0 }]);

  touch.__handleHotbarSlotTap(1);
  touch.__handleHotbarSlotTap(2);
  touch.__handleHotbarSlotTap(3);
  assert.deepStrictEqual(pressed, [113, 114, 115]);

  touch.__openHotbarSlotEditor(2);
  assert.deepStrictEqual(opened[1], { id: "hotbar-config-modal", index: 2 });
})();

(function testJoystickTracksOnlyItsOwnFinger() {
  const context = {
    console,
    navigator: { maxTouchPoints: 0, vibrate() {} },
    window: {
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener() {}
    },
    document: { querySelector: () => null },
    MobileControlLayout: function () {
      this.register = function () {};
      this.reset = function () {};
    }
  };

  const Touch = loadConstructor("client/src/input/touch.js", "Touch", context);
  const controls = new Touch();
  controls.joystickZone = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
  };
  controls.__processJoystickInput = function () {};
  controls.__updateJoystickVisual = function () {};
  controls.__stopJoystickMovementLoop = function () {};
  controls.__resetJoystickVisual = function () {};

  const finger = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });
  const event = (touches, changedTouches) => ({
    touches,
    changedTouches,
    preventDefault() {}
  });

  const joystickFinger = finger(11, 60, 50);
  controls.__handleJoystickStart(event([joystickFinger], [joystickFinger]));
  assert.strictEqual(controls.joystick.touchIdentifier, 11);

  const buttonFinger = finger(22, 500, 200);
  const movedJoystickFinger = finger(11, 72, 50);
  controls.__handleJoystickMove(event(
    [buttonFinger, movedJoystickFinger],
    [movedJoystickFinger]
  ));
  assert.strictEqual(controls.joystick.currentX, 72, "A second finger must not steer the joystick");

  controls.__handleJoystickEnd(event([movedJoystickFinger], [buttonFinger]));
  assert.strictEqual(controls.joystick.active, true, "Releasing another finger must not stop movement");

  controls.__handleJoystickEnd(event([], [movedJoystickFinger]));
  assert.strictEqual(controls.joystick.active, false);
  assert.strictEqual(controls.joystick.touchIdentifier, null);
})();

console.log("Client mobile controls tests passed.");
