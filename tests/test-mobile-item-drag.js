"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const touchSource = fs.readFileSync(
  path.join(root, "client", "src", "input", "touch.js"),
  "utf8"
);
const mouseSource = fs.readFileSync(
  path.join(root, "client", "src", "input", "mouse.js"),
  "utf8"
);
const mobileCss = fs.readFileSync(
  path.join(root, "client", "css", "mobile.css"),
  "utf8"
);

assert.match(
  touchSource,
  /Math\.hypot\(dx,\s*dy\)\s*<\s*8/,
  "A tap must not become an item drag before the finger crosses the movement threshold."
);
assert.match(
  touchSource,
  /gameClient\.mouse\.moveItem\(drag\.fromObject,\s*toObject\)/,
  "A completed mobile drag must use the shared item-move path."
);
assert.match(
  touchSource,
  /document\.elementFromPoint\(touch\.clientX,\s*touch\.clientY\)/,
  "The drop destination must be resolved from the finger release position."
);
assert.match(
  touchSource,
  /new Canvas\(canvasElement,\s*32,\s*32\)[\s\S]*?drawSprite/,
  "Ground items must receive a visible sprite drag indicator."
);
assert.match(
  mouseSource,
  /Mouse\.prototype\.moveItem[\s\S]*?__moveItemWhenClose/,
  "Dragging a distant ground item must preserve automatic walk-and-move behaviour."
);
assert.match(
  mobileCss,
  /\.mobile-item-drag-indicator\s*\{[\s\S]*?pointer-events:\s*none/,
  "The drag indicator must not hide the drop target from hit testing."
);

console.log("PASS: mobile item dragging has a threshold, visible indicator and shared drop logic.");
