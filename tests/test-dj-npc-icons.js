"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "client", "src", "ui", "screen-element-character.js"),
  "utf8"
);
const iconPath = path.join(root, "client", "png", "npc_icons", "icon_dj.png");
const icon = PNG.sync.read(fs.readFileSync(iconPath));

assert.match(source, /"DJ Thomas"/, "DJ Thomas must receive the DJ icon.");
assert.match(source, /"DJ Hubertuse"/, "DJ Hubertuse must receive the DJ icon.");
assert.match(
  source,
  /PARTY_DJ_NPC_NAMES\.has\(this\.__creature\.name\)[\s\S]*icon_dj\.png[\s\S]*icon_trade\.png/,
  "Only the named Party Zone DJs should override the regular NPC trade icon."
);
assert.strictEqual(icon.width, 18, "DJ icon must match the existing NPC icon width.");
assert.strictEqual(icon.height, 18, "DJ icon must match the existing NPC icon height.");

let transparentPixels = 0;
let visiblePixels = 0;
for (let index = 3; index < icon.data.length; index += 4) {
  if (icon.data[index] === 0) transparentPixels += 1;
  if (icon.data[index] > 0) visiblePixels += 1;
}

assert.ok(transparentPixels > 0, "DJ icon must retain a transparent background.");
assert.ok(visiblePixels > 0, "DJ icon must contain visible musical-note pixels.");

console.log("DJ NPC icon regression tests passed.");
