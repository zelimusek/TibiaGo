"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sent = [];
const context = {
  console,
  Image: function() { return {}; },
  ItemUsePacket: function(item) { this.kind = "use"; this.item = item; },
  ItemUseOnCreaturePacket: function(item, creatureId) {
    this.kind = "self";
    this.item = item;
    this.creatureId = creatureId;
  },
  gameClient: {
    player: { id: 77 },
    send: function(packet) { sent.push(packet); return packet; }
  }
};

const source = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "ui", "hotbar-manager.js"),
  "utf8"
);
vm.createContext(context);
vm.runInContext(source + "\nthis.HotbarManager = HotbarManager;", context);

function useItem(multiUse) {
  let item = { isMultiUse: function() { return multiUse; } };
  let itemObject = {
    which: { peekItem: function() { return item; } },
    index: 0
  };
  let manager = Object.create(context.HotbarManager.prototype);
  manager.__findItemObject = function() { return itemObject; };
  manager.__useItemSlot({ item: { id: 2974, mode: "self" } });
}

useItem(false);
assert.strictEqual(sent[0].kind, "use", "direct-use item should send ItemUsePacket");

useItem(true);
assert.strictEqual(sent[1].kind, "self", "multi-use item should target the player");
assert.strictEqual(sent[1].creatureId, 77);

console.log("Hotbar hybrid use tests passed.");
