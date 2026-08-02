"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let now = 10000;
let fills = 0;
let strokes = 0;

function gradient() {
  return { addColorStop() {} };
}

const drawingContext = {
  save() {},
  restore() {},
  beginPath() {},
  rect() {},
  clip() {},
  moveTo() {},
  lineTo() {},
  closePath() {},
  fill() { fills++; },
  stroke() { strokes++; },
  fillRect() { fills++; },
  createLinearGradient: gradient,
  createRadialGradient: gradient,
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
};

function Position(x, y, z) {
  this.x = x;
  this.y = y;
  this.z = z;
}

const context = vm.createContext({
  console,
  Math,
  Number,
  Map,
  Position,
  performance: { now: () => now },
  Image: function Image() {},
  document: {
    createElement() {
      return { getContext: () => drawingContext };
    },
  },
  gameClient: {
    touch: null,
    renderer: {
      debugger: { __nFrames: 1 },
      getStaticScreenPosition(position) {
        return new Position(position.x - 32508, position.y - 32335, 0);
      },
    },
  },
});

vm.runInContext(
  "String.prototype.format = function () { " +
  "var args = arguments; var index = 0; " +
  "return this.replace(/%s/g, function () { return args[index++]; }); };",
  context
);

const source = fs.readFileSync(
  path.join(root, "client", "src", "rendering", "weather-canvas.js"),
  "utf8"
);
vm.runInContext(source + "\nthis.WeatherCanvas = WeatherCanvas;", context);

const weather = new context.WeatherCanvas({
  canvas: { width: 480, height: 352 },
  context: drawingContext,
});
const lights = [];
const lightBeams = [];
const lightCanvas = {
  renderColorLightBubble() {
    lights.push(Array.from(arguments));
  },
  renderColorLightBeam() {
    lightBeams.push(Array.from(arguments));
  },
};

weather.setDiscoLights(true, true, 80, 100, 120, 6, {
  x: 32515,
  y: 32346,
  z: 7,
});
weather.renderDiscoIllumination(lightCanvas);

assert.strictEqual(lights.length, 8, "four pools and four fixture halos expected");
assert.strictEqual(lightBeams.length, 4, "the complete four cones should illuminate the world");
assert.strictEqual(
  new Set(lights.map((entry) => entry[3].join(","))).size,
  4,
  "all four spotlight colors should be present"
);
assert.ok(lights.filter((entry) => entry[2] >= 120).length === 4, "spotlight targets should have broad pools of light");
assert.ok(lights.every((entry) => entry[5] && entry[5].width > 0));

weather.drawDiscoLights();
assert.ok(fills >= 8, "each spotlight should draw a cone and target halo");
assert.strictEqual(strokes, 9, "new spotlights have no laser cores; three original three-ray lasers expected");

const firstTargetX = lights[0][0];
lights.length = 0;
lightBeams.length = 0;
now += 600;
context.gameClient.renderer.debugger.__nFrames++;
weather.renderDiscoIllumination(lightCanvas);
assert.notStrictEqual(lights[0][0], firstTargetX, "spotlight pool should move between frames");
assert.strictEqual(lightBeams.length, 4);

weather.setDiscoLights(true, false, 80, 100, 120, 6, {
  x: 32515,
  y: 32346,
  z: 7,
});
lights.length = 0;
lightBeams.length = 0;
strokes = 0;
context.gameClient.renderer.debugger.__nFrames++;
weather.renderDiscoIllumination(lightCanvas);
weather.drawDiscoLights();
assert.strictEqual(lightBeams.length, 4, "spotlight-only mode should illuminate four cones");
assert.strictEqual(strokes, 0, "new spotlights must not draw thin laser beams");

weather.setDiscoLights(false, true, 80, 100, 120, 6, {
  x: 32515,
  y: 32346,
  z: 7,
});
lights.length = 0;
lightBeams.length = 0;
strokes = 0;
context.gameClient.renderer.debugger.__nFrames++;
weather.renderDiscoIllumination(lightCanvas);
weather.drawDiscoLights();
assert.strictEqual(lightBeams.length, 0, "laser-only mode should not render spotlight illumination");
assert.strictEqual(strokes, 9, "laser-only mode should retain all original rays");

weather.setDiscoLights(true, false, 80, 0, 120, 6, {
  x: 32515,
  y: 32346,
  z: 7,
});
lights.length = 0;
context.gameClient.renderer.debugger.__nFrames++;
weather.renderDiscoIllumination(lightCanvas);
const staticTargetX = lights[0][0];
now += 1500;
lights.length = 0;
context.gameClient.renderer.debugger.__nFrames++;
weather.renderDiscoIllumination(lightCanvas);
assert.strictEqual(lights[0][0], staticTargetX, "Static speed should keep spotlight targets still");

weather.setDiscoLights(false, false, 80, 100, 120, 6, null);
lights.length = 0;
lightBeams.length = 0;
weather.renderDiscoIllumination(lightCanvas);
assert.strictEqual(lights.length, 0, "disabled disco lighting must stop rendering");
assert.strictEqual(lightBeams.length, 0, "disabled disco beams must stop illuminating");

console.log("PASS: disco spotlights illuminate, draw and move across the dance floor.");
