"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const packetHandlerSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "network", "packet-handler.js"),
  "utf8"
);
const worldSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "core", "world.js"),
  "utf8"
);

let constructed = 0;
let addedToWorld = [];
let addedToBattle = [];
let created = [];
const existing = { id: 77 };

const packetContext = vm.createContext({
  Creature: function Creature(packet) {
    constructed += 1;
    this.id = packet.id;
  },
  gameClient: {
    player: { id: 1 },
    world: {
      getCreature(id) {
        return id === existing.id ? existing : null;
      },
      addCreature(creature) {
        addedToWorld.push(creature);
      },
      createCreature(id, creature) {
        created.push({ id, creature });
        return creature;
      },
    },
    interface: {
      windowManager: {
        getWindow(name) {
          assert.strictEqual(name, "battle-window");
          return {
            addCreature(creature) {
              addedToBattle.push(creature);
            },
          };
        },
      },
    },
  },
});

vm.runInContext(
  packetHandlerSource + "\nthis.PacketHandler = PacketHandler;",
  packetContext,
  { filename: "packet-handler.js" }
);

const handler = new packetContext.PacketHandler();
handler.handleEntityReference({ id: 77 });

assert.strictEqual(constructed, 0, "A repeated entity ID must not construct another Creature.");
assert.deepStrictEqual(addedToWorld, [existing], "The existing creature should be restored to its tile idempotently.");
assert.deepStrictEqual(addedToBattle, [existing], "The battle list should reuse the existing creature.");
assert.strictEqual(created.length, 0, "A repeated entity must not replace the active-creature cache entry.");

handler.handleEntityReference({ id: 88 });
assert.strictEqual(constructed, 1, "A genuinely new ID must construct one Creature.");
assert.strictEqual(created.length, 1, "A genuinely new creature must be registered once.");
assert.strictEqual(created[0].id, 88);

let orphanRemoved = 0;
let worldAdds = [];
let battleAdds = [];
const cached = { id: 99 };
const fresh = {
  id: 99,
  remove() {
    orphanRemoved += 1;
  },
};
const worldContext = vm.createContext({
  gameClient: {
    interface: {
      windowManager: {
        getWindow() {
          return {
            addCreature(creature) {
              battleAdds.push(creature);
            },
          };
        },
      },
    },
  },
});

vm.runInContext(
  worldSource + "\nthis.World = World;",
  worldContext,
  { filename: "world.js" }
);

const fakeWorld = {
  activeCreatures: { 99: cached },
  addCreature(creature) {
    worldAdds.push(creature);
  },
};
const result = worldContext.World.prototype.createCreature.call(fakeWorld, 99, fresh);

assert.strictEqual(result, cached, "The cached entity remains canonical.");
assert.strictEqual(fakeWorld.activeCreatures[99], cached, "The active-creature cache must not be replaced.");
assert.strictEqual(orphanRemoved, 1, "A defensive duplicate DOM element must be removed.");
assert.deepStrictEqual(worldAdds, [cached], "Only the cached creature is added to a tile.");
assert.deepStrictEqual(battleAdds, [cached], "Only the cached creature is used in the battle list.");

console.log("PASS: repeated entity references cannot create tile or DOM ghosts.");
