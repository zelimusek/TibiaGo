"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let now = 30000;
let closeRequest = null;
let recoveryRecords = [];

function State() {
  this.connected = true;
}
State.prototype.add = function (name, value) { this[name] = value; };

const context = vm.createContext({
  console,
  Date,
  Math,
  Number,
  State,
  PacketHandler: function PacketHandler() {},
  document: { visibilityState: "visible" },
  window: {
    performance: { now() { return now; } },
    setTimeout(callback) { callback(); },
    tibiaDiagnostics: {
      getPerformanceSnapshot() {
        return {
          frame: { lastGapMs: 8 },
          movement: { pending: { ageMs: 700 } }
        };
      },
      record(type, details) { recoveryRecords.push({ type, details }); }
    }
  },
  gameClient: {
    player: {},
    renderer: {},
    keyboard: { setInactive() {} },
    interface: { modalManager: { open() {} } }
  }
});

const source = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "network", "network-manager.js"),
  "utf8"
);
vm.runInContext(source + "\nthis.NetworkManager = NetworkManager;", context);

const manager = Object.create(context.NetworkManager.prototype);
manager.state = { connected: true };
manager.__connectedAt = Date.now() - 30000;
manager.__diagnosticConnectionId = "stalled-connection";
manager.__recoverAfterClose = false;
manager.__transportWatchdog = {
  lastFrameAt: now,
  recentGapAt: [],
  recoveryScheduled: false,
  recoveryInProgress: false,
  lastRecoveryAt: -Infinity
};
manager.socket = {
  readyState: 1,
  close(code, reason) { closeRequest = { code, reason }; }
};

for (let index = 0; index < 4; index++) {
  now += 700;
  assert.strictEqual(manager.__observeTransportHealth(), false);
}
assert.strictEqual(closeRequest, null, "a few isolated gaps must not reconnect the client");

now += 700;
assert.strictEqual(manager.__observeTransportHealth(), true);
assert.deepStrictEqual(closeRequest, {
  code: 4000,
  reason: "client-transport-recovery"
});
assert.strictEqual(manager.__recoverAfterClose, true);
assert.strictEqual(recoveryRecords.length, 1);
assert.strictEqual(recoveryRecords[0].type, "websocket-automatic-recovery");

closeRequest = null;
manager.__transportWatchdog.recoveryInProgress = false;
context.document.visibilityState = "hidden";
for (let index = 0; index < 6; index++) {
  now += 700;
  assert.strictEqual(manager.__observeTransportHealth(), false);
}
assert.strictEqual(closeRequest, null, "a hidden client must never trigger transport recovery");

console.log("PASS: sustained movement-only WebSocket stalls recover without reacting to idle or hidden tabs.");
