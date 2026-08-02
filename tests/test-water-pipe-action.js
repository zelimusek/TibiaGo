"use strict";

const assert = require("assert");
let writes = [];

class EffectMagicPacket {
  constructor(position, type) {
    this.position = position;
    this.type = type;
  }
}

global.requireModule = function(name) {
  assert.strictEqual(name, "network/protocol");
  return { EffectMagicPacket: EffectMagicPacket };
};
global.CONST = { EFFECT: { MAGIC: { POFF: 3 } } };
process.gameServer = {
  world: {
    getChunkFromWorldPosition: function() {
      return {
        broadcastFloor: function(floor, packet) {
          writes.push({ floor: floor, packet: packet });
        }
      };
    },
    sendMagicEffect: function(position, effect) {
      writes.push({ position: position, effect: effect });
    }
  }
};

const useWaterPipe = require("../data/740/actions/definitions/water-pipe.js");
const position = { x: 32515, y: 32346, z: 7 };
const player = {
  getId: function() { return 123; },
  getPosition: function() { return position; },
  write: function(packet) { writes.push({ packet: packet }); }
};
const item = { getPosition: function() { return position; } };

assert.strictEqual(useWaterPipe(player, null, 0, item), true);
let broadcast = writes.find(function(entry) { return entry.floor === 7 && entry.packet; });
assert(broadcast, "missing smoke packet");
assert.strictEqual(broadcast.floor, 7);
assert.deepStrictEqual(broadcast.packet.position, position);
assert.strictEqual(broadcast.packet.type, 200);
let privateEffect = writes.find(function(entry) { return entry.packet && entry.packet.type === 220; });
assert(privateEffect, "missing private intoxication effect");
assert(writes.some(function(entry) { return entry.effect === 3; }), "missing POFF effect");

console.log("water-pipe action OK");
