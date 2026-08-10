"use strict";

const assert = require("assert");

require("../require");

const PacketHandler = requireModule("network/packet-handler");

function createItem(id) {
  return {
    id,
    count: 1,
    isMoveable: () => true,
    hasUniqueId: () => false,
    isContainer: () => false,
    isStackable: () => false,
    emit() {},
  };
}

class Container {
  constructor(slots, player) {
    this.slots = slots;
    this.player = player;
    this.added = [];
  }

  isContainer() { return true; }
  getSlots() { return this.slots; }
  getTopParent() { return this.player; }
  peekIndex(index) { return this.slots[index] || null; }
  getMaximumAddCount(_player, item, index) {
    let current = this.peekIndex(index);
    if (current === null) return 100;
    if (item.isStackable() && current.id === item.id) return 100 - current.count;
    return 0;
  }
  addThingSmart(item) {
    let empty = this.slots.indexOf(null);
    if (empty === -1) return false;
    this.slots[empty] = item;
    this.added.push(item);
    return true;
  }
}

class Equipment {
  constructor(backpack, player) {
    this.backpack = backpack;
    this.player = player;
  }

  peekIndex(index) {
    return index === CONST.EQUIPMENT.BACKPACK ? this.backpack : null;
  }
  getTopParent() { return this.player; }
  getMaximumAddCount() { return 0; }
  addThing() { throw new Error("The item must go inside the backpack, not replace it."); }
}

class Source {
  constructor(item, player) {
    this.item = item;
    this.player = player;
  }

  peekIndex() { return this.item; }
  removeIndex() {
    let item = this.item;
    this.item = null;
    return item;
  }
  addThing(item) { this.item = item; }
  getTopParent() { return this.player; }
}

const messages = [];
const player = {
  position: {
    besides: () => true,
    inLineOfSight: () => true,
  },
  hasSufficientCapacity: () => true,
  sendCancelMessage(message) { messages.push(message); },
};
const handler = Object.create(PacketHandler.prototype);

const occupied = createItem(100);
const firstMovedItem = createItem(200);
const backpack = new Container([occupied, null], player);
const equipment = new Equipment(backpack, player);
const firstSource = new Source(firstMovedItem, player);

handler.moveItem(player, {
  fromWhere: firstSource,
  fromIndex: 0,
  toWhere: equipment,
  toIndex: CONST.EQUIPMENT.BACKPACK,
  count: 1,
});

assert.deepStrictEqual(backpack.added, [firstMovedItem]);
assert.strictEqual(equipment.backpack, backpack);
assert.strictEqual(messages.length, 0);

const secondMovedItem = createItem(300);
const regularContainer = new Container([occupied, null], player);
const secondSource = new Source(secondMovedItem, player);

handler.moveItem(player, {
  fromWhere: secondSource,
  fromIndex: 0,
  toWhere: regularContainer,
  toIndex: 0,
  count: 1,
});

assert.deepStrictEqual(regularContainer.added, [secondMovedItem]);
assert.strictEqual(regularContainer.slots[0], occupied);
assert.strictEqual(messages.length, 0);

console.log("PASS: occupied container slots and the equipped backpack icon accept smart drops.");
