"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const storage = new Map();
const windowListeners = new Map();
const documentListeners = new Map();
const beacons = [];

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
    performance: {},
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
            preset: "rainbow",
            intensity: "normal",
            title: "DANCE FLOOR STAR!"
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

console.log("PASS: client diagnostics retain effect context and report critical failures.");
