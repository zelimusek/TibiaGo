"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const storage = new Map();
const windowListeners = new Map();
const documentListeners = new Map();
const beacons = [];
let diagnosticNow = 0;

const localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, value); },
  removeItem(key) { storage.delete(key); }
};

const context = vm.createContext({
  console,
  Date,
  JSON,
  Math,
  Map,
  String,
  Error,
  Promise,
  document: {
    visibilityState: "visible",
    addEventListener(type, callback) { documentListeners.set(type, callback); }
  },
  window: {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    localStorage,
    performance: {
      now() { return diagnosticNow; },
      memory: {
        usedJSHeapSize: 12000000,
        totalJSHeapSize: 16000000,
        jsHeapSizeLimit: 100000000
      }
    },
    navigator: {
      sendBeacon(url, body) {
        beacons.push({ url, body });
        return true;
      }
    },
    addEventListener(type, callback) { windowListeners.set(type, callback); },
    fetch() { return Promise.resolve(); }
  }
});
context.window.window = context.window;

const source = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "utils", "error.js"),
  "utf8"
);
vm.runInContext(source, context);

context.window.gameClient = {
  player: { name: "Zell" },
  networkManager: {
    __diagnosticConnectionId: "connection-1",
    __lastServerOpcode: 25,
    isConnected() { return true; }
  },
  renderer: {
    debugger: { __nFrames: 123 },
    weatherCanvas: {
      __discoLights: {
        spotlightsEnabled: true,
        legacyLasersEnabled: true,
        radius: 5,
        intensity: 80,
        spotlightSpeed: 100,
        focus: {
          targetId: 777,
          targetName: "Zell",
          source: "floor-lava-winner",
          persistent: false,
          includeLasers: true,
          elapsedMs: 500,
          durationMs: 11200,
          vipShow: {
            effect: "vortex",
            preset: "rainbow",
            intensity: "normal",
            crowd: true,
            participants: [{ targetId: 778 }, { targetId: 779 }]
          }
        },
        laserShow: null
      }
    }
  }
};

context.window.tibiaDiagnostics.record("websocket-close", { code: 1006 }, true);

const entries = context.window.tibiaDiagnostics.getEntries();
assert.strictEqual(entries.length, 1);
assert.strictEqual(entries[0].context.character, "Zell");
assert.strictEqual(entries[0].context.lastServerOpcode, 25);
assert.strictEqual(entries[0].context.disco.focus.source, "floor-lava-winner");
assert.strictEqual(entries[0].context.disco.focus.vipShow.preset, "rainbow");
assert.strictEqual(entries[0].context.disco.focus.vipShow.effect, "vortex");
assert.strictEqual(entries[0].context.disco.focus.vipShow.crowd, true);
assert.strictEqual(entries[0].context.disco.focus.vipShow.participantCount, 2);
assert.strictEqual(entries[0].context.disco.focus.vipShow.title, undefined);
assert.strictEqual(beacons.length, 1);
assert.strictEqual(beacons[0].url, "/api/client-diagnostics");

windowListeners.get("error")({
  message: "render failed",
  filename: "weather-canvas.js",
  lineno: 10,
  colno: 4,
  error: new Error("render failed")
});
assert.strictEqual(context.window.tibiaDiagnostics.getEntries().length, 2);
assert.strictEqual(beacons.length, 2);

documentListeners.get("contextlost")({ target: { id: "screen" } });
assert.strictEqual(context.window.tibiaDiagnostics.getEntries().length, 3);
assert.strictEqual(beacons.length, 3);

diagnosticNow = 100;
context.window.tibiaDiagnostics.markMovementSent(1, { x: 100, y: 200, z: 7 });
diagnosticNow = 400;
context.window.tibiaDiagnostics.markMovementConfirmed();
let afterMovement = context.window.tibiaDiagnostics.getEntries();
assert.strictEqual(afterMovement.length, 4);
assert.strictEqual(afterMovement[3].type, "movement-confirmation-lag");
assert.strictEqual(afterMovement[3].details.acknowledgementMs, 300);

diagnosticNow = 500;
for (let i = 0; i < 8; i++) {
  diagnosticNow += 50;
  context.window.tibiaDiagnostics.markRadioAmbience(600, "lobby");
}
let afterRadio = context.window.tibiaDiagnostics.getEntries();
assert.strictEqual(afterRadio.length, 5);
assert.strictEqual(afterRadio[4].type, "radio-ambience-flood");
assert.strictEqual(afterRadio[4].details.packetsLast5s, 8);

diagnosticNow = 1000;
context.window.tibiaDiagnostics.markFrame(diagnosticNow, 16);
diagnosticNow = 1400;
context.window.tibiaDiagnostics.markFrame(diagnosticNow, 400);
let afterFrame = context.window.tibiaDiagnostics.getEntries();
assert.strictEqual(afterFrame.length, 6);
assert.strictEqual(afterFrame[5].type, "client-frame-stall");
assert.strictEqual(context.window.tibiaDiagnostics.getPerformanceSnapshot().frame.stalls, 1);

diagnosticNow = 2000;
context.window.tibiaDiagnostics.markNetworkFrameReceived(40);
diagnosticNow = 2100;
context.window.tibiaDiagnostics.markMovementSent(2, { x: 101, y: 200, z: 7 });
context.window.tibiaDiagnostics.markNetworkFrameSent(1, 12);
diagnosticNow = 2600;
context.window.tibiaDiagnostics.markNetworkFrameReceived(80);
let afterTransportGap = context.window.tibiaDiagnostics.getEntries();
assert.strictEqual(afterTransportGap.length, 7);
assert.strictEqual(afterTransportGap[6].type, "client-websocket-frame-gap");
assert.strictEqual(afterTransportGap[6].details.sequence, 2);
assert.strictEqual(afterTransportGap[6].details.gapMs, 600);
let transportSnapshot = context.window.tibiaDiagnostics.getPerformanceSnapshot().network;
assert.strictEqual(transportSnapshot.receiveFrames, 2);
assert.strictEqual(transportSnapshot.receiveBytes, 120);
assert.strictEqual(transportSnapshot.sendFrames, 1);
assert.strictEqual(transportSnapshot.sendBytes, 1);
assert.strictEqual(transportSnapshot.sendBufferedAmount, 12);

console.log("PASS: client diagnostics distinguish rendering, movement and ambience stalls.");
