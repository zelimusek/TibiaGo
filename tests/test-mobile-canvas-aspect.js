"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const cssFile = path.join(
  __dirname,
  "..",
  "client",
  "css",
  "mobile.css"
);
const css = fs.readFileSync(cssFile, "utf8");

const mobileCanvasRule = css.match(
  /\.canvas-wrapper\s*\{[^}]*aspect-ratio:\s*480\s*\/\s*352\s*;[^}]*\}/s
);

assert.ok(
  mobileCanvasRule,
  "The mobile canvas wrapper must preserve the native 480x352 viewport ratio."
);
assert.match(
  mobileCanvasRule[0],
  /width:\s*min\(100%,\s*136\.363636dvh\)\s*!important/,
  "The canvas should fit both portrait width and landscape height without stretching."
);
assert.match(mobileCanvasRule[0], /min-width:\s*0/);
assert.match(mobileCanvasRule[0], /min-height:\s*0/);

const nativeRatio = 480 / 352;

function fittedCanvas(viewportWidth, viewportHeight) {
  const width = Math.min(viewportWidth, viewportHeight * nativeRatio);
  return {
    width,
    height: width / nativeRatio,
  };
}

for (const viewport of [
  { width: 390, height: 844, name: "portrait" },
  { width: 844, height: 390, name: "landscape" },
]) {
  const canvas = fittedCanvas(viewport.width, viewport.height);
  const scaleX = canvas.width / 480;
  const scaleY = canvas.height / 352;

  assert.ok(
    Math.abs(scaleX - scaleY) < Number.EPSILON,
    `${viewport.name} must use the same visual scale for horizontal and vertical steps.`
  );
  assert.ok(canvas.width <= viewport.width);
  assert.ok(canvas.height <= viewport.height);
}

console.log("PASS: mobile canvas preserves equal X/Y scale in both orientations.");
