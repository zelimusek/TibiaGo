"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "ui", "screen-element-character.js"),
  "utf8"
);
const baseSource = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "ui", "screen-element.js"),
  "utf8"
);
const css = fs.readFileSync(
  path.join(__dirname, "..", "client", "css", "screen-element.css"),
  "utf8"
);

assert.match(
  source,
  /this\.element\.style\.transition\s*=\s*""/,
  "Character nameplates must update on the same frame as creature sprites."
);
assert.doesNotMatch(
  source,
  /transition\s*=\s*"transform 0\.05s linear"/,
  "Mobile nameplates must not trail behind the canvas with a CSS transition."
);
assert.match(
  source,
  /this\.__updateTextPosition\(offset,\s*false\)/,
  "Creature nameplates must not be clamped onto a screen edge."
);
assert.match(
  source,
  /offset\.top\s*\+=\s*scale\.y\s*\*\s*this\.__getPlateVerticalAdjustment\(isMobile\)/,
  "Character plate alignment must scale with the rendered SQM height."
);
assert.match(
  source,
  /return\s+isPortrait\s*\?\s*0\.18\s*:\s*0\.14/,
  "Untitled mobile plates must use orientation-aware vertical alignment."
);
assert.match(
  source,
  /return\s+hasTitle\s*\?\s*-0\.1875\s*:\s*0/,
  "Titled desktop plates must be raised without moving untitled plates."
);
assert.match(
  source,
  /if\s*\(!isMobile\s*&&\s*hasVisiblePartyTitle\)\s*\{\s*offset\.top\s*\+=\s*1/,
  "The final desktop title adjustment must be exactly one CSS pixel."
);
assert.match(
  source,
  /offset\.top\s*\+=\s*this\.__getNpcPlateVerticalAdjustment\(\)/,
  "NPC plates must compensate for the trade icon below their HP bar."
);
assert.match(
  source,
  /\(height\s*\+\s*marginTop\s*\+\s*marginBottom\)\s*\/\s*2/,
  "NPC alignment must use half of the icon's actual outer height."
);
assert.match(
  baseSource,
  /this\.hide\(\)/,
  "A cloned screen element must remain hidden until it has a valid position."
);
assert.doesNotMatch(
  baseSource,
  /setTimeout\(\(\)\s*=>\s*this\.show\(\)\)/,
  "A delayed show must not resurrect an NPC label after it was hidden."
);
assert.match(
  baseSource,
  /if\s*\(clampToScreen\s*!==\s*false\)/,
  "Only screen elements that opt in should be clamped to the viewport."
);
assert.match(
  css,
  /#text-wrapper[\s\S]*?overflow:\s*hidden/,
  "Off-screen nameplates must be clipped by the game overlay."
);

console.log("PASS: mobile character plates stay synchronized and cannot ghost at the screen edge.");
