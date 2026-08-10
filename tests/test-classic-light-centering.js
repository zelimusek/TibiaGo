"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const arcs = [];
const bubbles = [];

function Canvas() {}
function RGBA() {}

const context = vm.createContext({
  console,
  Math,
  Canvas,
  RGBA,
});

vm.runInContext(
  fs.readFileSync(path.join(root, "client", "src", "rendering", "light-canvas.js"), "utf8") +
    "\nthis.LightCanvas = LightCanvas;",
  context,
  { filename: "light-canvas.js" }
);

const lightCanvas = Object.create(context.LightCanvas.prototype);
lightCanvas.context = {
  beginPath() {},
  arc(x, y, radius) {
    arcs.push({ x, y, radius });
  },
  fill() {},
  fillStyle: "",
};
lightCanvas.getGradient = () => "gradient";

lightCanvas.renderLightBubble(7, 5, 2, 23);
assert.deepStrictEqual(
  arcs[0],
  { x: 240, y: 176, radius: 64 },
  "a classic DAT light must be centred in its 32x32 tile"
);

const rendererContext = vm.createContext({
  console,
  performance: { now: () => 0 },
  ConditionManager: function ConditionManager() {},
  gameClient: {
    interface: {
      settings: {
        isWeatherEnabled: () => false,
        isLightingEnabled: () => true,
      },
    },
    player: {
      hasCondition: () => false,
    },
  },
});
rendererContext.ConditionManager.prototype.LIGHT = 7;

vm.runInContext(
  fs.readFileSync(path.join(root, "client", "src", "rendering", "renderer.js"), "utf8") +
    "\nthis.Renderer = Renderer;",
  rendererContext,
  { filename: "renderer.js" }
);

const renderer = Object.create(rendererContext.Renderer.prototype);
renderer.screen = {
  clear() {},
  context: { drawImage() {} },
};
renderer.getTileCache = () => [];
renderer.getCreatureScreenPosition = () => ({ x: 7, y: 4.75 });
renderer.lightscreen = {
  canvas: {},
  renderLightBubble() {
    bubbles.push(Array.from(arguments));
  },
  setup() {},
};
renderer.weatherCanvas = {
  drawPipeSmoke() {},
  renderDiscoIllumination() {},
  drawDiscoLights() {},
  drawIntoxication() {},
};
renderer.totalDrawTime = 0;

renderer.__renderWorld();
assert.strictEqual(bubbles.length, 1);
assert.deepStrictEqual(
  bubbles[0].slice(0, 4),
  [7, 4.75, 2, 23],
  "the player's light must follow the creature's elevated render anchor"
);

console.log("Classic light centering tests passed.");
