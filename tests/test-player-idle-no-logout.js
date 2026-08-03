"use strict";

const assert = require("assert");
require("../require");

const scheduledEvents = [];
global.gameServer = {
  world: {
    eventQueue: {
      addEvent(callback, ticks) {
        const event = {
          callback,
          ticks,
          removed: false,
          remainingFrames() { return this.ticks; },
          remove() { this.removed = true; }
        };
        scheduledEvents.push(event);
        return event;
      }
    }
  }
};
process.gameServer = global.gameServer;

const PlayerIdleHandler = requireModule("player/player-idle-handler");
const player = {
  noLogout: true,
  writes: [],
  disconnects: 0,
  isInNoLogoutZone() { return this.noLogout; },
  write(packet) { this.writes.push(packet); },
  disconnect() { this.disconnects++; }
};
const handler = new PlayerIdleHandler(player);

assert.strictEqual(scheduledEvents.length, 2, "idle warning and kick should still be scheduled normally");

handler.__warnPlayer(player);
handler.__kickPlayer(player);
assert.strictEqual(player.writes.length, 0, "no-logout zones must suppress the idle warning");
assert.strictEqual(player.disconnects, 0, "no-logout zones must suppress the automatic idle logout");

player.noLogout = false;
handler.__warnPlayer(player);
handler.__kickPlayer(player);
assert.strictEqual(player.writes.length, 1, "the normal idle warning must remain active outside no-logout zones");
assert.strictEqual(player.disconnects, 1, "the normal idle logout must remain active outside no-logout zones");

handler.cleanup();
console.log("PASS: no-logout zones suppress both the idle warning and automatic disconnect.");
