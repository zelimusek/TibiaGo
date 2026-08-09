"use strict";

const assert = require("assert");

require("../require");

const PacketHandler = requireModule("network/packet-handler");
const UseHandler = requireModule("player/player-use-handler");

class Tile {
  constructor(item) {
    this.position = {};
    this.item = item;
  }

  peekIndex() {
    return this.item;
  }

  getTopItem() {
    return this.item;
  }
}

const taggedCrate = {
  __bombermanRoundTag: "bomberman:test:1",
  emitCalls: 0,
  emit() {
    this.emitCalls++;
  },
  isMoveable: () => true,
  hasUniqueId: () => false,
};
const source = new Tile(taggedCrate);
const destination = new Tile(null);
const messages = [];
const player = {
  position: {
    besides: () => true,
    inLineOfSight: () => true,
  },
  sendCancelMessage(message) {
    messages.push(message);
  },
  containerManager: {
    toggleContainer() {
      throw new Error("a Bomberman crate must never open as a container");
    },
  },
};

const packetHandler = Object.create(PacketHandler.prototype);
packetHandler.moveItem(player, {
  fromWhere: source,
  fromIndex: 0,
  toWhere: destination,
  toIndex: 0,
  count: 1,
});

assert.match(messages.at(-1), /cannot move this Bomberman object/i);

const useHandler = Object.create(UseHandler.prototype);
useHandler.__player = player;
useHandler.handleItemUse({ which: source, index: 0 });

assert.match(messages.at(-1), /cannot use this Bomberman object/i);
assert.strictEqual(taggedCrate.emitCalls, 0);

console.log("PASS: runtime Bomberman objects cannot be moved or opened.");
