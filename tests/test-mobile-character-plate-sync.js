"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "ui", "screen-element-character.js"),
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

console.log("PASS: mobile character nameplates stay synchronized with creature sprites.");
