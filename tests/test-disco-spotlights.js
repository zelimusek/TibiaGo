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
assert.strictEqual(kGlyph.length, 4, "K should use one complete stem and two clean diagonals");
assert.strictEqual(mGlyph.length, 6, "M should use two complete stems and two inward diagonals");
assert.strictEqual(
  mGlyph.filter((line) => Math.abs(line.x1 - line.x2) < 0.01).length,
  4,
  "M should retain both upper and lower halves of its vertical legs"
);

const partialLetter = weather.__getLaserTextChoreography("K", 0.4, 240, 176, 6, 900);
assert.ok(partialLetter.trailLines.length > 0 && partialLetter.trailLines.length < kGlyph.length, "the current letter should appear stroke by stroke instead of all at once");
const firstStrokeTarget = weather.__getLaserTextChoreography("K", 0, 240, 176, 6, 700);
assert.strictEqual(
  new Set(firstStrokeTarget.targets.map((target) => target.x.toFixed(3) + ":" + target.y.toFixed(3))).size,
  1,
  "all lasers should meet at the first writing stroke before drawing begins"
);

let showFrame = setLaserShow("default", "CYRK", 0, 30000);
assert.strictEqual(showFrame.laserShow.phase, "opening");
assert.strictEqual(showFrame.laserShow.targets.length, 9);
assert.strictEqual(showFrame.spotlightsEnabled, true, "laser shows should temporarily enable their four choreographed spotlights");
assert.strictEqual(showFrame.legacyLasersEnabled, true, "laser shows should temporarily enable all nine laser beams");

showFrame = setLaserShow("default", "CYRK", 5000, 30000);
assert.strictEqual(showFrame.laserShow.phase, "double-spiral");
assert.strictEqual(new Set(showFrame.laserShow.targets.map((target) => target.x.toFixed(2) + ":" + target.y.toFixed(2))).size, 9);
showFrame = setLaserShow("default", "CYRK", 9000, 30000);
assert.strictEqual(showFrame.laserShow.phase, "star");
showFrame = setLaserShow("default", "CYRK", 13000, 30000);
assert.strictEqual(showFrame.laserShow.phase, "wave");
showFrame = setLaserShow("default", "CYRK", 17000, 30000);
assert.strictEqual(showFrame.laserShow.phase, "tunnel");

showFrame = setLaserShow("default", "CYRK", 22000, 30000);
assert.strictEqual(showFrame.laserShow.phase, "text");
assert.ok(showFrame.laserShow.trailLines.length > 0, "the CYRK phase should retain already drawn laser letter strokes");
strokes = 0;
arcRadii = [];
weather.drawDiscoLights();
assert.ok(strokes > 9, "letter trails should be drawn in addition to the nine controlled beams");
assert.strictEqual(arcRadii.length, 9, "each choreographed laser should retain its bright endpoint dot");

showFrame = setLaserShow("default", "CYRK", 28000, 30000);
assert.strictEqual(showFrame.laserShow.phase, "finale");
showFrame = setLaserShow("text", "PARTY ZONE", 7000, 18600);
assert.strictEqual(showFrame.laserShow.phase, "text");
assert.ok(showFrame.laserShow.trailLines.length > 0, "custom text should use the synchronized vector laser alphabet");
showFrame = setLaserShow("default", "CYRK", 29500, 30000);
assert.ok(showFrame.laserShow.amount > 0 && showFrame.laserShow.amount < 1, "the final 1.3 seconds should fade the show smoothly");
showFrame = setLaserShow("default", "CYRK", 30000, 30000);
assert.strictEqual(showFrame, null, "a completed show should release temporarily enabled venue lights");

console.log("PASS: disco spotlights illuminate, draw and move across the dance floor.");
