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
let currentLineStart = null;
let currentLineLength = null;
let currentLineEnd = null;
let strokeLengths = [];
let strokeEndpoints = [];
let arcRadii = [];
let arcCenters = [];
const observerCameraOffset = { x: 0, y: 0 };

function gradient() {
  return { addColorStop() {} };
}

const drawingContext = {
  save() {},
  restore() {},
  beginPath() {},
  rect() {},
  clip() {},
  moveTo(x, y) { currentLineStart = { x, y }; },
  lineTo(x, y) {
    currentLineEnd = { x, y };
    if (currentLineStart) currentLineLength = Math.hypot(x - currentLineStart.x, y - currentLineStart.y);
  },
  quadraticCurveTo() { roundedCaps++; },
  arc(x, y, radius) {
    arcCenters.push({ x, y });
    arcRadii.push(radius);
  },
  translate() {},
  scale(x, y) {
    if (x === 1 && y === 0.68) ellipseScales++;
  },
  closePath() {},
  fill() { fills++; },
  stroke() {
    strokes++;
    strokeLengths.push(currentLineLength);
    strokeEndpoints.push(currentLineEnd);
  },
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
        return new Position(
          position.x - 32508 + observerCameraOffset.x,
          position.y - 32335 + observerCameraOffset.y,
          0
        );
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

assert.strictEqual(weather.__getDiscoLightFrame(), null, "the renderer must stay safe before the first radio ambience packet arrives");

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

roundedCaps = 0;
ellipseScales = 0;
weather.drawDiscoLights();
assert.ok(fills >= 8, "each spotlight should draw a cone and target halo");
assert.strictEqual(roundedCaps, 4, "ordinary spotlight beams should also end with rounded caps");
assert.strictEqual(ellipseScales, 4, "ordinary spotlight targets should use the same perspective ellipses as focused lights");
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
  durationMs: 11200,
  flashDurationMs: 3000,
  flashCount: 3,
  includeLasers: true,
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
strokeLengths = [];
strokeEndpoints = [];
arcRadii = [];
arcCenters = [];
weather.drawDiscoLights();
assert.strictEqual(roundedCaps, 4, "each focused beam should end with a rounded cap");
assert.strictEqual(ellipseScales, 4, "each focused target should render as a perspective ellipse");
assert.strictEqual(strokes, 9, "the active laser fans should remain present when focus begins");
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusAmount, 0, "lasers should begin from their current fan angles");
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusRadius, 160, "focused lasers should begin as a very large ring around the player");
assert.ok(strokeLengths.every((length) => length > 700), "laser beams should begin at their normal full-screen length");
assert.strictEqual(arcRadii.length, 0, "normal full-length laser fans should not draw focused endpoint dots");

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
const winnerRadiusAt650 = weather.__getDiscoLightFrame().laserFocusRadius;
assert.ok(winnerRadiusAt650 > 40 && winnerRadiusAt650 < 160, "the winner laser ring should begin shrinking during its entrance");

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
const winnerRadiusAt1300 = weather.__getDiscoLightFrame().laserFocusRadius;
assert.ok(winnerRadiusAt1300 > 40 && winnerRadiusAt1300 < winnerRadiusAt650, "the winner ring should keep shrinking smoothly after the beams arrive");
strokes = 0;
strokeLengths = [];
strokeEndpoints = [];
arcRadii = [];
arcCenters = [];
weather.drawDiscoLights();
assert.strictEqual(strokeLengths.length, 9, "focused laser fans should retain all nine beams");
assert.ok(strokeLengths.every((length) => length < 500), "focused lasers should stop around the winner instead of crossing the entire screen");
assert.strictEqual(
  new Set(strokeEndpoints.map((endpoint) => endpoint.x.toFixed(3) + ":" + endpoint.y.toFixed(3))).size,
  9,
  "all nine focused lasers should have independently controlled targets"
);
assert.ok(
  strokeEndpoints.every((endpoint) => {
    let distance = Math.hypot(endpoint.x - initialFocusCenterX, endpoint.y - initialFocusCenterY);
    return distance >= winnerRadiusAt1300 - 0.1 && distance <= winnerRadiusAt1300 + 0.1;
  }),
  "the nine independent laser targets should form a ring around the winner"
);
assert.deepStrictEqual(Array.from(arcRadii), Array(9).fill(4), "each focused laser should end with a dot wider than its three-pixel beam");
assert.ok(
  arcCenters.every((center, index) =>
    Math.abs(center.x - strokeEndpoints[index].x) < 0.01
    && Math.abs(center.y - strokeEndpoints[index].y) < 0.01
  ),
  "each bright endpoint dot should be centered on its independently controlled laser"
);

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
const desiredFocusedX = (focusedPosition.x - 32508 + 0.5) * 32;
const followedCenterX = focusedTargets.reduce((total, entry) => total + entry[0], 0) / focusedTargets.length;
assert.ok(Math.abs(followedCenterX - desiredFocusedX) < 0.01,
  "spotlights should use the creature renderer's exact screen anchor without a second movement delay"
);

observerCameraOffset.x = -0.35;
observerCameraOffset.y = 0.2;
now += 16;
lights.length = 0;
context.gameClient.renderer.debugger.__nFrames++;
weather.renderDiscoIllumination(lightCanvas);
focusedTargets = lights.filter((entry, index) => index % 2 === 0);
const observerAdjustedCenterX = focusedTargets.reduce((total, entry) => total + entry[0], 0) / focusedTargets.length;
const observerAdjustedCenterY = focusedTargets.reduce((total, entry) => total + entry[1], 0) / focusedTargets.length;
assert.ok(Math.abs(observerAdjustedCenterX - (desiredFocusedX + observerCameraOffset.x * 32)) < 0.01,
  "a moving observer should see focused lights remain locked to the target on the same frame"
);
assert.ok(Math.abs(observerAdjustedCenterY - ((focusedPosition.y - 32335 + 0.5 + observerCameraOffset.y) * 32)) < 0.01,
  "observer camera movement should not leave a vertical spotlight trail"
);
observerCameraOffset.x = 0;
observerCameraOffset.y = 0;
assert.strictEqual(weather.__getDiscoLightFrame().focusFlashOn, true, "the third one-second flash should switch on");

now += 1100;
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().focusFlashing, false, "flashing should finish after three seconds");
assert.strictEqual(weather.__getDiscoLightFrame().focusActive, true, "steady winner lighting should remain until 11.2 seconds");
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusRadius, 40, "the winner laser entrance should settle at the normal ring size");

weather.setDiscoLights(true, true, 80, 100, 120, 6, {
  x: 32515,
  y: 32346,
  z: 7,
}, {
  targetId: 777,
  targetPosition: { x: 32517, y: 32348, z: 7 },
  elapsedMs: 3100,
  durationMs: 11200,
  flashDurationMs: 3000,
  flashCount: 3,
  includeLasers: true,
});
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().focusFlashing, false, "resyncing must not restart the three flashes");

now += 8100;
context.gameClient.renderer.debugger.__nFrames++;
const expiryStartFrame = weather.__getDiscoLightFrame();
const expiryStartTargets = expiryStartFrame.lights.map((light) => ({ x: light.targetX, y: light.targetY }));
assert.strictEqual(expiryStartFrame.focusActive, false, "winner focus should end after 11.2 seconds");
assert.strictEqual(expiryStartFrame.laserFocusAmount, 1, "naturally expiring winner lasers should begin their return from the focused ring");
now += 650;
context.gameClient.renderer.debugger.__nFrames++;
const expiryMiddleFrame = weather.__getDiscoLightFrame();
assert.ok(expiryMiddleFrame.laserFocusAmount > 0 && expiryMiddleFrame.laserFocusAmount < 1, "winner lasers should spread out smoothly after natural expiry");
assert.ok(
  expiryMiddleFrame.lights.some((light, index) =>
    Math.abs(light.targetX - expiryStartTargets[index].x) > 1
    || Math.abs(light.targetY - expiryStartTargets[index].y) > 1
  ),
  "winner spotlights should travel smoothly back toward their dance-floor routes"
);
now += 650;
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusAmount, 0, "winner lasers should finish returning to their normal fans after 1.3 seconds");

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
  includeLasers: false,
});
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().focusActive, true, "manual focus should work until explicitly disabled");
assert.strictEqual(weather.__getDiscoLightFrame().focusFlashing, false, "manual focus must never use winner flashes");
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusAmount, 0, "/spotlight should leave already released winner lasers in their normal mode");
now += 1300;
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusAmount, 0, "/spotlight should leave the laser fans in their normal mode");
now += 60000;
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().focusActive, true, "persistent manual focus should not expire");

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
  includeLasers: true,
});
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusAmount, 0, "/spotlights should begin from the current normal laser fans");
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusRadius, 160, "/spotlights should begin with a very large laser ring");
now += 650;
context.gameClient.renderer.debugger.__nFrames++;
assert.ok(weather.__getDiscoLightFrame().laserFocusAmount > 0 && weather.__getDiscoLightFrame().laserFocusAmount < 1, "switching to /spotlights should turn the lasers smoothly");
const manualRadiusAt650 = weather.__getDiscoLightFrame().laserFocusRadius;
assert.ok(manualRadiusAt650 > 40 && manualRadiusAt650 < 160, "the /spotlights ring should shrink while the lasers turn toward the player");
now += 650;
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusAmount, 1, "switching to /spotlights should finish after 1.3 seconds");
assert.ok(weather.__getDiscoLightFrame().laserFocusRadius > 40 && weather.__getDiscoLightFrame().laserFocusRadius < manualRadiusAt650, "the /spotlights ring should continue shrinking after its direction transition");
now += 1100;
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame().laserFocusRadius, 40, "manual focus should use a larger steady rotating laser ring");

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
  includeLasers: true,
});
context.gameClient.renderer.debugger.__nFrames++;
assert.strictEqual(weather.__getDiscoLightFrame(), null, "focus must not create replacement spotlights when the venue spotlights are disabled");

weather.setDiscoLights(false, false, 80, 100, 120, 6, null);
lights.length = 0;
lightBeams.length = 0;
weather.renderDiscoIllumination(lightCanvas);
assert.strictEqual(lights.length, 0, "disabled disco lighting must stop rendering");
assert.strictEqual(lightBeams.length, 0, "disabled disco beams must stop illuminating");

function setLaserShow(mode, text, elapsedMs, durationMs) {
  weather.setDiscoLights(false, false, 80, 100, 120, 6, {
    x: 32515,
    y: 32346,
    z: 7,
  }, null, {
    mode,
    text,
    elapsedMs,
    durationMs,
  });
  context.gameClient.renderer.debugger.__nFrames++;
  return weather.__getDiscoLightFrame();
}

const kGlyph = weather.__getLaserGlyphLines("K", 0, 0, 100);
const mGlyph = weather.__getLaserGlyphLines("M", 0, 0, 100);
const nGlyph = weather.__getLaserGlyphLines("N", 0, 0, 100);
const bGlyph = weather.__getLaserGlyphLines("B", 0, 0, 100);
const dGlyph = weather.__getLaserGlyphLines("D", 0, 0, 100);
assert.strictEqual(kGlyph.length, 4, "K should use one complete stem and two clean diagonals");
assert.strictEqual(mGlyph.length, 6, "M should use two complete stems and two inward diagonals");
assert.strictEqual(
  mGlyph.filter((line) => Math.abs(line.x1 - line.x2) < 0.01).length,
  4,
  "M should retain both upper and lower halves of its vertical legs"
);
assert.strictEqual(nGlyph.length, 5, "N should use two complete stems and one long diagonal");
assert.strictEqual(
  nGlyph.filter((line) => Math.abs(line.x1 - line.x2) < 0.01).length,
  4,
  "N should retain both halves of both vertical legs"
);
assert.ok(
  nGlyph.some((line) => line.x1 < 0 && line.y1 < 0 && line.x2 > 0 && line.y2 > 0),
  "N should contain one readable top-left to bottom-right diagonal"
);
assert.strictEqual(bGlyph.length, 7, "B should have a complete stem and two closed block-shaped bowls");
assert.strictEqual(
  bGlyph.filter((line) => Math.abs(line.y1 - line.y2) < 0.01).length,
  3,
  "B should include clear top, middle and bottom bars"
);
assert.strictEqual(dGlyph.length, 6, "D should use a complete left stem with a closed top, right and bottom outline");
assert.strictEqual(
  dGlyph.filter((line) => Math.abs(line.x1 - line.x2) < 0.01).length,
  4,
  "D should retain both halves of its left and right vertical sides"
);
assert.strictEqual(
  dGlyph.filter((line) => Math.abs(line.y1 - line.y2) < 0.01).length,
  2,
  "D should have readable top and bottom bars without a false middle bar"
);

const partialLetter = weather.__getLaserTextChoreography("K", 0.4, 240, 176, 6, 900);
assert.ok(partialLetter.trailLines.length > 0 && partialLetter.trailLines.length < kGlyph.length, "the current letter should appear stroke by stroke instead of all at once");
const firstStrokeTarget = weather.__getLaserTextChoreography("K", 0, 240, 176, 6, 700);
assert.strictEqual(
  new Set(firstStrokeTarget.targets.map((target) => target.x.toFixed(3) + ":" + target.y.toFixed(3))).size,
  1,
  "all lasers should meet at the first writing stroke before drawing begins"
);

let showFrame = setLaserShow("default", "CYRK", 0, 75000);
assert.strictEqual(showFrame.laserShow.phase, "border-ignition");
assert.strictEqual(showFrame.laserShow.targets.length, 9);
assert.strictEqual(showFrame.spotlightsEnabled, true, "laser shows should temporarily enable their four choreographed spotlights");
assert.strictEqual(showFrame.legacyLasersEnabled, true, "laser shows should temporarily enable all nine laser beams");

showFrame = setLaserShow("default", "CYRK", 3900, 75000);
const phaseDepartureTargets = showFrame.laserShow.targets.map((target) => ({ x: target.x, y: target.y }));
now += 200;
context.gameClient.renderer.debugger.__nFrames++;
showFrame = weather.__getDiscoLightFrame();
assert.strictEqual(showFrame.laserShow.phase, "neon-frame");
assert.ok(
  showFrame.laserShow.targets.every((target, index) =>
    Math.abs(target.x - phaseDepartureTargets[index].x) < 0.01
    && Math.abs(target.y - phaseDepartureTargets[index].y) < 0.01
  ),
  "a new figure should begin from the previous figure's physical laser positions"
);
now += 450;
context.gameClient.renderer.debugger.__nFrames++;
showFrame = weather.__getDiscoLightFrame();
assert.ok(
  showFrame.laserShow.targets.some((target, index) =>
    Math.abs(target.x - phaseDepartureTargets[index].x) > 1
    || Math.abs(target.y - phaseDepartureTargets[index].y) > 1
  ),
  "lasers should visibly drive between figures instead of teleporting"
);

const defaultPhases = [
  [6000, "neon-frame"],
  [12000, "square-implosion"],
  [24000, "square-spiral"],
  [32000, "square-reactor"],
  [39000, "grid-scanner"],
  [46000, "power-grid"],
  [52000, "center-explosion"]
];
defaultPhases.forEach(function(sample) {
  showFrame = setLaserShow("default", "CYRK", sample[0], 75000);
  assert.strictEqual(showFrame.laserShow.phase, sample[1]);
  assert.strictEqual(showFrame.laserShow.targets.length, 9);
  assert.ok(
    showFrame.laserShow.targets.every((target) =>
      target.x >= 240 - 192.01 && target.x <= 240 + 192.01
      && target.y >= 368 - 192.01 && target.y <= 368 + 192.01
    ),
    sample[1] + " must keep every laser endpoint inside the 13x13 dance floor"
  );
});

showFrame = setLaserShow("default", "CYRK", 56000, 75000);
assert.strictEqual(showFrame.laserShow.phase, "text");
assert.ok(showFrame.laserShow.trailLines.length > 0, "the CYRK phase should retain already drawn laser letter strokes");
strokes = 0;
arcRadii = [];
weather.drawDiscoLights();
assert.ok(strokes > 9, "letter trails should be drawn in addition to the nine controlled beams");
assert.strictEqual(arcRadii.length, 9, "each choreographed laser should retain its bright endpoint dot");

showFrame = setLaserShow("default", "CYRK", 63000, 75000);
assert.strictEqual(showFrame.laserShow.phase, "text-hold");
assert.ok(showFrame.laserShow.trailLines.length > 10, "the complete CYRK text should remain visible during its five-second presentation");
assert.strictEqual(new Set(showFrame.laserShow.targets.map((target) => target.x.toFixed(2) + ":" + target.y.toFixed(2))).size, 9, "all nine lasers should orbit the completed text at separate positions");
assert.ok(showFrame.laserShow.trailLines.every((line) => line.alpha === 0.78), "the completed text should use an even presentation glow");

showFrame = setLaserShow("default", "CYRK", 70000, 75000);
assert.strictEqual(showFrame.laserShow.phase, "square-finale");
assert.ok(showFrame.laserShow.trailLines.length > 0, "the finale should expand nested squares back toward the dance-floor border");
showFrame = setLaserShow("text", "PARTY ZONE", 7000, 23600);
assert.strictEqual(showFrame.laserShow.phase, "text");
assert.ok(showFrame.laserShow.trailLines.length > 0, "custom text should use the synchronized vector laser alphabet");
showFrame = setLaserShow("text", "PARTY ZONE", 18000, 23600);
assert.strictEqual(showFrame.laserShow.phase, "text-hold");
assert.ok(showFrame.laserShow.trailLines.length > 20, "custom text should also remain fully visible for five seconds");
showFrame = setLaserShow("default", "CYRK", 74500, 75000);
assert.ok(showFrame.laserShow.amount > 0 && showFrame.laserShow.amount < 1, "the final 1.3 seconds should fade the show smoothly");
showFrame = setLaserShow("default", "CYRK", 75000, 75000);
assert.strictEqual(showFrame, null, "a completed show should release temporarily enabled venue lights");

const overdrivePhases = [
  [2000, "beam-awakening"],
  [9000, "neon-curtains"],
  [18000, "laser-clock"],
  [27000, "prism-split"],
  [36000, "laser-snake"],
  [46000, "neon-ping-pong"],
  [54000, "closing-gates"],
  [62000, "triple-orbit"],
  [71000, "laser-equalizer"],
  [79000, "dj-moment"],
  [88000, "text"],
  [94000, "text-hold"],
  [98000, "overdrive-finale"]
];
overdrivePhases.forEach(function(sample) {
  showFrame = setLaserShow("overdrive", "PARTY ZONE", sample[0], 100000);
  assert.strictEqual(showFrame.laserShow.phase, sample[1]);
  assert.strictEqual(showFrame.laserShow.targets.length, 9);
  if(sample[1] !== "dj-moment") {
    assert.ok(
      showFrame.laserShow.targets.every((target) =>
        target.x >= 240 - 192.01 && target.x <= 240 + 192.01
        && target.y >= 368 - 192.01 && target.y <= 368 + 192.01
      ),
      sample[1] + " must keep its laser endpoints on the dance floor"
    );
  }
});

const overdriveBoundaries = [7000, 15000, 23000, 31000, 42000, 50000, 58000, 67000, 75000, 93000, 95000];
overdriveBoundaries.forEach(function(boundary) {
  showFrame = setLaserShow("overdrive", "PARTY ZONE", boundary - 100, 100000);
  const before = showFrame.laserShow.targets.map((target) => ({ x: target.x, y: target.y }));
  now += 200;
  context.gameClient.renderer.debugger.__nFrames++;
  showFrame = weather.__getDiscoLightFrame();
  assert.ok(
    showFrame.laserShow.targets.every((target, index) =>
      Math.abs(target.x - before[index].x) < 0.01 && Math.abs(target.y - before[index].y) < 0.01
    ),
    "overdrive phase at " + boundary + "ms should physically depart from the previous laser positions"
  );
});

showFrame = setLaserShow("overdrive", "PARTY ZONE", 89900, 100000);
assert.strictEqual(showFrame.laserShow.phase, "text");
assert.ok(showFrame.laserShow.trailLines.length > 20, "NEON OVERDRIVE should draw PARTY ZONE stroke by stroke");
showFrame = setLaserShow("overdrive", "PARTY ZONE", 99500, 100000);
assert.ok(showFrame.laserShow.amount > 0 && showFrame.laserShow.amount < 1, "NEON OVERDRIVE should fade smoothly during its final 1.3 seconds");
showFrame = setLaserShow("overdrive", "PARTY ZONE", 100000, 100000);
assert.strictEqual(showFrame, null, "NEON OVERDRIVE should release the venue lights after 100 seconds");

const dimensionPhases = [
  [2000, "corner-awakening"],
  [11000, "neon-labyrinth"],
  [21000, "mirror-wings"],
  [29000, "diamond-gearbox"],
  [38000, "laser-dna"],
  [47000, "neon-pinball"],
  [56000, "big-top"],
  [65000, "prism-flowers"],
  [74000, "nine-tile-sequencer"],
  [83000, "laser-heartbeat"],
  [92000, "stacked-text"],
  [98000, "grand-presentation"]
];
dimensionPhases.forEach(function(sample) {
  showFrame = setLaserShow("dimension", "CYRK PARTY ZONE", sample[0], 100000);
  assert.strictEqual(showFrame.laserShow.phase, sample[1]);
  assert.strictEqual(showFrame.laserShow.targets.length, 9);
  const endpoints = showFrame.laserShow.targets.concat(
    showFrame.laserShow.trailLines.reduce((points, line) => points.concat([
      { x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }
    ]), [])
  );
  assert.ok(
    endpoints.every((target) =>
      target.x >= 240 - 176.01 && target.x <= 240 + 176.01
      && target.y >= 368 - 176.01 && target.y <= 368 + 176.01
    ),
    sample[1] + " must keep every endpoint and drawn stroke strictly inside the dance floor"
  );
});

for(let elapsed = 0; elapsed < 100000; elapsed += 1000) {
  showFrame = setLaserShow("dimension", "CYRK PARTY ZONE", elapsed, 100000);
  const sampledEndpoints = showFrame.laserShow.targets
    .concat(showFrame.laserShow.spotlightTargets)
    .concat(showFrame.laserShow.trailLines.reduce((points, line) => points.concat([
      { x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }
    ]), []));
  assert.ok(
    sampledEndpoints.every((target) =>
      target.x >= 240 - 176.01 && target.x <= 240 + 176.01
      && target.y >= 368 - 176.01 && target.y <= 368 + 176.01
    ),
    "CYRK DIMENSION must remain inside the protected dance-floor margin at " + elapsed + "ms"
  );
}

const dimensionBoundaries = [7000, 17000, 25000, 33000, 42000, 51000, 60000, 69000, 78000, 96000];
dimensionBoundaries.forEach(function(boundary) {
  showFrame = setLaserShow("dimension", "CYRK PARTY ZONE", boundary - 100, 100000);
  const before = showFrame.laserShow.targets.map((target) => ({ x: target.x, y: target.y }));
  now += 200;
  context.gameClient.renderer.debugger.__nFrames++;
  showFrame = weather.__getDiscoLightFrame();
  assert.ok(
    showFrame.laserShow.targets.every((target, index) =>
      Math.abs(target.x - before[index].x) < 0.01 && Math.abs(target.y - before[index].y) < 0.01
    ),
    "CYRK DIMENSION phase at " + boundary + "ms should depart from the previous physical laser positions"
  );
});

showFrame = setLaserShow("dimension", "CYRK PARTY ZONE", 85900, 100000);
const heartbeatDeparture = showFrame.laserShow.targets.map((target) => ({ x: target.x, y: target.y }));
now += 100;
context.gameClient.renderer.debugger.__nFrames++;
showFrame = weather.__getDiscoLightFrame();
assert.strictEqual(showFrame.laserShow.phase, "stacked-text");
assert.ok(
  showFrame.laserShow.targets.every((target, index) => Math.hypot(target.x - heartbeatDeparture[index].x, target.y - heartbeatDeparture[index].y) < 10),
  "the first stacked word should be approached physically from the heartbeat finale"
);

showFrame = setLaserShow("dimension", "CYRK PARTY ZONE", 95900, 100000);
assert.strictEqual(showFrame.laserShow.phase, "stacked-text");
assert.ok(showFrame.laserShow.trailLines.length > 35, "CYRK, PARTY and ZONE should all remain visible after being drawn on three rows");
const stackedYs = showFrame.laserShow.trailLines.reduce((values, line) => values.concat([line.y1, line.y2]), []);
assert.ok(Math.min.apply(null, stackedYs) < 368 - 100 && Math.max.apply(null, stackedYs) > 368 + 100, "the stacked inscription should fill the upper, middle and lower dance floor");
showFrame = setLaserShow("dimension", "CYRK PARTY ZONE", 99500, 100000);
assert.ok(showFrame.laserShow.amount > 0 && showFrame.laserShow.amount < 1, "CYRK DIMENSION should fade its framed inscription smoothly");
showFrame = setLaserShow("dimension", "CYRK PARTY ZONE", 100000, 100000);
assert.strictEqual(showFrame, null, "CYRK DIMENSION should release the venue lights after 100 seconds");

const arcadePhases = [
  [2000, "arcade-callout"],
  [18000, "insert-coin"],
  [30000, "arcade-tetris"],
  [50000, "arcade-pong"],
  [65000, "arcade-snake"],
  [80000, "space-invaders"],
  [90000, "arcade-party-finale"],
  [98500, "arcade-party-finale"]
];
arcadePhases.forEach(function(sample) {
  showFrame = setLaserShow("arcade", "NEON ARCADE", sample[0], 100000);
  assert.strictEqual(showFrame.laserShow.phase, sample[1]);
  assert.strictEqual(showFrame.laserShow.targets.length, 9);
});

for(let elapsed = 0; elapsed < 100000; elapsed += 1000) {
  showFrame = setLaserShow("arcade", "NEON ARCADE", elapsed, 100000);
  const arcadeEndpoints = showFrame.laserShow.targets
    .concat(showFrame.laserShow.spotlightTargets)
    .concat(showFrame.laserShow.trailLines.reduce((points, line) => points.concat([
      { x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }
    ]), []));
  assert.ok(
    arcadeEndpoints.every((target) =>
      target.x >= 240 - 176.01 && target.x <= 240 + 176.01
      && target.y >= 368 - 176.01 && target.y <= 368 + 176.01
    ),
    "NEON ARCADE must keep every endpoint, stroke and spotlight inside the protected floor at " + elapsed + "ms"
  );
}

const arcadeBoundaries = [16000, 21000, 42000, 58000, 74000, 88000];
arcadeBoundaries.forEach(function(boundary) {
  showFrame = setLaserShow("arcade", "NEON ARCADE", boundary - 100, 100000);
  const before = showFrame.laserShow.targets.map((target) => ({ x: target.x, y: target.y }));
  now += 200;
  context.gameClient.renderer.debugger.__nFrames++;
  showFrame = weather.__getDiscoLightFrame();
  assert.ok(
    showFrame.laserShow.targets.every((target, index) =>
      Math.abs(target.x - before[index].x) < 0.01 && Math.abs(target.y - before[index].y) < 0.01
    ),
    "NEON ARCADE phase at " + boundary + "ms should physically depart from the previous game object"
  );
});

[25200, 29400, 33600, 37800].forEach(function(boundary) {
  showFrame = setLaserShow("arcade", "NEON ARCADE", boundary - 1, 100000);
  const settledPiece = showFrame.laserShow.targets.map((target) => ({ x: target.x, y: target.y }));
  now += 1;
  context.gameClient.renderer.debugger.__nFrames++;
  showFrame = weather.__getDiscoLightFrame();
  assert.ok(
    showFrame.laserShow.targets.every((target, index) => Math.hypot(target.x - settledPiece[index].x, target.y - settledPiece[index].y) < 2),
    "the next Tetris piece should physically travel from the previously locked tetrimino at " + boundary + "ms"
  );
});

[[5900, 100], [10400, 100], [93999, 1]].forEach(function(sample) {
  showFrame = setLaserShow("arcade", "NEON ARCADE", sample[0], 100000);
  const before = showFrame.laserShow.targets.map((target) => ({ x: target.x, y: target.y }));
  now += sample[1];
  context.gameClient.renderer.debugger.__nFrames++;
  showFrame = weather.__getDiscoLightFrame();
  assert.ok(
    showFrame.laserShow.targets.every((target, index) => Math.hypot(target.x - before[index].x, target.y - before[index].y) < 22),
    "arcade message transition at " + sample[0] + "ms should hand its physical laser positions to the next centered message"
  );
});

showFrame = setLaserShow("arcade", "NEON ARCADE", 4700, 100000);
assert.ok(showFrame.laserShow.trailLines.length > 5, "LET'S should remain visible for its one-second presentation");
showFrame = setLaserShow("arcade", "NEON ARCADE", 9300, 100000);
assert.ok(showFrame.laserShow.trailLines.length > 2, "DO should be drawn in the same center position");
const doHeight = Math.max.apply(null, showFrame.laserShow.trailLines.map((line) => Math.max(line.y1, line.y2)))
  - Math.min.apply(null, showFrame.laserShow.trailLines.map((line) => Math.min(line.y1, line.y2)));
showFrame = setLaserShow("arcade", "NEON ARCADE", 14700, 100000);
assert.ok(showFrame.laserShow.trailLines.length > 4, "THIS should complete the arcade callout before becoming a coin");
const thisHeight = Math.max.apply(null, showFrame.laserShow.trailLines.map((line) => Math.max(line.y1, line.y2)))
  - Math.min.apply(null, showFrame.laserShow.trailLines.map((line) => Math.min(line.y1, line.y2)));
assert.ok(Math.abs(doHeight - thisHeight) < 1, "DO and THIS should use the same letter height");

showFrame = setLaserShow("arcade", "NEON ARCADE", 62000, 100000);
const firstFoodPosition = showFrame.laserShow.targets[8];
showFrame = setLaserShow("arcade", "NEON ARCADE", 71000, 100000);
assert.ok(
  Math.abs(showFrame.laserShow.targets[8].x - firstFoodPosition.x) < 0.01
  && Math.abs(showFrame.laserShow.targets[8].y - firstFoodPosition.y) < 0.01,
  "one laser should hold the Snake food dot still until the snake reaches it"
);
showFrame = setLaserShow("arcade", "NEON ARCADE", 99500, 100000);
assert.ok(showFrame.laserShow.amount > 0 && showFrame.laserShow.amount < 1, "PARTY ON should fade with the final arcade screen");
assert.ok(showFrame.laserShow.trailLines.length > 12, "the large two-line PARTY ON finale should remain visible through the closing effect");
showFrame = setLaserShow("arcade", "NEON ARCADE", 100000, 100000);
assert.strictEqual(showFrame, null, "NEON ARCADE should release the venue lights after 100 seconds");

function setVipShow(elapsedMs, preset, intensityName, effect, durationMs, participants, crowd) {
  effect = effect || "laser";
  durationMs = durationMs || 12000;
  weather.setDiscoLights(false, false, 80, 100, 120, 6, {
    x: 32515,
    y: 32346,
    z: 7,
  }, {
    targetId: 777,
    targetName: "Party Hero",
    source: "vip-show",
    targetPosition: { x: 32515, y: 32346, z: 7 },
    elapsedMs: elapsedMs,
    persistent: false,
    durationMs: durationMs,
    flashDurationMs: 0,
    flashCount: 0,
    includeLasers: true,
    vipShow: {
      effect: effect,
      preset: preset,
      intensity: intensityName,
      crowd: crowd === true,
      participants: participants || [],
    },
  }, null);
  context.gameClient.renderer.debugger.__nFrames++;
  return weather.__getDiscoLightFrame();
}

showFrame = setVipShow(2100, "rainbow", "normal");
assert.strictEqual(showFrame.vipShow.stage, "orbit");
assert.strictEqual(showFrame.spotlightsEnabled, true, "VIP show should temporarily enable all four spotlights");
assert.strictEqual(showFrame.legacyLasersEnabled, true, "VIP show should temporarily enable all three laser heads");
assert.strictEqual(showFrame.lights.length, 4, "VIP show must choreograph four spotlights");
assert.strictEqual(showFrame.vipLaserTargets.length, 9, "three laser heads must retain their three beams each");
assert.strictEqual(new Set(showFrame.vipLaserTargets.map((target) => target.x.toFixed(2) + ":" + target.y.toFixed(2))).size, 9);

showFrame = setVipShow(5200, "ice", "soft");
assert.strictEqual(showFrame.vipShow.stage, "tunnel");
assert.strictEqual(showFrame.vipShow.preset, "ice");
assert.ok(showFrame.vipShow.intensityMultiplier < 1);

showFrame = setVipShow(7900, "toxic", "normal");
assert.strictEqual(showFrame.vipShow.stage, "spiral");

showFrame = setVipShow(10400, "romance", "intense");
assert.strictEqual(showFrame.vipShow.stage, "finale");
assert.ok(showFrame.vipShow.intensityMultiplier > 1);
const vipStrokeCount = strokes;
weather.drawDiscoLights();
assert.ok(strokes > vipStrokeCount, "VIP finale should draw lasers, bass rings, neon orbits and its radial burst");

const specialEffects = [
  "hologram", "wings", "equalizer", "vortex", "portal", "comet", "rewind",
  "helix", "pixel", "soundwave", "cage", "duel", "discoball", "constellation",
  "combo", "name"
];
specialEffects.forEach((effect) => {
  const beforeFills = fills;
  const beforeStrokes = strokes;
  showFrame = setVipShow(5200, "rainbow", "normal", effect, 12000, [{
    targetId: 888,
    targetName: "Club Friend",
    targetPosition: { x: 32517, y: 32347, z: 7 },
  }]);
  assert.strictEqual(showFrame.vipShow.effect, effect, effect + " must survive ambience validation");
  weather.drawDiscoLights();
  assert.ok(fills > beforeFills || strokes > beforeStrokes, effect + " must render visible canvas geometry");
});

const crowdParticipants = [
  { targetId: 901, targetName: "North West", targetPosition: { x: 32514, y: 32345, z: 7 } },
  { targetId: 902, targetName: "North East", targetPosition: { x: 32516, y: 32345, z: 7 } },
  { targetId: 903, targetName: "South East", targetPosition: { x: 32516, y: 32347, z: 7 } },
  { targetId: 904, targetName: "South West", targetPosition: { x: 32514, y: 32347, z: 7 } },
];
const crowdEffects = ["laser", "circuit"].concat(specialEffects);
crowdEffects.forEach((effect) => {
  const beforeFills = fills;
  const beforeStrokes = strokes;
  showFrame = setVipShow(5200, "rainbow", "normal", effect, 12000, crowdParticipants, true);
  assert.strictEqual(showFrame.vipShow.crowd, true, effect + " must preserve crowd mode");
  assert.strictEqual(showFrame.vipShow.crowdCount, 4);
  assert.strictEqual(showFrame.vipShow.crowdLayout, "constellation");
  assert.strictEqual(showFrame.vipShow.centerX, 240, "crowd effects must use the dancers' shared center");
  assert.strictEqual(showFrame.vipShow.centerY, 368, "crowd effects must use the dancers' shared center");
  if(effect === "circuit") {
    assert.strictEqual(showFrame.vipShow.floorClip.width, 416, "circuit must cover exactly 13 SQMs horizontally");
    assert.strictEqual(showFrame.vipShow.floorClip.height, 416, "circuit must cover exactly 13 SQMs vertically");
    assert.strictEqual(showFrame.spotlightsEnabled, false, "circuit must not add lights outside its floor clip");
  }
  weather.drawDiscoLights();
  assert.ok(fills > beforeFills || strokes > beforeStrokes, effect + " must add visible crowd choreography");
});

showFrame = setVipShow(100, "fire", "intense", "all", 54000);
assert.strictEqual(showFrame.vipShow.effect, "laser");
assert.strictEqual(showFrame.vipShow.effectCount, 17, "targeted all mode must not include the dance-floor-only circuit");
showFrame = setVipShow(54000 / 17 * 4 + 200, "fire", "intense", "all", 54000);
assert.strictEqual(showFrame.vipShow.effect, "vortex", "all mode must advance through the complete choreography");
assert.strictEqual(showFrame.vipShow.title, undefined, "show scenes must expose no generic projection title");
assert.strictEqual(showFrame.vipShow.effectLabel, undefined, "internal projection names must stay hidden");

showFrame = setVipShow(100, "fire", "intense", "all", 54000, crowdParticipants, true);
assert.strictEqual(showFrame.vipShow.effectCount, 18, "crowd all mode must include the interactive circuit scene");

const chairStrokesBefore = strokes;
const chairSquares = [
  { x: 32512, y: 32344, z: 7 },
  { x: 32518, y: 32349, z: 7 }
];
weather.setDiscoLights(true, true, 80, 100, 120, 6, {
  x: 32515, y: 32346, z: 7
}, null, null, {
  phase: "claiming",
  elapsedMs: 1500,
  durationMs: 9300,
  drawDurationMs: 1600,
  round: 1,
  remaining: 3,
  floor: {
    from: { x: 32509, y: 32340, z: 7 },
    to: { x: 32521, y: 32352, z: 7 }
  },
  squares: chairSquares
});
context.gameClient.renderer.debugger.__nFrames++;
let chairFrame = weather.__getDiscoLightFrame();
assert.strictEqual(chairFrame.chairGame.phase, "claiming");
assert.strictEqual(chairFrame.chairLasers.targets.length, 9, "all nine permanent club lasers must receive an independent chair route");
assert.strictEqual(chairFrame.chairLasers.drawDurationMs, 1600, "up to nine squares should retain the fast choreography");
assert.ok(chairFrame.chairLasers.amount > 0.99, "club lasers must physically control their beams while drawing squares");
const lastClaimTargets = chairFrame.chairLasers.targets.map((target) => ({ x: target.x, y: target.y }));
const lastClaimAmount = chairFrame.chairLasers.amount;
weather.drawDiscoLights();
assert.ok(strokes >= chairStrokesBefore + 6, "Laser Chairs must draw the closed floor border and every SQM square");

weather.setDiscoLights(true, true, 80, 100, 120, 6, {
  x: 32515, y: 32346, z: 7
}, null, null, {
  phase: "result",
  elapsedMs: 0,
  durationMs: 1500,
  round: 1,
  remaining: 2,
  floor: {
    from: { x: 32509, y: 32340, z: 7 },
    to: { x: 32521, y: 32352, z: 7 }
  },
  squares: chairSquares
});
context.gameClient.renderer.debugger.__nFrames++;
chairFrame = weather.__getDiscoLightFrame();
assert.ok(Math.abs(chairFrame.chairLasers.amount - lastClaimAmount) < 0.001,
  "the return choreography must begin at the previous beam strength without blinking"
);
chairFrame.chairLasers.targets.forEach((target, index) => {
  assert.ok(Math.hypot(target.x - lastClaimTargets[index].x, target.y - lastClaimTargets[index].y) < 0.01,
    "a result transition must continue from each laser's previous endpoint without teleporting"
  );
});
now += 1400;
context.gameClient.renderer.debugger.__nFrames++;
chairFrame = weather.__getDiscoLightFrame();
assert.ok(chairFrame.chairLasers.amount < 0.01, "lasers must smoothly release back to their normal club movement");
assert.ok(chairFrame.chairLasers.trailLines.length >= 10, "the drawn border and chair squares must remain visible after the beams leave");

const crowdedChairFrame = weather.__getLaserChairsFrame({
  phase: "claiming",
  elapsedMs: 3100,
  receivedAt: now,
  durationMs: 10900,
  drawDurationMs: 3200,
  floor: {
    from: { x: 32509, y: 32340, z: 7 },
    to: { x: 32521, y: 32352, z: 7 }
  },
  squares: Array.from({ length: 19 }, (_, index) => ({
    x: 32509 + index % 13,
    y: 32340 + Math.floor(index / 13),
    z: 7
  }))
}, now);
assert.strictEqual(crowdedChairFrame.drawDurationMs, 3200,
  "twenty players should give nineteen squares a readable 3.2-second choreography"
);

console.log("PASS: disco spotlights illuminate, draw and move across the dance floor.");
