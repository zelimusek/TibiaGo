"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const mobileCss = fs.readFileSync(
  path.join(root, "client", "css", "mobile.css"),
  "utf8"
);
const slotSource = fs.readFileSync(
  path.join(root, "client", "src", "entities", "slot.js"),
  "utf8"
);

const mobileContainerRule = mobileCss.match(
  /\.window\[containerIndex\]\s*\{[\s\S]*?\n\s*\}/
);

assert(mobileContainerRule, "Mobile container positioning rule must exist.");
assert.match(mobileContainerRule[0], /width:\s*146px\s*!important/);

assert.match(
  mobileCss,
  /grid-template-columns:\s*repeat\(4,\s*32px\)/,
  "Mobile containers must keep exactly four slots per row."
);

assert.match(
  mobileCss,
  /\.slot canvas\s*\{[\s\S]*?width:\s*28px\s*!important[\s\S]*?height:\s*28px\s*!important/,
  "A 28px item sprite must stay inside its 32px mobile slot."
);

assert.match(
  slotSource,
  /this\.isEmpty\(\)\s*\|\|\s*!this\.item\.isAnimated\(\)/,
  "Static inventory items must not be repainted every rendered frame."
);

console.log("PASS: mobile containers use a compact four-slot grid and skip static redraws.");
