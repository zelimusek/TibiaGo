"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let drawCalls = [];
let storage = new Map();

function Position(x, y, z) {
  this.x = x;
  this.y = y;
  this.z = z;
}

function Image() {
  this.onload = null;
  this.onerror = null;
}

const drawingContext = {
  save() {},
  restore() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  stroke() { drawCalls.push("stroke"); },
  fillRect() { drawCalls.push("fillRect"); },
  drawImage(image, x, y, width, height) {
    drawCalls.push({ type: "drawImage", x, y, width, height });
  },
  set imageSmoothingEnabled(value) {},
  set globalCompositeOperation(value) {},
  set globalAlpha(value) {},
  set fillStyle(value) {},
  set strokeStyle(value) {},
  set lineWidth(value) {},
  set lineCap(value) {},
  set lineJoin(value) {},
};

const thomas = { name: "DJ Thomas", getPosition() { return new Position(32514, 32337, 7); } };
const hubertuse = { name: "DJ Hubertuse", getPosition() { return new Position(32516, 32337, 7); } };

const context = vm.createContext({
  console,
  Image,
  Math,
  Number,
  Object,
  Position,
  URLSearchParams,
  performance: { now() { return 12500; } },
  window: {
    location: { search: "" },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); }
    },
    tibiaDiagnostics: { record() {} }
  },
  gameClient: {
    player: { getPosition() { return new Position(32515, 32344, 7); } },
    world: { activeCreatures: { 1: thomas, 2: hubertuse } },
    interface: {
      soundManager: {
        getRadioRhythm() {
          return { bpm: 140, phase: 0.25, pulse: 0.8, sequence: 7 };
        }
      }
    },
    renderer: {
      getStaticScreenPosition() { return new Position(4, 3, 0); },
      getCreatureScreenPosition(creature) {
        return creature === thomas ? new Position(4, 2, 0) : new Position(6, 2, 0);
      }
    }
  }
});
context.window.window = context.window;

const source = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "rendering", "dj-booth-animation.js"),
  "utf8"
);
vm.runInContext(source + "\nthis.DJBoothAnimation = DJBoothAnimation;", context);

const animation = new context.DJBoothAnimation({ context: drawingContext });
animation.__image.onload();
const disco = { center: { x: 32515, y: 32346, z: 7 }, beatBpm: 140 };

assert.strictEqual(animation.draw(disco), true);
let boothDraw = drawCalls.find(call => call && call.type === "drawImage");
assert.ok(boothDraw, "the shared DJ console should render");
assert.deepStrictEqual(
  { x: boothDraw.x, y: boothDraw.y, width: boothDraw.width, height: boothDraw.height },
  { x: 128, y: 72, width: 96, height: 40 },
  "the booth should overlap the lower part of the DJ outfits"
);
assert.ok(drawCalls.filter(call => call === "stroke").length >= 4, "both DJs should move an arm");

drawCalls = [];
assert.strictEqual(context.window.partyZoneDjAnimation.disable(), false);
assert.strictEqual(animation.draw(disco), false);
assert.deepStrictEqual(drawCalls, []);
assert.strictEqual(storage.get("partyzone-dj-animation-enabled"), "false");

assert.strictEqual(context.window.partyZoneDjAnimation.enable(), true);
assert.strictEqual(animation.draw({ center: { x: 100, y: 100, z: 7 }, beatBpm: 140 }), false);

console.log("PASS: PartyZone DJ booth renders, animates and has an isolated persistent fallback.");
