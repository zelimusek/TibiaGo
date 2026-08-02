"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let now = 10000;
let fills = 0;
let strokes = 0;
let roundedCaps = 0;
let ellipseScales = 0;

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
  quadraticCurveTo() { roundedCaps++; },
  translate() {},
  scale(x, y) {
    if (x === 1 && y === 0.68) ellipseScales++;
  },
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
    world: {
      getCreature() {
        return null;
      },
    },
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

weather.setDiscoLights(true, true, 80, 0, 120, 6, {
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
const preFocusTargets = weather.__getDiscoLightFrame().lights.map((light) => ({
  x: light.targetX,
  y: light.targetY,
}));

const focusedPosition = new Position(32516, 32348, 7);
context.gameClient.world.getCreature = function (id) {
  return id === 777 ? { getPosition: () => focusedPosition } : null;
};
weather.setDiscoLights(true, true, 80, 100, 120, 6, {
  x: 32515,
  y: 32346,
  z: 7,
}, {
  targetId: 777,
  targetPosition: { x: 32516, y: 32348, z: 7 },
  durationMs: 8000,
  flashDurationMs: 3000,
  flashCount: 3,
});
lights.length = 0;
context.gameClient.renderer.debugger.__nFrames++;
weather.renderDiscoIllumination(lightCanvas);
let focusedTargets = lights.filter((entry, index) => index % 2 === 0);
const initialFocusCenterX = (focusedPosition.x - 32508 + 0.5) * 32;
const initialFocusCenterY = (focusedPosition.y - 32335 + 0.5) * 32;
assert.ok(focusedTargets.every((entry, index) =>
  Math.abs(entry[0] - preFocusTargets[index].x) < 0.01
  && Math.abs(entry[1] - preFocusTargets[index].y) < 0.01
), "focus should begin from the spotlights' current dance-floor targets");
assert.ok(focusedTargets.every((entry) => entry[2] >= 120), "focused targets should retain the full-sized spotlight pools");
assert.strictEqual(weather.__getDiscoLightFrame().focusFlashOn, true, "the winner sequence should begin with an intense flash");
roundedCaps = 0;
ellipseScales = 0;
strokes = 0;
weather.drawDiscoLights();
assert.strictEqual(roundedCaps, 4, "each focused beam should end with a rounded cap");
assert.strictEqual(ellipseScales, 4, "each focused target should render as a perspective ellipse");
assert.strictEqual(strokes, 9, "the active laser fans should remain present when focus begins");
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusAmount, 0, "lasers should begin from their current fan angles");

now += 650;
context.gameClient.renderer.debugger.__nFrames++;
assert.ok(
  weather.__getDiscoLightFrame().lights.some((light, index) =>
    Math.abs(light.targetX - preFocusTargets[index].x) > 1
    || Math.abs(light.targetY - preFocusTargets[index].y) > 1
  ),
  "the existing spotlights should visibly travel toward the focused player"
);
assert.strictEqual(weather.__getDiscoLightFrame().focusFlashOn, false, "the first flash should visibly switch off");
assert.ok(weather.__getDiscoLightFrame().laserFocusAmount > 0 && weather.__getDiscoLightFrame().laserFocusAmount < 1, "lasers should turn toward the player during the 1.3 second transition");
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusRadius, 38, "lasers should spread into a star between winner flashes");

now += 650;
lights.length = 0;
context.gameClient.renderer.debugger.__nFrames++;
weather.renderDiscoIllumination(lightCanvas);
focusedTargets = lights.filter((entry, index) => index % 2 === 0);
const initialOrbitDistances = focusedTargets.map((entry) => Math.hypot(entry[0] - initialFocusCenterX, entry[1] - initialFocusCenterY));
assert.strictEqual(new Set(focusedTargets.map((entry) => entry[0] + ":" + entry[1])).size, 4, "focused spotlights should keep four separate colored targets");
assert.ok(initialOrbitDistances.every((distance) => distance >= 21 && distance <= 23), "focused colors should settle into a constant circular orbit");
const initialBlueVector = {
  x: focusedTargets[0][0] - initialFocusCenterX,
  y: focusedTargets[0][1] - initialFocusCenterY,
};
assert.strictEqual(weather.__getDiscoLightFrame().focusFlashOn, true, "the second one-second flash should switch on");
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusAmount, 1, "lasers should complete their turn after 1.3 seconds");
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusRadius, 10, "lasers should converge closer during a winner flash");

now += 450;
context.gameClient.renderer.debugger.__nFrames++;
const rotatedFrame = weather.__getDiscoLightFrame();
const rotatedBlueVector = {
  x: rotatedFrame.lights[0].targetX - initialFocusCenterX,
  y: rotatedFrame.lights[0].targetY - initialFocusCenterY,
};
assert.ok(
  initialBlueVector.x * rotatedBlueVector.y - initialBlueVector.y * rotatedBlueVector.x > 0,
  "focused colors should travel clockwise around the player"
);

focusedPosition.x++;
now += 250;
lights.length = 0;
context.gameClient.renderer.debugger.__nFrames++;
weather.renderDiscoIllumination(lightCanvas);
focusedTargets = lights.filter((entry, index) => index % 2 === 0);
const previousFocusedX = (focusedPosition.x - 1 - 32508 + 0.5) * 32;
const desiredFocusedX = (focusedPosition.x - 32508 + 0.5) * 32;
const followedCenterX = focusedTargets.reduce((total, entry) => total + entry[0], 0) / focusedTargets.length;
assert.ok(
  followedCenterX > previousFocusedX && followedCenterX < desiredFocusedX,
  "spotlights should glide toward a moving player instead of snapping to the next tile"
);
assert.strictEqual(weather.__getDiscoLightFrame().focusFlashOn, true, "the third one-second flash should switch on");

now += 1100;
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().focusFlashing, false, "flashing should finish after three seconds");
assert.strictEqual(weather.__getDiscoLightFrame().focusActive, true, "steady winner lighting should remain until eight seconds");

weather.setDiscoLights(true, true, 80, 100, 120, 6, {
  x: 32515,
  y: 32346,
  z: 7,
}, {
  targetId: 777,
  targetPosition: { x: 32517, y: 32348, z: 7 },
  elapsedMs: 3100,
  durationMs: 8000,
  flashDurationMs: 3000,
  flashCount: 3,
});
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().focusFlashing, false, "resyncing must not restart the three flashes");

now += 5000;
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().focusActive, false, "winner focus should end after eight seconds");

weather.setDiscoLights(true, true, 80, 100, 120, 6, {
  x: 32515,
  y: 32346,
  z: 7,
}, {
  targetId: 777,
  targetPosition: { x: 32517, y: 32348, z: 7 },
  persistent: true,
  durationMs: null,
  flashDurationMs: 0,
  flashCount: 0,
});
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().focusActive, true, "manual focus should work until explicitly disabled");
assert.strictEqual(weather.__getDiscoLightFrame().focusFlashing, false, "manual focus must never use winner flashes");
now += 60000;
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().focusActive, true, "persistent manual focus should not expire");
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusRadius, 28, "manual focus should use the steady rotating laser cage");

weather.setDiscoLights(true, true, 80, 100, 120, 6, {
  x: 32515,
  y: 32346,
  z: 7,
}, null);
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusAmount, 1, "laser return should begin from the focused cage");
now += 1300;
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusAmount, 0, "lasers should return to normal fans over 1.3 seconds");

weather.setDiscoLights(false, false, 80, 100, 120, 6, {
  x: 32515,
  y: 32346,
  z: 7,
}, {
  targetId: 777,
  targetPosition: { x: 32517, y: 32348, z: 7 },
  persistent: true,
  durationMs: null,
  flashDurationMs: 0,
  flashCount: 0,
});
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame(), null, "focus must not create replacement spotlights when the venue spotlights are disabled");

weather.setDiscoLights(false, false, 80, 100, 120, 6, null);
lights.length = 0;
lightBeams.length = 0;
weather.renderDiscoIllumination(lightCanvas);
assert.strictEqual(lights.length, 0, "disabled disco lighting must stop rendering");
assert.strictEqual(lightBeams.length, 0, "disabled disco beams must stop illuminating");

console.log("PASS: disco spotlights illuminate, draw and move across the dance floor.");
