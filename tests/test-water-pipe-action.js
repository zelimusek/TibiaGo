"use strict";

const assert = require("assert");
let writes = [];

class RadioStreamPacket {
  constructor(enabled, url, volume) {
    this.enabled = enabled;
    this.url = url;
    this.volume = volume;
  }
}

global.requireModule = function(name) {
  assert.strictEqual(name, "network/protocol");
  return { RadioStreamPacket: RadioStreamPacket };
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
let broadcast = writes.find(function(entry) { return entry.packet && entry.packet.url; });
assert(broadcast, "missing smoke packet");
assert.strictEqual(broadcast.floor, 7);
let payload = JSON.parse(decodeURIComponent(broadcast.packet.url.slice("pipe-smoke:".length)));
assert.deepStrictEqual([payload.x, payload.y, payload.z], [32515, 32346, 7]);
assert.strictEqual(payload.intensity, 1);
assert.strictEqual(payload.dose, 1);
assert.strictEqual(payload.sourceId, 123);
assert(writes.some(function(entry) { return entry.effect === 3; }), "missing POFF effect");

console.log("water-pipe action OK");
